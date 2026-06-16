// Durable Object: one instance per family group. It holds the live WebSocket
// connections for that group and fans out status changes to everyone connected.
// It stores no plaintext — it only relays opaque ciphertext envelopes.

import type { DurableObjectState } from '@cloudflare/workers-types';

import { isValidDeviceId, isValidRequestId } from './auth';

// The DO only needs the shared internal secret for defense-in-depth auth on the
// /broadcast and /disconnect-device endpoints (these are reachable only via the
// binding, but we still verify a shared header).
type Env = {
  TICKET_SECRET: string;
};

type SocketAttachment = {
  deviceId: string;
  jti: string;
  connectedAt: number;
};

const MAX_BROADCAST_BYTES = 8 * 1024;
const TICKET_JTI_TTL_MS = 5 * 60_000;
const TICKET_CLEANUP_MAX_PAGES = 20;
const TICKET_CLEANUP_PAGE_SIZE = 100;

function deviceTag(deviceId: string): string {
  return `device:${deviceId}`;
}

const TICKET_SUBPROTOCOL_PREFIX = 'b72.ticket.';

// Parse the `b72.ticket.<ticket>` entry out of a (possibly comma-separated)
// Sec-WebSocket-Protocol header; returns the full offered value to echo back.
function selectTicketSubprotocol(headerValue: string | null): string | null {
  if (!headerValue) return null;
  for (const part of headerValue.split(',')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(TICKET_SUBPROTOCOL_PREFIX)) return trimmed;
  }
  return null;
}

const enc = new TextEncoder();

function timingSafeEqualString(a: string, b: string): boolean {
  const left = enc.encode(a);
  const right = enc.encode(b);
  const max = Math.max(left.byteLength, right.byteLength);
  let diff = left.byteLength ^ right.byteLength;
  for (let i = 0; i < max; i += 1) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return diff === 0;
}

async function readCappedText(request: Request, maxBytes: number): Promise<string> {
  const rawLength = request.headers.get('content-length');
  if (rawLength) {
    const length = Number(rawLength);
    if (!Number.isFinite(length) || length < 0) return '';
    if (length > maxBytes) return '';
  }
  if (!request.body) return '';

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) return '';
    chunks.push(value);
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(out);
}

export class FamilyGroup {
  state: DurableObjectState;
  env: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  private isInternalAuthorized(request: Request): boolean {
    const provided = request.headers.get('x-b72-internal') ?? '';
    const secret = this.env?.TICKET_SECRET ?? '';
    return secret.length > 0 && timingSafeEqualString(provided, secret);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // WebSocket upgrade (already authenticated by the Worker via ticket).
    if (url.pathname.endsWith('/ws')) {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('expected websocket', { status: 426 });
      }

      const deviceId = request.headers.get('x-b72-device-id') ?? '';
      const jti = request.headers.get('x-b72-ticket-jti') ?? '';
      const exp = Number(request.headers.get('x-b72-ticket-exp') ?? 0);
      if (!isValidDeviceId(deviceId) || !isValidRequestId(jti) || !Number.isFinite(exp)) {
        return new Response('unauthorized', { status: 401 });
      }

      await this.cleanupUsedTickets(Date.now());
      if (!(await this.useTicketJti(jti, exp))) {
        return new Response('ticket replay', { status: 401 });
      }

      for (const ws of this.state.getWebSockets(deviceTag(deviceId))) {
        try {
          ws.close(4000, 'replaced');
        } catch {
          // already closed
        }
      }

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      const attachment: SocketAttachment = { deviceId, jti, connectedAt: Date.now() };
      server.serializeAttachment(attachment);
      // Hibernatable WebSockets: survives DO eviction without keeping it pinned.
      this.state.acceptWebSocket(server, [deviceTag(deviceId)]);

      // If the client offered the ticket via Sec-WebSocket-Protocol, echo the
      // selected subprotocol back so RN's WebSocket accepts the 101 handshake.
      const offeredSubprotocol =
        request.headers.get('x-b72-ws-subprotocol') ?? selectTicketSubprotocol(request.headers.get('Sec-WebSocket-Protocol'));
      const responseHeaders = offeredSubprotocol
        ? new Headers({ 'Sec-WebSocket-Protocol': offeredSubprotocol })
        : undefined;
      return new Response(null, { status: 101, webSocket: client, headers: responseHeaders });
    }

    // Internal broadcast endpoint, called by the Worker after a D1 write.
    if (url.pathname.endsWith('/broadcast') && request.method === 'POST') {
      if (!this.isInternalAuthorized(request)) return new Response('unauthorized', { status: 401 });
      const body = await readCappedText(request, MAX_BROADCAST_BYTES);
      if (!body) return new Response('payload too large', { status: 413 });
      for (const ws of this.state.getWebSockets()) {
        try {
          ws.send(body);
        } catch {
          // drop dead sockets silently
        }
      }
      return new Response('ok');
    }

    // Internal disconnect endpoint, called after membership removal and before
    // the next broadcast so removed devices no longer receive live updates.
    if (url.pathname.endsWith('/disconnect-device') && request.method === 'POST') {
      if (!this.isInternalAuthorized(request)) return new Response('unauthorized', { status: 401 });
      const body = await readCappedText(request, 512);
      if (!body) return new Response('invalid payload', { status: 400 });

      let parsed: unknown;
      try {
        parsed = JSON.parse(body);
      } catch {
        return new Response('invalid json', { status: 400 });
      }

      const deviceId =
        parsed && typeof parsed === 'object' && !Array.isArray(parsed)
          ? (parsed as { deviceId?: unknown }).deviceId
          : undefined;
      if (typeof deviceId !== 'string' || !isValidDeviceId(deviceId)) {
        return new Response('invalid device id', { status: 400 });
      }

      let closed = 0;
      for (const ws of this.state.getWebSockets(deviceTag(deviceId))) {
        try {
          ws.close(4001, 'removed');
          closed += 1;
        } catch {
          // already closed
        }
      }
      return Response.json({ ok: true, closed });
    }

    return new Response('not found', { status: 404 });
  }

  // Clients don't need to send anything; reply to pings to keep links healthy.
  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (message === 'ping') ws.send('pong');
  }

  webSocketClose(ws: WebSocket, code: number) {
    try {
      ws.close(code, 'closing');
    } catch {
      // already closed
    }
  }

  private async useTicketJti(jti: string, expSeconds: number): Promise<boolean> {
    const nowMs = Date.now();
    const expMs = Math.max(expSeconds * 1000, nowMs + TICKET_JTI_TTL_MS);
    return this.state.storage.transaction(async (txn) => {
      const key = `ticket:${jti}`;
      const existing = await txn.get<number>(key);
      if (existing && existing > nowMs) return false;
      await txn.put(key, expMs);
      return true;
    });
  }

  private async cleanupUsedTickets(nowMs: number): Promise<void> {
    // Page through used-ticket keys so they can't accumulate unbounded under
    // churn. Bounded per call (a few pages) to keep the cost cheap.
    let startAfter: string | undefined;
    for (let page = 0; page < TICKET_CLEANUP_MAX_PAGES; page += 1) {
      const entries = await this.state.storage.list<number>({
        prefix: 'ticket:',
        limit: TICKET_CLEANUP_PAGE_SIZE,
        startAfter,
      });
      if (entries.size === 0) break;
      const expired: string[] = [];
      let lastKey: string | undefined;
      for (const [key, expMs] of entries) {
        lastKey = key;
        if (expMs <= nowMs) expired.push(key);
      }
      if (expired.length > 0) await this.state.storage.delete(expired);
      if (entries.size < TICKET_CLEANUP_PAGE_SIZE) break;
      startAfter = lastKey;
    }
  }
}
