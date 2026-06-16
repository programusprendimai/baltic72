// Crypto helpers shared by the Worker: base64url, hashing, Ed25519 request
// signature verification, and HMAC WebSocket tickets. All via WebCrypto, which
// Cloudflare Workers support natively (including Ed25519).

const enc = new TextEncoder();
const dec = new TextDecoder();
const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{22,128}$/;
const REQUEST_ID_RE =
  /^[A-Za-z0-9_-]{16,96}$|^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isBase64UrlString(str: string): boolean {
  return BASE64URL_RE.test(str) && str.length % 4 !== 1;
}

export function b64uEncode(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = '';
  for (const b of u8) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64uDecode(str: string): Uint8Array {
  if (!isBase64UrlString(str)) throw new Error('invalid base64url');
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
  const bin = atob(b64 + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function decodeB64uBytes(value: string, expectedBytes?: number): Uint8Array {
  const decoded = b64uDecode(value);
  if (expectedBytes !== undefined && decoded.byteLength !== expectedBytes) {
    throw new Error('invalid byte length');
  }
  return decoded;
}

export async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return new Uint8Array(digest);
}

/** Device id is the base64url SHA-256 of its Ed25519 public key (self-certifying). */
export async function deviceIdFromEdPub(pubEd25519B64: string): Promise<string> {
  return b64uEncode(await sha256(decodeB64uBytes(pubEd25519B64, 32)));
}

/**
 * Canonical string a client must sign for each request:
 *   `${timestamp}.${method}.${path+search}.${base64url(sha256(body))}`
 *
 * New clients can bind an anti-replay id into the signature by sending
 * x-request-id and signing:
 *   `${timestamp}.${method}.${path+search}.${requestId}.${base64url(sha256(body))}`
 */
export async function canonicalMessage(
  method: string,
  pathWithQuery: string,
  timestamp: string,
  body: Uint8Array,
  requestId?: string
): Promise<Uint8Array> {
  const bodyHash = b64uEncode(await sha256(body));
  if (requestId) return enc.encode(`${timestamp}.${method}.${pathWithQuery}.${requestId}.${bodyHash}`);
  return enc.encode(`${timestamp}.${method}.${pathWithQuery}.${bodyHash}`);
}

const X25519_BINDING_PREFIX = 'baltic72.x25519-binding.v1';

/**
 * Bytes a client signs (Ed25519) to bind its X25519 key to its self-certifying
 * identity: `concat(utf8("baltic72.x25519-binding.v1"), <raw 32-byte x25519 pubkey>)`.
 */
export function x25519BindingMessage(pubX25519B64: string): Uint8Array {
  const pub = decodeB64uBytes(pubX25519B64, 32);
  const prefix = enc.encode(X25519_BINDING_PREFIX);
  const out = new Uint8Array(prefix.byteLength + pub.byteLength);
  out.set(prefix, 0);
  out.set(pub, prefix.byteLength);
  return out;
}

export async function verifyEd25519(
  pubEd25519B64: string,
  signatureB64: string,
  message: Uint8Array
): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      decodeB64uBytes(pubEd25519B64, 32),
      { name: 'Ed25519' },
      false,
      ['verify']
    );
    return await crypto.subtle.verify('Ed25519', key, decodeB64uBytes(signatureB64, 64), message);
  } catch {
    return false;
  }
}

export function isValidDeviceId(value: string): boolean {
  try {
    decodeB64uBytes(value, 32);
    return value.length === 43;
  } catch {
    return false;
  }
}

export function isValidGroupId(value: string): boolean {
  try {
    decodeB64uBytes(value, 16);
    return value.length === 22;
  } catch {
    return false;
  }
}

export function isValidRequestId(value: string): boolean {
  return REQUEST_ID_RE.test(value);
}

export function isValidToken(value: string): boolean {
  return TOKEN_RE.test(value) && isBase64UrlString(value);
}

export function isValidCiphertext(value: string, maxBytes: number): boolean {
  try {
    const encoded = value.startsWith('b72f1.') ? value.slice('b72f1.'.length) : value;
    const decoded = b64uDecode(encoded);
    return decoded.byteLength >= 40 && decoded.byteLength <= maxBytes;
  } catch {
    return false;
  }
}

export function validateTicketSecret(secret: string | undefined): secret is string {
  return typeof secret === 'string' && secret.trim().length >= 32;
}

// --- Short-lived WebSocket tickets (HMAC-signed, no DB needed) ---

export type TicketClaims = {
  groupId: string;
  deviceId: string;
  iat: number;
  exp: number;
  jti: string;
};

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export async function signTicket(
  secret: string,
  groupId: string,
  deviceId: string,
  ttlSeconds = 60
): Promise<string> {
  const iat = Math.floor(Date.now() / 1000);
  const claims: TicketClaims = {
    groupId,
    deviceId,
    iat,
    exp: iat + ttlSeconds,
    jti: b64uEncode(crypto.getRandomValues(new Uint8Array(16))),
  };
  const payloadB64 = b64uEncode(enc.encode(JSON.stringify(claims)));
  const mac = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(payloadB64));
  return `${payloadB64}.${b64uEncode(mac)}`;
}

export async function verifyTicket(
  secret: string,
  ticket: string,
  groupId: string
): Promise<TicketClaims | null> {
  const parts = ticket.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, macB64] = parts;
  if (!payloadB64 || !macB64) return null;

  try {
    const ok = await crypto.subtle.verify(
      'HMAC',
      await hmacKey(secret),
      decodeB64uBytes(macB64, 32),
      enc.encode(payloadB64)
    );
    if (!ok) return null;

    const parsed = JSON.parse(dec.decode(b64uDecode(payloadB64))) as Partial<TicketClaims>;
    if (
      typeof parsed.groupId !== 'string' ||
      typeof parsed.deviceId !== 'string' ||
      typeof parsed.jti !== 'string' ||
      typeof parsed.iat !== 'number' ||
      typeof parsed.exp !== 'number' ||
      parsed.groupId !== groupId ||
      !isValidGroupId(parsed.groupId) ||
      !isValidDeviceId(parsed.deviceId) ||
      !isValidRequestId(parsed.jti) ||
      parsed.exp <= Math.floor(Date.now() / 1000) ||
      parsed.exp - parsed.iat > 300
    ) {
      return null;
    }
    return parsed as TicketClaims;
  } catch {
    return null;
  }
}
