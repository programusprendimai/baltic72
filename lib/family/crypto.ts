/**
 * Family E2EE primitives. Pure-JS via @noble (audited). The private keys never
 * leave the device; the group key encrypts every status/name with XChaCha20-
 * Poly1305 AEAD. Requires `react-native-get-random-values` to be imported at
 * app start so the global CSPRNG is available.
 */
import 'react-native-get-random-values';
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { ed25519, x25519 } from '@noble/curves/ed25519.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { concatBytes, randomBytes } from '@noble/hashes/utils.js';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const STRICT_B64U = /^[A-Za-z0-9_-]+$/;
const FAMILY_FIELD_PREFIX = 'b72f1.';
const REV = (() => {
  const r = new Int16Array(128).fill(-1);
  for (let i = 0; i < ALPHABET.length; i++) r[ALPHABET.charCodeAt(i)] = i;
  return r;
})();

export function b64uEncode(bytes: Uint8Array): string {
  let out = '';
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < len ? bytes[i + 1] : 0;
    const b2 = i + 2 < len ? bytes[i + 2] : 0;
    out += ALPHABET[b0 >> 2];
    out += ALPHABET[((b0 & 0x03) << 4) | (b1 >> 4)];
    if (i + 1 < len) out += ALPHABET[((b1 & 0x0f) << 2) | (b2 >> 6)];
    if (i + 2 < len) out += ALPHABET[b2 & 0x3f];
  }
  return out;
}

export function b64uDecode(str: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(str)) {
    throw new Error('invalid base64url');
  }
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (let k = 0; k < str.length; k++) {
    const v = REV[str.charCodeAt(k)];
    if (v < 0) continue;
    buffer = (buffer << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  if (bits >= 6 || ((buffer << (8 - bits)) & 0xff) !== 0) {
    throw new Error('invalid base64url padding');
  }
  return new Uint8Array(bytes);
}

export function b64uDecodeStrict(str: string, expectedLength?: number): Uint8Array {
  if (!STRICT_B64U.test(str)) throw new Error('invalid base64url');
  const bytes = b64uDecode(str);
  if (expectedLength !== undefined && bytes.length !== expectedLength) {
    throw new Error('invalid base64url length');
  }
  if (b64uEncode(bytes) !== str) throw new Error('non-canonical base64url');
  return bytes;
}

const textEnc = new TextEncoder();
const textDec = new TextDecoder();
export const utf8 = (s: string) => textEnc.encode(s);
export const fromUtf8 = (b: Uint8Array) => textDec.decode(b);

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

export type RawIdentity = {
  edPriv: Uint8Array;
  edPub: Uint8Array;
  xPriv: Uint8Array;
  xPub: Uint8Array;
};

export function generateIdentity(): RawIdentity {
  const edPriv = ed25519.utils.randomSecretKey();
  const xPriv = x25519.utils.randomSecretKey();
  return {
    edPriv,
    edPub: ed25519.getPublicKey(edPriv),
    xPriv,
    xPub: x25519.getPublicKey(xPriv),
  };
}

/** Device id = base64url(sha256(ed25519 public key)). Matches the server. */
export function deviceIdFromEdPub(edPub: Uint8Array): string {
  return b64uEncode(sha256(edPub));
}

export function sign(message: Uint8Array, edPriv: Uint8Array): Uint8Array {
  return ed25519.sign(message, edPriv);
}

const X25519_BINDING_PREFIX = utf8('baltic72.x25519-binding.v1');

/** Bytes signed to bind an X25519 public key to its owning Ed25519 identity. */
function x25519BindingMessage(xPub: Uint8Array): Uint8Array {
  return concat(X25519_BINDING_PREFIX, xPub);
}

/** Sign the binding of this device's X25519 key under its Ed25519 identity. */
export function signX25519Binding(edPriv: Uint8Array, xPub: Uint8Array): Uint8Array {
  return ed25519.sign(x25519BindingMessage(xPub), edPriv);
}

/** Verify an X25519 key is bound to the given Ed25519 identity. */
export function verifyX25519Binding(
  edPub: Uint8Array,
  xPub: Uint8Array,
  sig: Uint8Array
): boolean {
  try {
    return ed25519.verify(sig, x25519BindingMessage(xPub), edPub);
  } catch {
    return false;
  }
}

/** Canonical bytes signed for each API request (must match the Worker). */
export function canonicalMessage(
  method: string,
  pathWithQuery: string,
  timestamp: string,
  body: Uint8Array,
  requestId?: string
): Uint8Array {
  const bodyHash = b64uEncode(sha256(body));
  if (requestId) return utf8(`${timestamp}.${method}.${pathWithQuery}.${requestId}.${bodyHash}`);
  return utf8(`${timestamp}.${method}.${pathWithQuery}.${bodyHash}`);
}

export function randomGroupKey(): Uint8Array {
  return randomBytes(32);
}

export function randomRequestId(): string {
  return b64uEncode(randomBytes(16));
}

function aadBytes(aad?: string): Uint8Array | undefined {
  return aad ? utf8(aad) : undefined;
}

/** Encrypt plaintext with the group key → base64url(nonce(24) ‖ ciphertext+tag). */
export function sealWithGroupKey(groupKey: Uint8Array, plaintext: string, aad?: string): string {
  const nonce = randomBytes(24);
  const ct = xchacha20poly1305(groupKey, nonce, aadBytes(aad)).encrypt(utf8(plaintext));
  return b64uEncode(concat(nonce, ct));
}

export function openWithGroupKey(groupKey: Uint8Array, envelopeB64: string, aad?: string): string {
  const all = b64uDecode(envelopeB64);
  if (all.length < 24 + 16) throw new Error('invalid envelope');
  const nonce = all.slice(0, 24);
  const ct = all.slice(24);
  return fromUtf8(xchacha20poly1305(groupKey, nonce, aadBytes(aad)).decrypt(ct));
}

export type FamilyEncryptedField = 'display' | 'status';

export type FamilyAeadContext = {
  groupId: string;
  deviceId: string;
  field: FamilyEncryptedField;
  epoch: number;
};

function familyFieldAad(context: FamilyAeadContext): Uint8Array {
  return utf8(
    JSON.stringify({
      app: 'baltic72',
      purpose: 'family-field',
      version: 1,
      groupId: context.groupId,
      deviceId: context.deviceId,
      field: context.field,
      epoch: context.epoch,
    })
  );
}

export function sealFamilyField(
  groupKey: Uint8Array,
  plaintext: string,
  context: FamilyAeadContext
): string {
  const nonce = randomBytes(24);
  const ct = xchacha20poly1305(groupKey, nonce, familyFieldAad(context)).encrypt(utf8(plaintext));
  return FAMILY_FIELD_PREFIX + b64uEncode(concat(nonce, ct));
}

export function openFamilyField(
  groupKey: Uint8Array,
  envelope: string,
  context: FamilyAeadContext
): string {
  if (!envelope.startsWith(FAMILY_FIELD_PREFIX)) {
    return openWithGroupKey(groupKey, envelope);
  }
  const all = b64uDecodeStrict(envelope.slice(FAMILY_FIELD_PREFIX.length));
  if (all.length < 24 + 16) throw new Error('invalid envelope');
  const nonce = all.slice(0, 24);
  const ct = all.slice(24);
  return fromUtf8(xchacha20poly1305(groupKey, nonce, familyFieldAad(context)).decrypt(ct));
}

export function isFamilyFieldEnvelope(envelope: string): boolean {
  return envelope.startsWith(FAMILY_FIELD_PREFIX);
}

function wrapKeyMaterial(senderXPriv: Uint8Array, recipientXPub: Uint8Array, groupId: string): Uint8Array {
  const shared = x25519.getSharedSecret(senderXPriv, recipientXPub);
  return sha256(concatBytes(utf8('baltic72.family.key-envelope.v1'), utf8(groupId), shared));
}

export function sealGroupKeyForMember(
  senderXPriv: Uint8Array,
  recipientXPub: Uint8Array,
  groupId: string,
  groupKey: Uint8Array
): string {
  const wrapKey = wrapKeyMaterial(senderXPriv, recipientXPub, groupId);
  const nonce = randomBytes(24);
  const aad = utf8(`group-key|${groupId}|v1`);
  const ct = xchacha20poly1305(wrapKey, nonce, aad).encrypt(groupKey);
  return b64uEncode(concat(nonce, ct));
}

export function openGroupKeyEnvelope(
  recipientXPriv: Uint8Array,
  senderXPub: Uint8Array,
  groupId: string,
  envelopeB64: string
): Uint8Array {
  const wrapKey = wrapKeyMaterial(recipientXPriv, senderXPub, groupId);
  const all = b64uDecode(envelopeB64);
  if (all.length < 24 + 16) throw new Error('invalid key envelope');
  const nonce = all.slice(0, 24);
  const ct = all.slice(24);
  const aad = utf8(`group-key|${groupId}|v1`);
  const key = xchacha20poly1305(wrapKey, nonce, aad).decrypt(ct);
  if (key.length !== 32) throw new Error('invalid group key');
  return key;
}

/**
 * Signal-style safety number derived from all members' Ed25519 public keys.
 * Order-independent (keys are sorted by their b64u encoding) so every member
 * computes the same string and can compare it out-of-band to detect a MITM.
 * Renders the first 30 bytes of the digest as 12 groups of 5 decimal digits.
 */
export function computeSafetyNumber(edPubs: Uint8Array[]): string {
  const sorted = edPubs.map((k) => b64uEncode(k)).sort();
  const digest = sha256(utf8(sorted.join('|')));
  const groups: string[] = [];
  for (let i = 0; i < 12; i++) {
    // Each group consumes 5 bytes of digest material → a 5-digit decimal chunk.
    let n = 0;
    for (let j = 0; j < 5; j++) {
      n = (n * 256 + (digest[(i * 5 + j) % digest.length] ?? 0)) % 100000;
    }
    groups.push(String(n).padStart(5, '0'));
  }
  return groups.join(' ');
}
