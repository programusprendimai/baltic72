// Baltic72 Family — edge API.
// End-to-end encrypted: the server relays public keys + ciphertext only.
// Auth: every mutating call is signed by the caller's Ed25519 device key.

import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { cors } from 'hono/cors';

import { FamilyGroup } from './group';
import {
  b64uEncode,
  canonicalMessage,
  decodeB64uBytes,
  deviceIdFromEdPub,
  isValidCiphertext,
  isValidDeviceId,
  isValidGroupId,
  isValidRequestId,
  isValidToken,
  signTicket,
  sha256,
  validateTicketSecret,
  verifyEd25519,
  verifyTicket,
  x25519BindingMessage,
} from './auth';
import {
  claimFamilyNotificationSlot,
  clearPushSubscriptions,
  createFamilyNotification,
  createAlert,
  getAlertStatus,
  parseAlertInput,
  parseCountries,
  parseEnvironment,
  parsePlatform,
  processDeadLetterBatch,
  processAlertBatch,
  registerPushSubscription,
  updatePushPreferences,
  validatePushToken,
  type AlertQueueMessage,
  type FamilyNotificationType,
} from './notifications';

export { FamilyGroup };

type Env = {
  DB: D1Database;
  GROUP: DurableObjectNamespace;
  TICKET_SECRET: string;
  ADMIN_TOKEN: string;
  APNS_KEY_ID: string;
  APNS_TEAM_ID: string;
  APNS_BUNDLE_ID: string;
  APNS_PRIVATE_KEY: string;
  FCM_SERVICE_ACCOUNT_JSON?: string;
  FCM_ANDROID_PACKAGE_NAME?: string;
  ALERT_QUEUE: Queue<AlertQueueMessage>;
  // R2 bucket holding the normalized open-data shelter snapshot
  // (manifest.json + shelters.json), uploaded by the data pipeline / CI.
  SHELTERS: R2Bucket;
};

type Vars = {
  deviceId: string;
  bodyBytes: Uint8Array | undefined;
  requestId: string | undefined;
};

type AppBindings = { Bindings: Env; Variables: Vars };
type AppContext = Context<AppBindings>;
type JsonObject = Record<string, unknown>;

const MAX_CIPHERTEXT_BYTES = 3072;
const MAX_JSON_BODY_BYTES = 16 * 1024;
const MAX_SIGNED_BODY_BYTES = MAX_JSON_BODY_BYTES;
const SIGNED_REQUEST_TTL_MS = 120_000;
const MAX_INVITE_TTL_HOURS = 24;
const MAX_INVITE_TTL_MS = MAX_INVITE_TTL_HOURS * 3_600_000;
const MAX_INVITE_USES = 1;
const RATE_WINDOW_MS = 60_000;
const MAX_GROUPS_PER_DEVICE = 20;
const MAX_OUTSTANDING_INVITES = 25;
const FAMILY_STATUS_NOTIFY_COOLDOWN_MS = 60_000;
const SHELTER_ORIGIN_ALLOWLIST = new Set(['api.baltic72.com']);
const CANONICAL_SHELTER_DATA_URL = 'https://api.baltic72.com/shelters/data';
const WS_TICKET_SUBPROTOCOL_PREFIX = 'b72.ticket.';

const app = new Hono<AppBindings>();
const now = () => Date.now();
const enc = new TextEncoder();
const dec = new TextDecoder();

class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

app.use(
  '*',
  cors({
    origin: '*',
    allowHeaders: ['content-type', 'x-device-id', 'x-timestamp', 'x-signature', 'x-request-id'],
  })
);

app.onError((err) => {
  if (err instanceof HttpError) return jsonError(err.message, err.status);
  console.error(JSON.stringify({ level: 'error', event: 'unhandled_error', message: err.message }));
  return jsonError('internal error', 500);
});

function jsonError(error: string, status: number): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function securityLog(event: string, fields: JsonObject = {}) {
  console.warn(JSON.stringify({ level: 'warn', event, ...fields }));
}

function randomToken(bytes = 24): string {
  const u8 = new Uint8Array(bytes);
  crypto.getRandomValues(u8);
  return b64uEncode(u8);
}

function durableFor(env: Env, groupId: string) {
  return env.GROUP.get(env.GROUP.idFromName(groupId));
}

function resultChanges(result: D1Result<unknown>): number {
  const meta = result.meta as { changes?: number } | undefined;
  return typeof meta?.changes === 'number' ? meta.changes : 0;
}

async function readBodyBytes(request: Request, maxBytes: number): Promise<Uint8Array> {
  const rawLength = request.headers.get('content-length');
  if (rawLength) {
    const length = Number(rawLength);
    if (!Number.isFinite(length) || length < 0) throw new HttpError(400, 'invalid content-length');
    if (length > maxBytes) throw new HttpError(413, 'request body too large');
  }

  if (!request.body) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) throw new HttpError(413, 'request body too large');
    chunks.push(value);
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

function parseJsonBytes<T extends JsonObject>(bytes: Uint8Array): T {
  if (bytes.byteLength === 0) return {} as T;
  let parsed: unknown;
  try {
    parsed = JSON.parse(dec.decode(bytes));
  } catch {
    throw new HttpError(400, 'invalid json');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new HttpError(400, 'invalid json');
  }
  return parsed as T;
}

async function parseJsonBody<T extends JsonObject>(c: AppContext, maxBytes = MAX_JSON_BODY_BYTES): Promise<T> {
  const cached = c.get('bodyBytes');
  const bytes = cached ?? (await readBodyBytes(c.req.raw, maxBytes));
  return parseJsonBytes<T>(bytes);
}

function getGroupId(c: AppContext): string {
  const groupId = c.req.param('id');
  if (!groupId || !isValidGroupId(groupId)) throw new HttpError(400, 'invalid group id');
  return groupId;
}

function normalizeCiphertext(value: unknown, field: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string' || !isValidCiphertext(value, MAX_CIPHERTEXT_BYTES)) {
    throw new HttpError(400, `invalid ${field}`);
  }
  return value;
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number, field: string): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
    throw new HttpError(400, `invalid ${field}`);
  }
  if (value < min || value > max) throw new HttpError(400, `invalid ${field}`);
  return value;
}

function requireTicketSecret(env: Env): string {
  if (!validateTicketSecret(env.TICKET_SECRET)) {
    securityLog('ticket_secret_invalid');
    throw new HttpError(500, 'server misconfigured');
  }
  return env.TICKET_SECRET.trim();
}

function requireAdminToken(env: Env): string {
  if (typeof env.ADMIN_TOKEN !== 'string' || env.ADMIN_TOKEN.trim().length < 32) {
    securityLog('admin_token_invalid');
    throw new HttpError(500, 'server misconfigured');
  }
  return env.ADMIN_TOKEN.trim();
}

function rateLimitRoute(method: string, pathname: string): string {
  const parts = pathname.split('/').filter(Boolean);

  if (parts[0] === 'v1') {
    if (parts.length === 2 && parts[1] === 'devices') return '/v1/devices';
    if (parts.length === 2 && parts[1] === 'groups') return '/v1/groups';
    if (parts[1] === 'groups' && parts.length >= 3) {
      if (parts.length === 3) return '/v1/groups/:id';
      if (parts.length === 4 && parts[3] === 'invites') return '/v1/groups/:id/invites';
      if (parts.length === 4 && parts[3] === 'join') return '/v1/groups/:id/join';
      if (parts.length === 4 && parts[3] === 'me') return '/v1/groups/:id/me';
      if (parts.length === 4 && parts[3] === 'ws-ticket') return '/v1/groups/:id/ws-ticket';
      if (parts.length === 4 && parts[3] === 'ws') return '/v1/groups/:id/ws';
      if (parts.length === 4 && parts[3] === 'rotate') return '/v1/groups/:id/rotate';
      if (parts.length === 5 && parts[3] === 'key-envelopes') {
        return method === 'GET' && parts[4] === 'me'
          ? '/v1/groups/:id/key-envelopes/me'
          : '/v1/groups/:id/key-envelopes/:deviceId';
      }
      if (parts.length === 5 && parts[3] === 'members') return '/v1/groups/:id/members/:deviceId';
      return '/v1/groups/*';
    }
    if (parts.length === 3 && parts[1] === 'push' && parts[2] === 'subscription') return '/v1/push/subscription';
    if (parts.length === 3 && parts[1] === 'push' && parts[2] === 'preferences') return '/v1/push/preferences';
    return '/v1/*';
  }

  if (parts[0] === 'admin') {
    if (parts.length === 2 && parts[1] === 'alerts') return '/admin/alerts';
    if (parts.length === 3 && parts[1] === 'alerts') return '/admin/alerts/:id';
    if (parts.length === 2 && parts[1] === 'smoke') return '/admin/smoke';
    return '/admin/*';
  }

  if (parts[0] === 'shelters') {
    if (parts.length === 2 && parts[1] === 'manifest') return '/shelters/manifest';
    if (parts.length === 2 && parts[1] === 'data') return '/shelters/data';
    return '/shelters/*';
  }

  return pathname === '/' ? '/' : '/*';
}

function rateLimitForPath(method: string, routePath: string): number {
  if (routePath === '/v1/devices') return 20;
  if (routePath.endsWith('/invites')) return 10;
  if (routePath.endsWith('/join')) return 20;
  if (routePath.endsWith('/ws-ticket')) return 30;
  if (routePath.endsWith('/rotate')) return 30;
  if (method === 'PUT' && routePath.endsWith('/me')) return 60;
  return 120;
}

function clientIp(c: AppContext): string {
  return c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
}

// Extract the `b72.ticket.<ticket>` entry from a (possibly comma-separated)
// Sec-WebSocket-Protocol header; returns the full offered value so the DO can
// echo it back on the 101 handshake.
function selectWsTicketSubprotocol(headerValue: string | undefined): string | null {
  if (!headerValue) return null;
  for (const part of headerValue.split(',')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(WS_TICKET_SUBPROTOCOL_PREFIX)) return trimmed;
  }
  return null;
}

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

async function enforceRateLimit(
  env: Env,
  scope: string,
  method: string,
  pathname: string,
  limit = rateLimitForPath(method, rateLimitRoute(method, pathname))
): Promise<boolean> {
  const ts = now();
  const windowStart = ts - (ts % RATE_WINDOW_MS);
  const routePath = rateLimitRoute(method, pathname);
  const bucketKey = `${scope}:${method}:${routePath}:${windowStart}`;
  // Probabilistic sweep: expired rows are harmless until cleaned, so amortize
  // the full-table scan to ~1 in 50 requests instead of running it every call.
  if (Math.random() < 0.02) {
    await env.DB.prepare('DELETE FROM api_rate_limits WHERE reset_at < ?').bind(ts).run();
  }
  const result = await env.DB.prepare(
    `INSERT INTO api_rate_limits (bucket_key, count, reset_at)
     VALUES (?, 1, ?)
     ON CONFLICT(bucket_key) DO UPDATE SET count = count + 1`
  )
    .bind(bucketKey, windowStart + RATE_WINDOW_MS)
    .run();
  if (!result.success) return false;
  const row = await env.DB.prepare('SELECT count FROM api_rate_limits WHERE bucket_key = ?')
    .bind(bucketKey)
    .first<{ count: number }>();
  return (row?.count ?? limit + 1) <= limit;
}

async function rememberSignedRequest(
  env: Env,
  deviceId: string,
  replayMaterial: string,
  requestId: string | undefined
): Promise<boolean> {
  const ts = now();
  if (Math.random() < 0.02) {
    await env.DB.prepare('DELETE FROM signed_request_replays WHERE expires_at < ?').bind(ts).run();
  }

  const requestKey = b64uEncode(await sha256(enc.encode(`${deviceId}.${replayMaterial}`)));
  const result = await env.DB.prepare(
    `INSERT OR IGNORE INTO signed_request_replays (request_key, device_id, request_id, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?)`
  )
    .bind(requestKey, deviceId, requestId ?? null, ts + SIGNED_REQUEST_TTL_MS, ts)
    .run();

  return resultChanges(result) === 1;
}

async function broadcast(env: Env, groupId: string, payload: unknown) {
  await durableFor(env, groupId).fetch('https://do/broadcast', {
    method: 'POST',
    headers: { 'x-b72-internal': env.TICKET_SECRET },
    body: JSON.stringify(payload),
  });
}

async function disconnectDeviceSockets(env: Env, groupId: string, deviceId: string) {
  await durableFor(env, groupId).fetch('https://do/disconnect-device', {
    method: 'POST',
    headers: { 'x-b72-internal': env.TICKET_SECRET },
    body: JSON.stringify({ deviceId }),
  });
}

async function consumeWsTicket(env: Env, groupId: string, deviceId: string, jti: string, exp: number): Promise<boolean> {
  const ts = now();
  if (Math.random() < 0.02) {
    await env.DB.prepare('DELETE FROM ws_ticket_uses WHERE expires_at < ?').bind(ts).run();
  }
  const result = await env.DB.prepare(
    `INSERT OR IGNORE INTO ws_ticket_uses (jti, group_id, device_id, expires_at, used_at)
     VALUES (?, ?, ?, ?, ?)`
  )
    .bind(jti, groupId, deviceId, exp * 1000, ts)
    .run();
  return resultChanges(result) === 1;
}

// --- Signed-request auth middleware ---------------------------------------
const requireDevice: MiddlewareHandler<AppBindings> = async (c, next) => {
  const deviceId = c.req.header('x-device-id');
  const timestamp = c.req.header('x-timestamp');
  const signature = c.req.header('x-signature');
  const requestId = c.req.header('x-request-id');
  if (!deviceId || !timestamp || !signature) return jsonError('unauthorized', 401);
  if (!isValidDeviceId(deviceId)) return jsonError('unauthorized', 401);
  // The official client always sends x-request-id; require it so replay material
  // is always rid:<requestId> (closes the legacy signature-only replay fallback).
  if (!requestId) return jsonError('missing request id', 400);
  if (!isValidRequestId(requestId)) return jsonError('invalid request id', 400);

  // Reject stale/replayed requests (±120s).
  const skew = Math.abs(now() - Number(timestamp));
  if (!Number.isFinite(skew) || skew > SIGNED_REQUEST_TTL_MS) return jsonError('stale', 401);

  const bodyBytes = await readBodyBytes(c.req.raw, MAX_SIGNED_BODY_BYTES);
  const device = await c.env.DB.prepare('SELECT pub_ed25519 FROM devices WHERE id = ?')
    .bind(deviceId)
    .first<{ pub_ed25519: string }>();
  // Identical response for unknown-device and bad-signature so the two cases are
  // indistinguishable (closes the device-enumeration oracle).
  if (!device) return jsonError('unauthorized', 401);

  const url = new URL(c.req.url);
  const msg = await canonicalMessage(c.req.method, url.pathname + url.search, timestamp, bodyBytes, requestId);
  const ok = await verifyEd25519(device.pub_ed25519, signature, msg);
  if (!ok) return jsonError('unauthorized', 401);

  const replayMaterial = `rid:${requestId}`;
  if (!(await rememberSignedRequest(c.env, deviceId, replayMaterial, requestId))) {
    securityLog('signed_request_replay', { hasRequestId: Boolean(requestId) });
    return jsonError('replay', 401);
  }
  if (!(await enforceRateLimit(c.env, `device:${deviceId}`, c.req.method, url.pathname))) {
    securityLog('rate_limited', { scope: 'device', route: rateLimitRoute(c.req.method, url.pathname) });
    return jsonError('rate limited', 429);
  }

  c.set('deviceId', deviceId);
  c.set('bodyBytes', bodyBytes);
  c.set('requestId', requestId);
  await next();
};

const requireAdmin: MiddlewareHandler<AppBindings> = async (c, next) => {
  const url = new URL(c.req.url);
  if (!(await enforceRateLimit(c.env, `admin-ip:${clientIp(c)}`, c.req.method, url.pathname, 30))) {
    securityLog('admin_rate_limited', { route: rateLimitRoute(c.req.method, url.pathname) });
    return jsonError('rate limited', 429);
  }
  const auth = c.req.header('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length).trim() : '';
  if (!token || !timingSafeEqualString(token, requireAdminToken(c.env))) {
    securityLog('admin_auth_failed', { route: rateLimitRoute(c.req.method, url.pathname) });
    return jsonError('unauthorized', 401);
  }
  await next();
};

async function recordAdminAudit(c: AppContext, event: string, fields: JsonObject = {}) {
  await c.env.DB.prepare(
    `INSERT INTO admin_audit_events
       (id, event, ip, user_agent, cf_ray, details, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      randomToken(16),
      event,
      clientIp(c),
      c.req.header('user-agent')?.slice(0, 256) ?? null,
      c.req.header('cf-ray')?.slice(0, 128) ?? null,
      JSON.stringify(fields).slice(0, 4096),
      now()
    )
    .run();
}

async function isMember(env: Env, groupId: string, deviceId: string): Promise<boolean> {
  const row = await env.DB.prepare(
    'SELECT 1 FROM memberships WHERE group_id = ? AND device_id = ?'
  )
    .bind(groupId, deviceId)
    .first();
  return !!row;
}

function parseOptionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'boolean') return value;
  throw new HttpError(400, `invalid ${field}`);
}

function queueFamilyNotification(
  c: AppContext,
  type: FamilyNotificationType,
  groupId: string,
  excludeDeviceIds: string[]
) {
  c.executionCtx.waitUntil(
    createFamilyNotification(c.env, { groupId, type, excludeDeviceIds }).catch((err) => {
      console.error(
        JSON.stringify({
          level: 'error',
          event: 'family_notification_enqueue_error',
          type,
          message: err instanceof Error ? err.message : String(err),
        })
      );
    })
  );
}

// --- Routes ----------------------------------------------------------------

app.get('/', (c) => c.json({ ok: true, service: 'baltic72-family' }));

app.use('/v1/*', async (c, next) => {
  const url = new URL(c.req.url);
  if (!(await enforceRateLimit(c.env, `ip:${clientIp(c)}`, c.req.method, url.pathname))) {
    securityLog('rate_limited', { scope: 'ip', route: rateLimitRoute(c.req.method, url.pathname) });
    return jsonError('rate limited', 429);
  }
  await next();
});

// Per-IP limiter for the public shelter endpoints (otherwise unauthenticated and
// unthrottled). Mirrors the /v1/* limiter.
app.use('/shelters/*', async (c, next) => {
  const url = new URL(c.req.url);
  if (!(await enforceRateLimit(c.env, `ip:${clientIp(c)}`, c.req.method, url.pathname))) {
    securityLog('rate_limited', { scope: 'ip', route: rateLimitRoute(c.req.method, url.pathname) });
    return jsonError('rate limited', 429);
  }
  await next();
});

// --- Shelter dataset (open data, served from R2) ---------------------------
// The normalized snapshot is built by the Python pipeline (GDAL) and uploaded
// to R2 as manifest.json + shelters.json — see scripts/ + README. The app polls
// the manifest and pulls the full payload only when `version` changes. Workers
// can't run GDAL, so normalization stays in the pipeline; this is the stable
// delivery endpoint, so source/data changes never require an app release.

// Manifest: the app's `shelterUpdateUrl` points here. We inject the absolute
// data URL from the request origin so the stored manifest stays host-agnostic.
app.get('/shelters/manifest', async (c) => {
  const obj = await c.env.SHELTERS.get('manifest.json');
  if (!obj) return c.json({ error: 'no dataset published' }, 404);
  const manifest = await obj.json<Record<string, unknown>>();
  // Don't trust an arbitrary Host header: only reflect the request origin when
  // its host is allowlisted, otherwise fall back to the canonical data URL.
  const requestUrl = new URL(c.req.url);
  manifest.url = SHELTER_ORIGIN_ALLOWLIST.has(requestUrl.host)
    ? `${requestUrl.origin}/shelters/data`
    : CANONICAL_SHELTER_DATA_URL;
  return c.json(manifest, 200, { 'cache-control': 'public, max-age=300' });
});

// Full normalized shelters payload (array, same shape as data/seed/shelters.json).
// Stored as plain JSON; Cloudflare compresses the response on the wire.
app.get('/shelters/data', async (c) => {
  const obj = await c.env.SHELTERS.get('shelters.json');
  if (!obj) return c.json({ error: 'no dataset published' }, 404);
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'public, max-age=86400',
  });
  obj.writeHttpMetadata(headers); // carries any stored content-encoding/etag
  headers.set('etag', obj.httpEtag);
  return new Response(obj.body, { headers });
});

// Register a device (open, derives id from the key — no spoofing possible).
app.post('/v1/devices', async (c) => {
  const body = await parseJsonBody<{ pub_x25519?: unknown; pub_ed25519?: unknown; x25519_sig?: unknown }>(c);
  const { pub_x25519, pub_ed25519, x25519_sig } = body;
  if (typeof pub_x25519 !== 'string' || typeof pub_ed25519 !== 'string') {
    return jsonError('missing keys', 400);
  }
  try {
    decodeB64uBytes(pub_x25519, 32);
    decodeB64uBytes(pub_ed25519, 32);
  } catch {
    return jsonError('invalid keys', 400);
  }

  // X25519 key-binding: if the client signs the binding message with its Ed25519
  // identity, verify it before storing. Optional so already-shipped 1.0.1 clients
  // (no sig) still register; the sig backfills on a later call with a valid sig.
  let x25519Sig: string | null = null;
  if (x25519_sig !== undefined) {
    if (typeof x25519_sig !== 'string') return jsonError('invalid key signature', 400);
    const bound = await verifyEd25519(pub_ed25519, x25519_sig, x25519BindingMessage(pub_x25519));
    if (!bound) return jsonError('invalid key signature', 400);
    x25519Sig = x25519_sig;
  }

  const id = await deviceIdFromEdPub(pub_ed25519);
  // Insert new devices; for already-registered devices, backfill x25519_sig only
  // when it's still null AND the stored x25519 key matches (never rotates keys).
  await c.env.DB.prepare(
    `INSERT INTO devices (id, pub_x25519, pub_ed25519, x25519_sig, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET x25519_sig = excluded.x25519_sig
       WHERE devices.x25519_sig IS NULL AND devices.pub_x25519 = excluded.pub_x25519`
  )
    .bind(id, pub_x25519, pub_ed25519, x25519Sig, now())
    .run();
  return c.json({ deviceId: id });
});

// Create a group; the caller becomes its owner.
app.post('/v1/groups', requireDevice, async (c) => {
  const deviceId = c.get('deviceId');
  const ownedCount = await c.env.DB.prepare(
    "SELECT COUNT(*) AS n FROM memberships WHERE device_id = ? AND role = 'owner'"
  )
    .bind(deviceId)
    .first<{ n: number }>();
  if ((ownedCount?.n ?? 0) >= MAX_GROUPS_PER_DEVICE) return jsonError('too many groups', 429);

  const body = await parseJsonBody(c);
  const displayCiphertext = normalizeCiphertext(body.display_ciphertext, 'display_ciphertext');
  const statusCiphertext = normalizeCiphertext(body.status_ciphertext, 'status_ciphertext');
  const groupId = randomToken(16);
  const ts = now();
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO groups (id, created_by, created_at) VALUES (?, ?, ?)').bind(
      groupId,
      deviceId,
      ts
    ),
    c.env.DB.prepare(
      `INSERT INTO memberships (group_id, device_id, role, display_ciphertext, status_ciphertext, status_updated_at, joined_at)
       VALUES (?, ?, 'owner', ?, ?, ?, ?)`
    ).bind(groupId, deviceId, displayCiphertext ?? null, statusCiphertext ?? null, ts, ts),
  ]);
  return c.json({ groupId });
});

// Mint an invite. Returns the raw token (only its hash is stored). The group
// KEY is added to the link by the client; it never reaches the server.
app.post('/v1/groups/:id/invites', requireDevice, async (c) => {
  const groupId = getGroupId(c);
  const deviceId = c.get('deviceId');
  if (!(await isMember(c.env, groupId, deviceId))) return jsonError('forbidden', 403);

  const outstanding = await c.env.DB.prepare(
    'SELECT COUNT(*) AS n FROM invites WHERE group_id = ? AND expires_at >= ? AND uses < max_uses'
  )
    .bind(groupId, now())
    .first<{ n: number }>();
  if ((outstanding?.n ?? 0) >= MAX_OUTSTANDING_INVITES) return jsonError('too many invites', 429);

  const body = await parseJsonBody(c);
  const ttlHours = boundedInteger(body.ttlHours, MAX_INVITE_TTL_HOURS, 1, MAX_INVITE_TTL_HOURS, 'ttlHours');
  const maxUses = boundedInteger(body.maxUses, MAX_INVITE_USES, 1, MAX_INVITE_USES, 'maxUses');
  const token = randomToken(24);
  const tokenHash = b64uEncode(await sha256(enc.encode(token)));
  const expiresAt = now() + ttlHours * 3_600_000;
  await c.env.DB.prepare(
    `INSERT INTO invites (token_hash, group_id, created_by, expires_at, max_uses, uses, created_at)
     VALUES (?, ?, ?, ?, ?, 0, ?)`
  )
    .bind(tokenHash, groupId, deviceId, expiresAt, maxUses, now())
    .run();
  return c.json({ token, groupId, expiresAt });
});

// Join via invite token. The server records membership; existing members grant
// the group key separately through an opaque X25519-wrapped key envelope.
app.post('/v1/groups/:id/join', requireDevice, async (c) => {
  const groupId = getGroupId(c);
  const deviceId = c.get('deviceId');
  const body = await parseJsonBody<{ token?: unknown; display_ciphertext?: unknown; status_ciphertext?: unknown }>(c);
  const { token } = body;
  if (typeof token !== 'string') return jsonError('missing token', 400);
  try {
    decodeB64uBytes(token, 24);
  } catch {
    return jsonError('invalid invite', 400);
  }
  if (!isValidToken(token)) return jsonError('invalid invite', 400);

  const displayCiphertext = normalizeCiphertext(body.display_ciphertext, 'display_ciphertext');
  const statusCiphertext = normalizeCiphertext(body.status_ciphertext, 'status_ciphertext');
  const ts = now();

  if (await isMember(c.env, groupId, deviceId)) {
    await c.env.DB.prepare(
      `UPDATE memberships
         SET status_ciphertext = COALESCE(?, status_ciphertext),
             display_ciphertext = COALESCE(?, display_ciphertext),
             status_updated_at = ?
       WHERE group_id = ? AND device_id = ?`
    )
      .bind(statusCiphertext ?? null, displayCiphertext ?? null, ts, groupId, deviceId)
      .run();
    return c.json({ ok: true, groupId });
  }

  const tokenHash = b64uEncode(await sha256(enc.encode(token)));
  const inviteCreatedAfter = ts - MAX_INVITE_TTL_MS;
  const useInvite = await c.env.DB.prepare(
    `UPDATE invites
        SET uses = uses + 1
      WHERE token_hash = ?
        AND group_id = ?
        AND expires_at >= ?
        AND created_at >= ?
        AND uses < ?`
  )
    .bind(tokenHash, groupId, ts, inviteCreatedAfter, MAX_INVITE_USES)
    .run();

  if (resultChanges(useInvite) !== 1) {
    const invite = await c.env.DB.prepare(
      'SELECT group_id, expires_at, uses, created_at FROM invites WHERE token_hash = ?'
    )
      .bind(tokenHash)
      .first<{ group_id: string; expires_at: number; uses: number; created_at: number }>();
    if (!invite || invite.group_id !== groupId) return jsonError('invalid invite', 400);
    if (invite.expires_at < ts || invite.created_at < inviteCreatedAfter) return jsonError('expired invite', 400);
    return jsonError('invite used up', 400);
  }

  await c.env.DB.prepare(
    `INSERT INTO memberships (group_id, device_id, role, display_ciphertext, status_ciphertext, status_updated_at, joined_at)
     VALUES (?, ?, 'member', ?, ?, ?, ?)
     ON CONFLICT(group_id, device_id) DO UPDATE SET display_ciphertext = excluded.display_ciphertext`
  )
    .bind(groupId, deviceId, displayCiphertext ?? null, statusCiphertext ?? null, ts, ts)
    .run();

  await broadcast(c.env, groupId, { type: 'member_joined', deviceId, ts });
  queueFamilyNotification(c, 'member_joined', groupId, [deviceId]);
  return c.json({ ok: true, groupId });
});

// Update my display name and/or status (both ciphertext). Fans out live.
app.put('/v1/groups/:id/me', requireDevice, async (c) => {
  const groupId = getGroupId(c);
  const deviceId = c.get('deviceId');
  const existingMember = await c.env.DB.prepare(
    'SELECT status_ciphertext FROM memberships WHERE group_id = ? AND device_id = ?'
  )
    .bind(groupId, deviceId)
    .first<{ status_ciphertext: string | null }>();
  if (!existingMember) return jsonError('forbidden', 403);

  const body = await parseJsonBody<{ status_ciphertext?: unknown; display_ciphertext?: unknown }>(c);
  const statusCiphertext = normalizeCiphertext(body.status_ciphertext, 'status_ciphertext');
  const displayCiphertext = normalizeCiphertext(body.display_ciphertext, 'display_ciphertext');
  const shouldNotifyStatus =
    statusCiphertext !== undefined &&
    statusCiphertext !== null &&
    existingMember.status_ciphertext !== null &&
    statusCiphertext !== existingMember.status_ciphertext;

  const ts = now();
  await c.env.DB.prepare(
    `UPDATE memberships
       SET status_ciphertext = COALESCE(?, status_ciphertext),
           display_ciphertext = COALESCE(?, display_ciphertext),
           status_updated_at = ?
     WHERE group_id = ? AND device_id = ?`
  )
    .bind(statusCiphertext ?? null, displayCiphertext ?? null, ts, groupId, deviceId)
    .run();

  await broadcast(c.env, groupId, {
    type: 'status',
    deviceId,
    status_ciphertext: statusCiphertext ?? null,
    display_ciphertext: displayCiphertext ?? null,
    ts,
  });
  if (shouldNotifyStatus) {
    // Server-side cooldown: re-sealing changes ciphertext on every PUT, so gate
    // the push fan-out to at most one status_updated per device per window.
    const allowed = await claimFamilyNotificationSlot(
      c.env,
      groupId,
      deviceId,
      'status_updated',
      FAMILY_STATUS_NOTIFY_COOLDOWN_MS
    );
    if (allowed) queueFamilyNotification(c, 'status_updated', groupId, [deviceId]);
  }
  return c.json({ ok: true, ts });
});

// Snapshot of all members (ciphertext + public key) — used on app open / reconnect.
app.get('/v1/groups/:id', requireDevice, async (c) => {
  const groupId = getGroupId(c);
  const deviceId = c.get('deviceId');
  if (!(await isMember(c.env, groupId, deviceId))) return jsonError('forbidden', 403);

  const group = await c.env.DB.prepare('SELECT key_epoch FROM groups WHERE id = ?')
    .bind(groupId)
    .first<{ key_epoch: number }>();

  const { results } = await c.env.DB.prepare(
    `SELECT m.device_id, d.pub_x25519, d.pub_ed25519, d.x25519_sig, m.role,
            m.display_ciphertext, m.status_ciphertext, m.status_updated_at
       FROM memberships m
       JOIN devices d ON d.id = m.device_id
      WHERE m.group_id = ?
      ORDER BY m.joined_at`
  )
    .bind(groupId)
    .all();
  return c.json({ groupId, keyEpoch: group?.key_epoch ?? 1, members: results });
});

// Existing members upload an encrypted group-key envelope for a member device.
app.put('/v1/groups/:id/key-envelopes/:deviceId', requireDevice, async (c) => {
  const groupId = getGroupId(c);
  const sender = c.get('deviceId');
  const recipient = c.req.param('deviceId');
  if (!isValidDeviceId(recipient)) return jsonError('invalid device id', 400);
  if (sender === recipient) return jsonError('invalid recipient', 400);
  if (!(await isMember(c.env, groupId, sender)) || !(await isMember(c.env, groupId, recipient))) {
    return jsonError('forbidden', 403);
  }

  const body = await parseJsonBody<{ key_epoch?: unknown; ciphertext?: unknown }>(c);
  const keyEpoch = boundedInteger(body.key_epoch, 1, 1, 100000, 'key_epoch');
  const ciphertext = normalizeCiphertext(body.ciphertext, 'ciphertext');
  if (!ciphertext) return jsonError('missing ciphertext', 400);
  const ts = now();
  await c.env.DB.prepare(
    `INSERT INTO key_envelopes (group_id, recipient_device_id, sender_device_id, key_epoch, ciphertext, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(group_id, recipient_device_id, sender_device_id, key_epoch)
     DO UPDATE SET ciphertext = excluded.ciphertext, created_at = excluded.created_at`
  )
    .bind(groupId, recipient, sender, keyEpoch, ciphertext, ts)
    .run();
  await broadcast(c.env, groupId, { type: 'key_envelope', deviceId: recipient, senderDeviceId: sender, ts });
  return c.json({ ok: true });
});

// Pending key envelopes for the calling device.
app.get('/v1/groups/:id/key-envelopes/me', requireDevice, async (c) => {
  const groupId = getGroupId(c);
  const deviceId = c.get('deviceId');
  if (!(await isMember(c.env, groupId, deviceId))) return jsonError('forbidden', 403);
  const { results } = await c.env.DB.prepare(
    `SELECT e.group_id, e.recipient_device_id, e.sender_device_id, d.pub_x25519 AS sender_pub_x25519,
            d.pub_ed25519 AS sender_pub_ed25519, d.x25519_sig AS sender_x25519_sig,
            e.key_epoch, e.ciphertext, e.created_at
       FROM key_envelopes e
       JOIN devices d ON d.id = e.sender_device_id
      WHERE e.group_id = ? AND e.recipient_device_id = ?
      ORDER BY e.created_at DESC`
  )
    .bind(groupId, deviceId)
    .all();
  return c.json({ envelopes: results });
});

// Leave, or (owner) remove another member.
app.delete('/v1/groups/:id/members/:deviceId', requireDevice, async (c) => {
  const groupId = getGroupId(c);
  const caller = c.get('deviceId');
  const target = c.req.param('deviceId');
  if (!isValidDeviceId(target)) return jsonError('invalid device id', 400);

  const me = await c.env.DB.prepare(
    'SELECT role FROM memberships WHERE group_id = ? AND device_id = ?'
  )
    .bind(groupId, caller)
    .first<{ role: string }>();
  if (!me) return jsonError('forbidden', 403);
  if (caller !== target && me.role !== 'owner') return jsonError('forbidden', 403);

  // Last-owner protection: never let a group become ownerless.
  const targetMembership = await c.env.DB.prepare(
    'SELECT role FROM memberships WHERE group_id = ? AND device_id = ?'
  )
    .bind(groupId, target)
    .first<{ role: string }>();
  if (targetMembership?.role === 'owner') {
    const owners = await c.env.DB.prepare(
      "SELECT COUNT(*) AS n FROM memberships WHERE group_id = ? AND role = 'owner'"
    )
      .bind(groupId)
      .first<{ n: number }>();
    if ((owners?.n ?? 0) <= 1) return jsonError('cannot remove last owner', 409);
  }

  const deleted = await c.env.DB.prepare('DELETE FROM memberships WHERE group_id = ? AND device_id = ?')
    .bind(groupId, target)
    .run();
  if (resultChanges(deleted) > 0) {
    // Purge the removed device's key envelopes so it can't decrypt future
    // (post-rotation) traffic and can't keep handing out the old key.
    await c.env.DB.prepare(
      'DELETE FROM key_envelopes WHERE group_id = ? AND (recipient_device_id = ? OR sender_device_id = ?)'
    )
      .bind(groupId, target, target)
      .run();
    await broadcast(c.env, groupId, { type: 'member_left', deviceId: target, ts: now() });
    await disconnectDeviceSockets(c.env, groupId, target);
    queueFamilyNotification(c, 'member_left', groupId, [caller, target]);
  }
  return c.json({ ok: true });
});

// Owner-only group-key rotation. Bumps groups.key_epoch via compare-and-swap so
// concurrent rotations can't skip/clobber epochs. The new wrapped key envelopes
// are uploaded separately by the owner at the new epoch.
app.post('/v1/groups/:id/rotate', requireDevice, async (c) => {
  const groupId = getGroupId(c);
  const deviceId = c.get('deviceId');
  const me = await c.env.DB.prepare('SELECT role FROM memberships WHERE group_id = ? AND device_id = ?')
    .bind(groupId, deviceId)
    .first<{ role: string }>();
  if (!me) return jsonError('forbidden', 403);
  if (me.role !== 'owner') return jsonError('forbidden', 403);

  const body = await parseJsonBody<{ epoch?: unknown }>(c);
  if (body.epoch === undefined) return jsonError('invalid epoch', 400);
  const epoch = boundedInteger(body.epoch, 0, 2, 100000, 'epoch');

  const rotated = await c.env.DB.prepare('UPDATE groups SET key_epoch = ? WHERE id = ? AND key_epoch = ?')
    .bind(epoch, groupId, epoch - 1)
    .run();
  if (resultChanges(rotated) === 0) return jsonError('rotation conflict', 409);
  return c.json({ ok: true, keyEpoch: epoch });
});

// Exchange a signed request for a short-lived WebSocket ticket.
app.post('/v1/groups/:id/ws-ticket', requireDevice, async (c) => {
  const groupId = getGroupId(c);
  const deviceId = c.get('deviceId');
  if (!(await isMember(c.env, groupId, deviceId))) return jsonError('forbidden', 403);
  const ticket = await signTicket(requireTicketSecret(c.env), groupId, deviceId, 60);
  return c.json({ ticket });
});

// Register native APNs/FCM token + country preferences for direct provider sends.
// This endpoint is signed by the device identity; no account/email is needed.
app.put('/v1/push/subscription', requireDevice, async (c) => {
  const deviceId = c.get('deviceId');
  const body = await parseJsonBody<{
    platform?: unknown;
    token?: unknown;
    environment?: unknown;
    countries?: unknown;
    locale?: unknown;
    appVersion?: unknown;
    familyEnabled?: unknown;
  }>(c);

  try {
    const familyEnabled = parseOptionalBoolean(body.familyEnabled, 'familyEnabled');
    const result = await registerPushSubscription(c.env, {
      deviceId,
      platform: parsePlatform(body.platform),
      token: validatePushToken(body.token),
      environment: parseEnvironment(body.environment),
      countries: parseCountries(body.countries ?? []),
      locale: typeof body.locale === 'string' ? body.locale.slice(0, 32) : null,
      appVersion: typeof body.appVersion === 'string' ? body.appVersion.slice(0, 64) : null,
      familyEnabled: familyEnabled ?? null,
    });
    return c.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'invalid push subscription';
    return jsonError(message, 400);
  }
});

app.put('/v1/push/preferences', requireDevice, async (c) => {
  const body = await parseJsonBody<{
    countries?: unknown;
    familyEnabled?: unknown;
  }>(c);

  try {
    const countries = body.countries === undefined ? undefined : parseCountries(body.countries);
    const familyEnabled = parseOptionalBoolean(body.familyEnabled, 'familyEnabled');
    await updatePushPreferences(c.env, c.get('deviceId'), { countries, familyEnabled });
    return c.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'invalid push preferences';
    return jsonError(message, 400);
  }
});

app.delete('/v1/push/subscription', requireDevice, async (c) => {
  await clearPushSubscriptions(c.env, c.get('deviceId'));
  return c.json({ ok: true });
});

// Admin notification API. Keep this behind the Cloudflare secret ADMIN_TOKEN.
app.post('/admin/alerts', requireAdmin, async (c) => {
  const body = await parseJsonBody(c);
  try {
    const result = await createAlert(c.env, parseAlertInput(body));
    await recordAdminAudit(c, 'alert_created', {
      alertId: result.alertId,
      totalTargets: result.totalTargets,
      enqueuedBatches: result.enqueuedBatches,
      countries: body.countries,
      severity: body.severity,
      critical: body.critical === true,
      dryRun: body.dryRun === true,
    });
    return c.json(result, 202);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'invalid alert';
    return jsonError(message, message.startsWith('invalid ') ? 400 : 500);
  }
});

app.get('/admin/alerts/:id', requireAdmin, async (c) => {
  const alertId = c.req.param('id');
  if (!isValidToken(alertId)) return jsonError('invalid alert id', 400);
  const alert = await getAlertStatus(c.env, alertId);
  if (!alert) return jsonError('not found', 404);
  return c.json(alert);
});

app.post('/admin/smoke', requireAdmin, async (c) => {
  const result = await createAlert(c.env, {
    title: 'Baltic72 smoke test',
    body: 'Cloudflare notification queue smoke test.',
    countries: ['LT'],
    severity: 'info',
    timeSensitive: false,
    critical: false,
    dryRun: true,
  });
  await recordAdminAudit(c, 'smoke_created', {
    alertId: result.alertId,
    totalTargets: result.totalTargets,
    enqueuedBatches: result.enqueuedBatches,
  });
  return c.json(result, 202);
});

// WebSocket connect (auth via ?ticket=). Forwards the upgrade to the group DO.
app.get('/v1/groups/:id/ws', async (c) => {
  const groupId = getGroupId(c);

  // Prefer the ticket from the Sec-WebSocket-Protocol header (`b72.ticket.<t>`,
  // possibly alongside other protocols) so it isn't logged in URLs by proxies;
  // fall back to the legacy ?ticket= query for backwards compat.
  const offeredSubprotocol = selectWsTicketSubprotocol(c.req.header('sec-websocket-protocol'));
  const ticket = offeredSubprotocol
    ? offeredSubprotocol.slice(WS_TICKET_SUBPROTOCOL_PREFIX.length)
    : c.req.query('ticket');
  if (!ticket || ticket.length > 1024) return jsonError('unauthorized', 401);

  const claims = await verifyTicket(requireTicketSecret(c.env), ticket, groupId);
  if (!claims) return jsonError('unauthorized', 401);
  if (!(await isMember(c.env, groupId, claims.deviceId))) return jsonError('forbidden', 403);
  if (!(await consumeWsTicket(c.env, groupId, claims.deviceId, claims.jti, claims.exp))) {
    return jsonError('unauthorized', 401);
  }

  const headers = new Headers(c.req.raw.headers);
  headers.set('x-b72-device-id', claims.deviceId);
  headers.set('x-b72-ticket-jti', claims.jti);
  headers.set('x-b72-ticket-exp', String(claims.exp));
  // Tell the DO which subprotocol to echo on the 101 so RN's WS accepts it.
  if (offeredSubprotocol) headers.set('x-b72-ws-subprotocol', offeredSubprotocol);

  // Forward the raw upgrade request (its path ends with /ws and carries the
  // Upgrade: websocket header) straight to the group's Durable Object.
  return durableFor(c.env, groupId).fetch(new Request(c.req.raw, { headers }));
});

export default {
  fetch: app.fetch,
  async queue(batch: MessageBatch<AlertQueueMessage>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      try {
        if (batch.queue === 'baltic72-alerts-dlq') {
          await processDeadLetterBatch(env, message.body);
        } else {
          await processAlertBatch(env, message.body);
        }
        message.ack();
      } catch (err) {
        console.error(
          JSON.stringify({
            level: 'error',
            event: 'notification_queue_error',
            message: err instanceof Error ? err.message : String(err),
          })
        );
        message.retry();
      }
    }
  },
};
