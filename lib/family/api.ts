/**
 * Signed API client for the Cloudflare family Worker. Every mutating call is
 * Ed25519-signed with the device key; the live stream is a WebSocket authed by
 * a short-lived ticket.
 */
import Constants from 'expo-constants';

import {
  b64uEncode,
  canonicalMessage,
  randomRequestId,
  sign,
  signX25519Binding,
  utf8,
} from '@/lib/family/crypto';
import type { Identity } from '@/lib/family/identity';

const DEFAULT_BASE = 'https://api.baltic72.com';
const BASE = String(Constants.expoConfig?.extra?.familyApiUrl ?? DEFAULT_BASE).replace(/\/$/, '');

export function isConfigured(): boolean {
  return BASE.length > 0;
}

export type MemberRow = {
  device_id: string;
  pub_x25519: string;
  pub_ed25519: string;
  x25519_sig: string | null;
  role: string;
  display_ciphertext: string | null;
  status_ciphertext: string | null;
  status_updated_at: number | null;
};

export type WsEvent =
  | { type: 'status'; deviceId: string; status_ciphertext: string | null; display_ciphertext: string | null; ts: number }
  | { type: 'member_joined'; deviceId: string; ts: number }
  | { type: 'key_envelope'; deviceId: string; senderDeviceId: string; ts: number }
  | { type: 'member_left'; deviceId: string; ts: number };

export type PushSubscriptionPayload = {
  platform: 'ios' | 'android';
  token: string;
  environment?: 'sandbox' | 'production';
  countries: string[];
  locale?: string;
  appVersion?: string;
  familyEnabled?: boolean;
};

async function signedRequest<T>(
  identity: Identity,
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const ts = String(Date.now());
  const requestId = randomRequestId();
  const bodyStr = body !== undefined ? JSON.stringify(body) : '';
  const msg = canonicalMessage(method, path, ts, utf8(bodyStr), requestId);
  const signature = b64uEncode(sign(msg, identity.edPriv));

  const res = await fetch(BASE + path, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-device-id': identity.deviceId,
      'x-timestamp': ts,
      'x-request-id': requestId,
      'x-signature': signature,
    },
    body: method === 'GET' ? undefined : bodyStr,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`API ${method} ${path} → ${res.status} ${detail}`);
  }
  return (await res.json()) as T;
}

/** Open registration: the server derives the id from the key, so no signature. */
export async function registerDevice(identity: Identity): Promise<void> {
  const res = await fetch(BASE + '/v1/devices', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      pub_x25519: b64uEncode(identity.xPub),
      pub_ed25519: b64uEncode(identity.edPub),
      // Binds the X25519 key to the Ed25519 identity so peers can detect a
      // server-side key substitution (MITM) — see signX25519Binding.
      x25519_sig: b64uEncode(signX25519Binding(identity.edPriv, identity.xPub)),
    }),
  });
  if (!res.ok) throw new Error(`register device failed: ${res.status}`);
}

export function createGroup(
  identity: Identity,
  payload: { display_ciphertext?: string; status_ciphertext?: string }
) {
  return signedRequest<{ groupId: string }>(identity, 'POST', '/v1/groups', payload);
}

export function createInvite(
  identity: Identity,
  groupId: string,
  opts: { ttlHours?: number; maxUses?: number } = {}
) {
  return signedRequest<{ token: string; groupId: string; expiresAt: number }>(
    identity,
    'POST',
    `/v1/groups/${groupId}/invites`,
    opts
  );
}

export type KeyEnvelopeRow = {
  group_id: string;
  recipient_device_id: string;
  sender_device_id: string;
  sender_pub_x25519: string;
  sender_pub_ed25519: string;
  sender_x25519_sig: string | null;
  key_epoch: number;
  ciphertext: string;
  created_at: number;
};

export function putKeyEnvelope(
  identity: Identity,
  groupId: string,
  recipientDeviceId: string,
  payload: { key_epoch: number; ciphertext: string }
) {
  return signedRequest<{ ok: boolean }>(
    identity,
    'PUT',
    `/v1/groups/${groupId}/key-envelopes/${recipientDeviceId}`,
    payload
  );
}

export function getMyKeyEnvelopes(identity: Identity, groupId: string) {
  return signedRequest<{ envelopes: KeyEnvelopeRow[] }>(
    identity,
    'GET',
    `/v1/groups/${groupId}/key-envelopes/me`
  );
}

export function joinGroup(
  identity: Identity,
  groupId: string,
  payload: { token: string; display_ciphertext?: string; status_ciphertext?: string }
) {
  return signedRequest<{ ok: boolean; groupId: string }>(
    identity,
    'POST',
    `/v1/groups/${groupId}/join`,
    payload
  );
}

export function updateMe(
  identity: Identity,
  groupId: string,
  payload: { status_ciphertext?: string; display_ciphertext?: string }
) {
  return signedRequest<{ ok: boolean; ts: number }>(
    identity,
    'PUT',
    `/v1/groups/${groupId}/me`,
    payload
  );
}

export function getSnapshot(identity: Identity, groupId: string) {
  return signedRequest<{ groupId: string; keyEpoch: number; members: MemberRow[] }>(
    identity,
    'GET',
    `/v1/groups/${groupId}`
  );
}

/** Owner-only: advance the group's key epoch (e.g. after a member is removed). */
export function rotateGroup(identity: Identity, groupId: string, epoch: number) {
  return signedRequest<{ ok: boolean; keyEpoch: number }>(
    identity,
    'POST',
    `/v1/groups/${groupId}/rotate`,
    { epoch }
  );
}

export function removeMember(identity: Identity, groupId: string, deviceId: string) {
  return signedRequest<{ ok: boolean }>(
    identity,
    'DELETE',
    `/v1/groups/${groupId}/members/${deviceId}`
  );
}

export function registerPushSubscription(identity: Identity, payload: PushSubscriptionPayload) {
  return signedRequest<{ id: string; enabled: boolean; familyEnabled: boolean; countries: string[] }>(
    identity,
    'PUT',
    '/v1/push/subscription',
    payload
  );
}

export function updatePushPreferences(
  identity: Identity,
  payload: { countries?: string[]; familyEnabled?: boolean }
) {
  return signedRequest<{ ok: boolean }>(identity, 'PUT', '/v1/push/preferences', payload);
}

export function clearPushSubscriptions(identity: Identity) {
  return signedRequest<{ ok: boolean }>(identity, 'DELETE', '/v1/push/subscription');
}

async function getWsTicket(identity: Identity, groupId: string): Promise<string> {
  const { ticket } = await signedRequest<{ ticket: string }>(
    identity,
    'POST',
    `/v1/groups/${groupId}/ws-ticket`
  );
  return ticket;
}

export async function connectGroupSocket(
  identity: Identity,
  groupId: string,
  handlers: { onEvent: (e: WsEvent) => void; onClose?: () => void; onOpen?: () => void }
): Promise<WebSocket> {
  const ticket = await getWsTicket(identity, groupId);
  const wsBase = BASE.replace(/^http/, 'ws');
  // Pass the ticket as a WebSocket subprotocol instead of a URL query param so it
  // never lands in proxy/access logs. The server reads it from the
  // Sec-WebSocket-Protocol header and echoes it back to accept the connection.
  const ws = new WebSocket(`${wsBase}/v1/groups/${groupId}/ws`, [`b72.ticket.${ticket}`]);
  let pingTimer: ReturnType<typeof setInterval> | null = null;
  ws.onopen = () => {
    // Keepalive so idle proxies/intermediaries don't drop the connection.
    pingTimer = setInterval(() => {
      try {
        ws.send('ping');
      } catch {
        /* socket closing */
      }
    }, 25000);
    handlers.onOpen?.();
  };
  ws.onmessage = (ev) => {
    const data = String(ev.data);
    if (data === 'pong') return;
    try {
      handlers.onEvent(JSON.parse(data) as WsEvent);
    } catch {
      // ignore malformed frames
    }
  };
  ws.onerror = () => {
    // Surfaced via onclose; nothing to do here, but the handler avoids unhandled errors.
  };
  ws.onclose = () => {
    if (pingTimer) clearInterval(pingTimer);
    handlers.onClose?.();
  };
  return ws;
}
