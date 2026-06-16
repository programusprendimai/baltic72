import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import * as api from '@/lib/family/api';
import {
  b64uDecodeStrict,
  computeSafetyNumber,
  deviceIdFromEdPub,
  isFamilyFieldEnvelope,
  openGroupKeyEnvelope,
  openFamilyField,
  openWithGroupKey,
  randomGroupKey,
  sealFamilyField,
  sealGroupKeyForMember,
  verifyX25519Binding,
  type FamilyAeadContext,
  type FamilyEncryptedField,
} from '@/lib/family/crypto';
import {
  clearFamilyLocalData,
  getFamilyFieldFreshness,
  getDisplayName,
  getGroupSecret,
  getOrCreateIdentity,
  nextFamilyMessageCounter,
  resetFamilyData,
  setFamilyFieldFreshness,
  setGroupSecret,
  setStoredDisplayName,
  type FamilyFieldFreshnessRecord,
  type Identity,
} from '@/lib/family/identity';
import { useOnboarding } from '@/providers/OnboardingProvider';

export type FamilyStatus = 'safe' | 'enroute' | 'sheltered' | 'help' | 'unknown';

const STATUS_VALUES: FamilyStatus[] = ['safe', 'enroute', 'sheltered', 'help', 'unknown'];

export type Member = {
  deviceId: string;
  role: string;
  name: string;
  status: FamilyStatus;
  updatedAt: number | null;
  isSelf: boolean;
};

type PendingInvite = { groupId: string; token: string };

type FamilyContextValue = {
  ready: boolean;
  configured: boolean;
  hasGroup: boolean;
  members: Member[];
  myName: string;
  myStatus: FamilyStatus;
  safetyNumber: string;
  pendingInvite: PendingInvite | null;
  busy: boolean;
  error: string | null;
  createFamily: (name: string) => Promise<void>;
  acceptInvite: (name: string) => Promise<void>;
  dismissInvite: () => void;
  setStatus: (s: FamilyStatus) => Promise<void>;
  makeInviteLink: () => Promise<string>;
  submitInviteUrl: (url: string) => boolean;
  removeMember: (deviceId: string) => Promise<void>;
  leaveFamily: () => Promise<void>;
  refresh: () => Promise<void>;
};

const FamilyContext = createContext<FamilyContextValue | null>(null);

const INVITE_ORIGIN = 'https://baltic72.com';
const INVITE_PATH = '/join';
const INVITE_TTL_HOURS = 24;
const INVITE_MAX_USES = 1;
const MAX_INVITE_URL_LENGTH = 512;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const STATUS_FRESH_MS = 7 * 24 * 60 * 60 * 1000;
const GROUP_ID_RE = /^[A-Za-z0-9_-]{22}$/;
const INVITE_TOKEN_RE = /^[A-Za-z0-9_-]{32}$/;

type FreshnessState = Map<string, FamilyFieldFreshnessRecord>;
type FieldPayload = { value: string; ts: number; ctr: number };

function fieldContext(
  groupId: string,
  deviceId: string,
  field: FamilyEncryptedField,
  epoch: number
): FamilyAeadContext {
  return { groupId, deviceId, field, epoch };
}

function freshnessKey(context: FamilyAeadContext): string {
  return `${context.groupId}.${context.deviceId}.${context.field}.${context.epoch}`;
}

async function encodeField(
  key: Uint8Array,
  groupId: string,
  deviceId: string,
  field: FamilyEncryptedField,
  epoch: number,
  value: string,
  seen?: FreshnessState
): Promise<string> {
  const context = fieldContext(groupId, deviceId, field, epoch);
  const ctr = await nextFamilyMessageCounter(groupId, deviceId, field);
  const ts = Math.max(Date.now(), seen?.get(freshnessKey(context))?.timestamp ?? 0);
  return sealFamilyField(
    key,
    JSON.stringify({ v: 2, value, ts, ctr }),
    context
  );
}

async function encodeStatus(
  key: Uint8Array,
  groupId: string,
  deviceId: string,
  epoch: number,
  status: FamilyStatus,
  seen?: FreshnessState
): Promise<string> {
  return encodeField(key, groupId, deviceId, 'status', epoch, status, seen);
}

function recordsToFreshnessState(
  records: Record<string, FamilyFieldFreshnessRecord>
): FreshnessState {
  return new Map(Object.entries(records));
}

function freshnessStateToRecords(
  state: FreshnessState
): Record<string, FamilyFieldFreshnessRecord> {
  const records: Record<string, FamilyFieldFreshnessRecord> = {};
  for (const [key, value] of state) records[key] = value;
  return records;
}

function readFreshField(
  key: Uint8Array,
  ct: string,
  context: FamilyAeadContext,
  seen: FreshnessState,
  onAcceptedFreshness: () => void,
  maxAgeMs?: number
): FieldPayload | null {
  const plaintext = openFamilyField(key, ct, context);
  if (!isFamilyFieldEnvelope(ct)) {
    return { value: plaintext, ts: 0, ctr: 0 };
  }
  const payload = JSON.parse(plaintext) as Partial<FieldPayload> & { v?: number };
  const payloadValue = payload.value;
  const payloadTs = payload.ts;
  const payloadCtr = payload.ctr;
  if (
    payload.v !== 2 ||
    typeof payloadValue !== 'string' ||
    typeof payloadTs !== 'number' ||
    typeof payloadCtr !== 'number' ||
    !Number.isSafeInteger(payloadTs) ||
    !Number.isSafeInteger(payloadCtr) ||
    payloadTs < 0 ||
    payloadCtr <= 0
  ) {
    return null;
  }
  const freshPayload: FieldPayload = {
    value: payloadValue,
    ts: payloadTs,
    ctr: payloadCtr,
  };
  const now = Date.now();
  if (freshPayload.ts > now + MAX_CLOCK_SKEW_MS) return null;
  if (maxAgeMs !== undefined && now - freshPayload.ts > maxAgeMs) return null;

  const keyId = freshnessKey(context);
  const prior = seen.get(keyId);
  if (prior) {
    if (ct === prior.envelope) return freshPayload;
    if (freshPayload.ctr < prior.counter) return null;
    if (freshPayload.ts < prior.timestamp) return null;
    if (freshPayload.ctr === prior.counter) return null;
  }
  seen.set(keyId, {
    counter: freshPayload.ctr,
    timestamp: freshPayload.ts,
    envelope: ct,
  });
  onAcceptedFreshness();
  return freshPayload;
}

function decodeStatus(
  key: Uint8Array,
  groupId: string,
  deviceId: string,
  epoch: number,
  ct: string | null,
  seen: FreshnessState,
  onAcceptedFreshness: () => void
): FamilyStatus {
  if (!ct) return 'unknown';
  try {
    const context = fieldContext(groupId, deviceId, 'status', epoch);
    if (!isFamilyFieldEnvelope(ct)) {
      if (seen.has(freshnessKey(context))) return 'unknown';
      const obj = JSON.parse(openWithGroupKey(key, ct)) as { s?: string };
      return STATUS_VALUES.includes(obj.s as FamilyStatus) ? (obj.s as FamilyStatus) : 'unknown';
    }
    const payload = readFreshField(
      key,
      ct,
      context,
      seen,
      onAcceptedFreshness,
      STATUS_FRESH_MS
    );
    return STATUS_VALUES.includes(payload?.value as FamilyStatus)
      ? (payload?.value as FamilyStatus)
      : 'unknown';
  } catch {
    return 'unknown';
  }
}
function decodeName(
  key: Uint8Array,
  groupId: string,
  deviceId: string,
  epoch: number,
  ct: string | null,
  seen: FreshnessState,
  onAcceptedFreshness: () => void
): string {
  if (!ct) return '—';
  try {
    const context = fieldContext(groupId, deviceId, 'display', epoch);
    if (!isFamilyFieldEnvelope(ct)) {
      if (seen.has(freshnessKey(context))) return '—';
      return openWithGroupKey(key, ct) || '—';
    }
    return readFreshField(key, ct, context, seen, onAcceptedFreshness)?.value || '—';
  } catch {
    return '—';
  }
}

/**
 * Verify a peer's advertised X25519 key is bound to the Ed25519 identity that
 * the device id is derived from. Defeats a relay swapping in its own X25519 key
 * (key-substitution MITM). Returns false on any malformed input.
 */
function verifyMemberBinding(
  deviceId: string,
  edPubB64: string,
  xPubB64: string,
  sigB64: string
): boolean {
  try {
    const edPub = b64uDecodeStrict(edPubB64, 32);
    if (deviceIdFromEdPub(edPub) !== deviceId) return false;
    const xPub = b64uDecodeStrict(xPubB64, 32);
    const sig = b64uDecodeStrict(sigB64, 64);
    return verifyX25519Binding(edPub, xPub, sig);
  } catch {
    return false;
  }
}

/**
 * When true, a member whose X25519 key is NOT signature-bound to its Ed25519
 * identity is rejected for key wrap/unwrap. This fully closes the server-side
 * key-substitution MITM (a malicious relay can no longer strip signatures to
 * force the legacy path), but every interacting member must run a client build
 * that signs its key (build 9+, which backfills the signature on launch via
 * registerDevice). Set false ONLY to interoperate with a pre-9 fleet during
 * migration — do not ship that to the App Store as the steady state.
 */
const ENFORCE_MEMBER_KEY_BINDING = true;

/**
 * Gate for wrapping/unwrapping the group key to/from a member. Present + valid
 * signature → ok; present + invalid → never ok (relay-injected key); absent →
 * ok only when not enforcing.
 */
function memberBindingAcceptable(
  deviceId: string,
  edPubB64: string | null | undefined,
  xPubB64: string,
  sigB64: string | null | undefined
): boolean {
  if (!sigB64 || !edPubB64) return !ENFORCE_MEMBER_KEY_BINDING;
  return verifyMemberBinding(deviceId, edPubB64, xPubB64, sigB64);
}

/**
 * Safety number over every member's Ed25519 public key. Malformed keys are
 * skipped; an empty set yields ''. Members compare this out-of-band to confirm
 * no one's identity key was swapped by the relay.
 */
function computeSafetyNumberFromRows(rows: api.MemberRow[]): string {
  const pubs: Uint8Array[] = [];
  for (const r of rows) {
    try {
      pubs.push(b64uDecodeStrict(r.pub_ed25519, 32));
    } catch {
      // Skip a member with a malformed key rather than poison the whole number.
    }
  }
  if (pubs.length === 0) return '';
  return computeSafetyNumber(pubs);
}

function parseInviteUrl(url: string): PendingInvite | null {
  if (url.length > MAX_INVITE_URL_LENGTH) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const isVerifiedHttpsInvite =
    parsed.protocol === 'https:' &&
    parsed.host === 'baltic72.com' &&
    parsed.origin === INVITE_ORIGIN &&
    parsed.pathname === INVITE_PATH &&
    parsed.search === '' &&
    parsed.username === '' &&
    parsed.password === '';
  const isSchemeFallback =
    parsed.protocol === 'baltic72:' &&
    parsed.host === 'join' &&
    parsed.pathname === '' &&
    parsed.search === '' &&
    parsed.username === '' &&
    parsed.password === '';
  if (!isVerifiedHttpsInvite && !isSchemeFallback) {
    return null;
  }
  const hash = parsed.hash.startsWith('#') ? parsed.hash.slice(1) : '';
  if (!hash) return null;

  const params: Partial<Record<'v' | 'g' | 't', string>> = {};
  for (const pair of hash.split('&')) {
    const [rawKey, rawValue, extra] = pair.split('=');
    if (extra !== undefined || !rawKey || !rawValue) return null;
    if (!['v', 'g', 't'].includes(rawKey)) return null;
    const key = rawKey as 'v' | 'g' | 't';
    if (params[key] !== undefined) return null;
    params[key] = rawValue;
  }
  if (
    params.v !== '1' ||
    !params.g ||
    !GROUP_ID_RE.test(params.g) ||
    !params.t ||
    !INVITE_TOKEN_RE.test(params.t)
  ) {
    return null;
  }
  return { groupId: params.g, token: params.t };
}

function buildInviteLink(groupId: string, token: string): string {
  if (!GROUP_ID_RE.test(groupId) || !INVITE_TOKEN_RE.test(token)) {
    throw new Error('invalid invite parameters');
  }
  return `${INVITE_ORIGIN}${INVITE_PATH}#v=1&g=${groupId}&t=${token}`;
}

export function FamilyProvider({ children }: { children: ReactNode }) {
  const onboarding = useOnboarding();
  const [ready, setReady] = useState(false);
  const [hasGroup, setHasGroup] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [myName, setMyName] = useState('');
  const [myStatus, setMyStatus] = useState<FamilyStatus>('unknown');
  const [safetyNumber, setSafetyNumber] = useState('');
  const [pendingInvite, setPendingInvite] = useState<PendingInvite | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const identityRef = useRef<Identity | null>(null);
  const groupIdRef = useRef<string | null>(null);
  const groupKeyRef = useRef<Uint8Array | null>(null);
  const groupEpochRef = useRef(1);
  const wsRef = useRef<WebSocket | null>(null);
  const wsGenRef = useRef(0); // bumped on every (re)connect; invalidates stale sockets
  const reconnectDelayRef = useRef(1500);
  const freshnessRef = useRef<FreshnessState>(new Map());
  const freshnessDirtyRef = useRef(false);
  const freshnessPersistingRef = useRef(false);
  const lastSnapshotRef = useRef<api.MemberRow[]>([]);
  const keyEnvelopeSentRef = useRef<Set<string>>(new Set());
  const onboardingCompletedRef = useRef(false);
  const myStatusRef = useRef<FamilyStatus>('unknown');
  const configured = api.isConfigured();

  useEffect(() => {
    myStatusRef.current = myStatus;
  }, [myStatus]);

  useEffect(() => {
    onboardingCompletedRef.current = onboarding.ready && onboarding.completed;
  }, [onboarding.ready, onboarding.completed]);

  const teardownSocket = useCallback(() => {
    wsGenRef.current++; // any in-flight socket's handlers become no-ops
    if (wsRef.current) {
      wsRef.current.onclose = null; // don't let the close trigger a reconnect
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const markFreshnessDirty = useCallback(() => {
    freshnessDirtyRef.current = true;
  }, []);

  const persistFreshness = useCallback(async () => {
    if (freshnessPersistingRef.current || !freshnessDirtyRef.current) return;
    freshnessPersistingRef.current = true;
    try {
      while (freshnessDirtyRef.current) {
        freshnessDirtyRef.current = false;
        await setFamilyFieldFreshness(freshnessStateToRecords(freshnessRef.current));
      }
    } catch {
      freshnessDirtyRef.current = true;
    } finally {
      freshnessPersistingRef.current = false;
    }
  }, []);

  const loadFreshness = useCallback(async () => {
    freshnessRef.current = recordsToFreshnessState(await getFamilyFieldFreshness());
    freshnessDirtyRef.current = false;
  }, []);

  const clearLocalFamilyGroup = useCallback(async () => {
    teardownSocket();
    try {
      await clearFamilyLocalData();
    } catch (e) {
      setError(String(e));
    } finally {
      groupIdRef.current = null;
      groupKeyRef.current = null;
      groupEpochRef.current = 1;
      freshnessRef.current.clear();
      freshnessDirtyRef.current = false;
      lastSnapshotRef.current = [];
      keyEnvelopeSentRef.current.clear();
      reconnectDelayRef.current = 1500;
      setHasGroup(false);
      setMembers([]);
      setMyName('');
      setMyStatus('unknown');
      setSafetyNumber('');
      setPendingInvite(null);
    }
  }, [teardownSocket]);

  const grantGroupKeyToMembers = useCallback(async (rows: api.MemberRow[]) => {
    const identity = identityRef.current;
    const groupId = groupIdRef.current;
    const groupKey = groupKeyRef.current;
    if (!identity || !groupId || !groupKey) return;
    const epoch = groupEpochRef.current;

    await Promise.all(
      rows
        .filter((r) => r.device_id !== identity.deviceId && r.pub_x25519)
        .map(async (row) => {
          // Never wrap the group key to a recipient whose X25519 key isn't bound
          // to its identity (forged binding, or — when enforcing — absent binding
          // that a malicious relay could have stripped).
          if (!memberBindingAcceptable(row.device_id, row.pub_ed25519, row.pub_x25519, row.x25519_sig)) {
            console.warn(`family: rejecting key grant to ${row.device_id} — X25519 key not bound to identity`);
            return;
          }
          const sentKey = `${groupId}:${row.device_id}:${epoch}`;
          if (keyEnvelopeSentRef.current.has(sentKey)) return;
          try {
            const recipientPub = b64uDecodeStrict(row.pub_x25519, 32);
            const ciphertext = sealGroupKeyForMember(identity.xPriv, recipientPub, groupId, groupKey);
            await api.putKeyEnvelope(identity, groupId, row.device_id, {
              key_epoch: epoch,
              ciphertext,
            });
            keyEnvelopeSentRef.current.add(sentKey);
          } catch {
            // Retry on the next snapshot or member_joined event.
          }
        })
    );
  }, []);

  const buildMembers = useCallback((rows: api.MemberRow[]): Member[] => {
    const key = groupKeyRef.current;
    const groupId = groupIdRef.current;
    const epoch = groupEpochRef.current;
    const selfId = identityRef.current?.deviceId;
    if (!key || !groupId) return [];
    return rows.map((r) => ({
      deviceId: r.device_id,
      role: r.role,
      name: decodeName(
        key,
        groupId,
        r.device_id,
        epoch,
        r.display_ciphertext,
        freshnessRef.current,
        markFreshnessDirty
      ),
      status: decodeStatus(
        key,
        groupId,
        r.device_id,
        epoch,
        r.status_ciphertext,
        freshnessRef.current,
        markFreshnessDirty
      ),
      updatedAt: r.status_updated_at,
      isSelf: r.device_id === selfId,
    }));
  }, [markFreshnessDirty]);

  // Re-encrypt our own display name + status under the current epoch and push
  // them, mirroring how createFamily seals fields. Used after we adopt a rotated
  // key so peers can read us on the new epoch.
  const reencodeOwnFields = useCallback(async () => {
    const identity = identityRef.current;
    const groupId = groupIdRef.current;
    const key = groupKeyRef.current;
    if (!identity || !groupId || !key) return;
    const epoch = groupEpochRef.current;
    const name = (await getDisplayName()) ?? '';
    const display_ciphertext = name
      ? await encodeField(key, groupId, identity.deviceId, 'display', epoch, name, freshnessRef.current)
      : undefined;
    const status_ciphertext = await encodeStatus(
      key,
      groupId,
      identity.deviceId,
      epoch,
      myStatusRef.current,
      freshnessRef.current
    );
    await api.updateMe(identity, groupId, { display_ciphertext, status_ciphertext });
    await persistFreshness();
  }, [persistFreshness]);

  // If the server reports a newer key epoch than we hold, try to adopt it by
  // opening a key envelope wrapped to us for that epoch from a binding-verified
  // sender. Returns true once we are on snap.keyEpoch. If the owner hasn't
  // wrapped to us yet, returns false and we retry on the next refresh.
  const adoptEpochIfNeeded = useCallback(
    async (snapEpoch: number): Promise<boolean> => {
      const identity = identityRef.current;
      const groupId = groupIdRef.current;
      if (!identity || !groupId) return false;
      if (snapEpoch <= groupEpochRef.current) return true;

      const { envelopes } = await api.getMyKeyEnvelopes(identity, groupId);
      for (const envelope of envelopes) {
        if (envelope.key_epoch !== snapEpoch) continue;
        // Only adopt a key from a sender whose X25519 binding is acceptable
        // (present + valid; absent rejected when enforcing).
        if (
          !memberBindingAcceptable(
            envelope.sender_device_id,
            envelope.sender_pub_ed25519,
            envelope.sender_pub_x25519,
            envelope.sender_x25519_sig
          )
        ) {
          console.warn(
            `family: rejecting epoch envelope from ${envelope.sender_device_id} — sender key not bound`
          );
          continue;
        }
        try {
          const newKey = openGroupKeyEnvelope(
            identity.xPriv,
            b64uDecodeStrict(envelope.sender_pub_x25519, 32),
            groupId,
            envelope.ciphertext
          );
          groupKeyRef.current = newKey;
          groupEpochRef.current = snapEpoch;
          await setGroupSecret(groupId, newKey, snapEpoch);
          // Re-encode our own fields under the new epoch so peers can read us.
          await reencodeOwnFields();
          return true;
        } catch {
          // Wrong sender / not decryptable — try the next envelope.
        }
      }
      return false;
    },
    [reencodeOwnFields]
  );

  const refresh = useCallback(async () => {
    const identity = identityRef.current;
    const groupId = groupIdRef.current;
    if (!identity || !groupId) return;
    const snap = await api.getSnapshot(identity, groupId);
    lastSnapshotRef.current = snap.members;

    // Adopt a rotated group key before decrypting: ciphertext on the new epoch
    // can't be opened with the old key (the epoch is bound into the AAD). Until
    // we adopt, new-epoch members render as 'unknown'/'—' — an acceptable
    // transient window. Guarded so we only attempt when the server is ahead.
    if (typeof snap.keyEpoch === 'number' && snap.keyEpoch > groupEpochRef.current) {
      await adoptEpochIfNeeded(snap.keyEpoch);
    }

    void grantGroupKeyToMembers(snap.members);
    const list = buildMembers(snap.members);
    await persistFreshness();
    setMembers(list);
    setSafetyNumber(computeSafetyNumberFromRows(snap.members));
    const me = list.find((m) => m.isSelf);
    if (me) {
      setMyStatus(me.status);
      if (me.name !== '—') setMyName(me.name);
    }
  }, [adoptEpochIfNeeded, buildMembers, grantGroupKeyToMembers, persistFreshness]);

  const handleStatusEvent = useCallback(
    async (e: Extract<api.WsEvent, { type: 'status' }>) => {
      const key = groupKeyRef.current;
      const activeGroupId = groupIdRef.current;
      const epoch = groupEpochRef.current;
      if (!key || !activeGroupId) return;

      const status = decodeStatus(
        key,
        activeGroupId,
        e.deviceId,
        epoch,
        e.status_ciphertext,
        freshnessRef.current,
        markFreshnessDirty
      );
      const name = e.display_ciphertext
        ? decodeName(
            key,
            activeGroupId,
            e.deviceId,
            epoch,
            e.display_ciphertext,
            freshnessRef.current,
            markFreshnessDirty
          )
        : null;
      await persistFreshness();

      setMembers((prev) =>
        prev.map((m) =>
          m.deviceId === e.deviceId
            ? {
                ...m,
                status,
                name: name ?? m.name,
                updatedAt: e.ts,
              }
            : m
        )
      );
      if (e.deviceId === identityRef.current?.deviceId) {
        setMyStatus(status);
        if (name && name !== '—') setMyName(name);
      }
    },
    [markFreshnessDirty, persistFreshness]
  );

  const handleFamilyEvent = useCallback(
    async (e: api.WsEvent) => {
      try {
        if (e.type === 'status') {
          await handleStatusEvent(e);
          return;
        }
        if (e.type === 'member_left' && e.deviceId === identityRef.current?.deviceId) {
          await clearLocalFamilyGroup();
          return;
        }
        await refresh();
      } catch (err) {
        setError(String(err));
      }
    },
    [clearLocalFamilyGroup, handleStatusEvent, refresh]
  );

  const connectSocket = useCallback(async () => {
    const identity = identityRef.current;
    const groupId = groupIdRef.current;
    if (!identity || !groupId) return;

    // Tear down any prior socket without letting its close schedule a reconnect,
    // then claim a generation so only THIS socket can drive reconnects.
    teardownSocket();
    const gen = wsGenRef.current;

    let stableTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleReconnect = () => {
      if (stableTimer) clearTimeout(stableTimer);
      if (gen !== wsGenRef.current || groupIdRef.current !== groupId) return;
      const delay = reconnectDelayRef.current;
      reconnectDelayRef.current = Math.min(delay * 2, 30000); // exponential backoff
      setTimeout(() => void connectSocket(), delay);
    };

    try {
      const ws = await api.connectGroupSocket(identity, groupId, {
        onOpen: () => {
          // Only treat the link as healthy (reset backoff) if it HOLDS for a few
          // seconds — a socket that opens then immediately drops must back off.
          stableTimer = setTimeout(() => {
            if (gen === wsGenRef.current) reconnectDelayRef.current = 1500;
          }, 5000);
          void refresh(); // resync to catch anything missed while disconnected
        },
        onEvent: (e) => {
          void handleFamilyEvent(e);
        },
        onClose: scheduleReconnect,
      });
      // A newer connect may have superseded us while awaiting; if so, discard.
      if (gen !== wsGenRef.current) {
        ws.onclose = null;
        ws.close();
        return;
      }
      wsRef.current = ws;
    } catch {
      scheduleReconnect();
    }
  }, [handleFamilyEvent, refresh, teardownSocket]);

  const enterGroup = useCallback(
    async (groupId: string, key: Uint8Array, epoch: number) => {
      groupIdRef.current = groupId;
      groupKeyRef.current = key;
      groupEpochRef.current = epoch;
      setPendingInvite(null);
      setHasGroup(true);
      await loadFreshness();
      await refresh();
      await connectSocket();
    },
    [connectSocket, loadFreshness, refresh]
  );

  const waitForGroupKey = useCallback(
    async (groupId: string): Promise<{ key: Uint8Array; epoch: number }> => {
    const identity = identityRef.current;
    if (!identity) throw new Error('no identity');
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      const { envelopes } = await api.getMyKeyEnvelopes(identity, groupId);
      for (const envelope of envelopes) {
        // Only open an envelope from a sender whose X25519 binding is acceptable
        // (present + valid; absent rejected when enforcing).
        if (
          !memberBindingAcceptable(
            envelope.sender_device_id,
            envelope.sender_pub_ed25519,
            envelope.sender_pub_x25519,
            envelope.sender_x25519_sig
          )
        ) {
          console.warn(
            `family: rejecting envelope from ${envelope.sender_device_id} — sender key not bound`
          );
          continue;
        }
        try {
          const key = openGroupKeyEnvelope(
            identity.xPriv,
            b64uDecodeStrict(envelope.sender_pub_x25519, 32),
            groupId,
            envelope.ciphertext
          );
          // Adopt the epoch the owner wrapped under (≥1; falls back to 1 for
          // legacy envelopes that predate epoch tracking).
          const epoch =
            typeof envelope.key_epoch === 'number' && envelope.key_epoch > 0
              ? envelope.key_epoch
              : 1;
          return { key, epoch };
        } catch {
          // Try another sender envelope, if available.
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    throw new Error('Timed out waiting for group key');
    },
    []
  );

  // Bootstrap: identity + register + resume existing group.
  useEffect(() => {
    if (!configured) {
      setReady(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const identity = await getOrCreateIdentity();
        identityRef.current = identity;
        await api.registerDevice(identity).catch(() => undefined);
        const name = await getDisplayName();
        if (name && !cancelled) setMyName(name);
        const secret = await getGroupSecret();
        if (secret && !cancelled) await enterGroup(secret.id, secret.key, secret.epoch);
      } catch (e) {
        if (!cancelled) setError(String(e));
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
      teardownSocket();
    };
  }, [configured, enterGroup, teardownSocket]);

  // Deep-link invites: https://baltic72.com/join#v=1&g=…&t=…
  useEffect(() => {
    if (!ready) return;
    const handle = (url: string | null) => {
      if (!url) return;
      const invite = parseInviteUrl(url);
      if (!invite) return;
      if (groupIdRef.current) {
        setPendingInvite(null);
        return;
      }
      setPendingInvite(invite);
      if (onboardingCompletedRef.current) {
        router.navigate('/(tabs)/family');
      }
    };
    void Linking.getInitialURL().then(handle);
    const sub = Linking.addEventListener('url', (e) => handle(e.url));
    return () => sub.remove();
  }, [ready]);

  useEffect(() => {
    if (onboarding.ready && onboarding.completed && pendingInvite && !hasGroup) {
      router.navigate('/(tabs)/family');
    }
  }, [hasGroup, onboarding.ready, onboarding.completed, pendingInvite]);

  // Polling fallback: keep statuses fresh even if the WebSocket is flaky on a
  // given network. The WS is the fast path; this guarantees eventual delivery.
  useEffect(() => {
    if (!hasGroup) return;
    const id = setInterval(() => void refresh(), 6000);
    return () => clearInterval(id);
  }, [hasGroup, refresh]);

  const createFamily = useCallback(
    async (name: string) => {
      const identity = identityRef.current;
      if (!identity) return;
      setBusy(true);
      setError(null);
      try {
        const key = randomGroupKey();
        const epoch = 1; // new groups start at epoch 1
        await setStoredDisplayName(name);
        const { groupId } = await api.createGroup(identity, {});
        const display_ciphertext = await encodeField(
          key,
          groupId,
          identity.deviceId,
          'display',
          epoch,
          name,
          freshnessRef.current
        );
        const status_ciphertext = await encodeStatus(
          key,
          groupId,
          identity.deviceId,
          epoch,
          'safe',
          freshnessRef.current
        );
        await api.updateMe(identity, groupId, { display_ciphertext, status_ciphertext });
        decodeName(
          key,
          groupId,
          identity.deviceId,
          epoch,
          display_ciphertext,
          freshnessRef.current,
          markFreshnessDirty
        );
        decodeStatus(
          key,
          groupId,
          identity.deviceId,
          epoch,
          status_ciphertext,
          freshnessRef.current,
          markFreshnessDirty
        );
        await persistFreshness();
        await setGroupSecret(groupId, key, epoch);
        setMyName(name);
        setMyStatus('safe');
        await enterGroup(groupId, key, epoch);
      } catch (e) {
        setError(String(e));
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [enterGroup, markFreshnessDirty, persistFreshness]
  );

  const acceptInvite = useCallback(
    async (name: string) => {
      const identity = identityRef.current;
      if (!identity || !pendingInvite) return;
      if (groupIdRef.current) {
        setPendingInvite(null);
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const { groupId, token } = pendingInvite;
        await setStoredDisplayName(name);
        await api.joinGroup(identity, groupId, { token });
        const { key, epoch } = await waitForGroupKey(groupId);
        const display_ciphertext = await encodeField(
          key,
          groupId,
          identity.deviceId,
          'display',
          epoch,
          name,
          freshnessRef.current
        );
        const status_ciphertext = await encodeStatus(
          key,
          groupId,
          identity.deviceId,
          epoch,
          'safe',
          freshnessRef.current
        );
        await api.updateMe(identity, groupId, { display_ciphertext, status_ciphertext });
        decodeName(
          key,
          groupId,
          identity.deviceId,
          epoch,
          display_ciphertext,
          freshnessRef.current,
          markFreshnessDirty
        );
        decodeStatus(
          key,
          groupId,
          identity.deviceId,
          epoch,
          status_ciphertext,
          freshnessRef.current,
          markFreshnessDirty
        );
        await persistFreshness();
        await setGroupSecret(groupId, key, epoch);
        setMyName(name);
        setMyStatus('safe');
        setPendingInvite(null);
        await enterGroup(groupId, key, epoch);
      } catch (e) {
        setError(String(e));
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [enterGroup, markFreshnessDirty, pendingInvite, persistFreshness, waitForGroupKey]
  );

  const dismissInvite = useCallback(() => setPendingInvite(null), []);

  const submitInviteUrl = useCallback((url: string): boolean => {
    const invite = parseInviteUrl(url);
    if (!invite) return false;
    if (groupIdRef.current) {
      setPendingInvite(null);
      return false;
    }
    setPendingInvite(invite);
    return true;
  }, []);

  const setStatus = useCallback(async (s: FamilyStatus) => {
    const identity = identityRef.current;
    const groupId = groupIdRef.current;
    const key = groupKeyRef.current;
    const epoch = groupEpochRef.current;
    if (!identity || !groupId || !key) return;
    setMyStatus(s);
    setMembers((prev) => prev.map((m) => (m.isSelf ? { ...m, status: s, updatedAt: Date.now() } : m)));
    try {
      const status_ciphertext = await encodeStatus(
        key,
        groupId,
        identity.deviceId,
        epoch,
        s,
        freshnessRef.current
      );
      await api.updateMe(identity, groupId, {
        status_ciphertext,
      });
      decodeStatus(
        key,
        groupId,
        identity.deviceId,
        epoch,
        status_ciphertext,
        freshnessRef.current,
        markFreshnessDirty
      );
      await persistFreshness();
    } catch (e) {
      setError(String(e));
    }
  }, [markFreshnessDirty, persistFreshness]);

  const makeInviteLink = useCallback(async () => {
    const identity = identityRef.current;
    const groupId = groupIdRef.current;
    const key = groupKeyRef.current;
    if (!identity || !groupId || !key) throw new Error('no group');
    const { token } = await api.createInvite(identity, groupId, {
      ttlHours: INVITE_TTL_HOURS,
      maxUses: INVITE_MAX_USES,
    });
    return buildInviteLink(groupId, token);
  }, []);

  const removeMember = useCallback(
    async (deviceId: string) => {
      const identity = identityRef.current;
      const groupId = groupIdRef.current;
      if (!identity || !groupId) return;
      await api.removeMember(identity, groupId, deviceId);

      // Re-key on removal so the removed device can never read future updates.
      // Only the owner may rotate; everyone else just refreshes (and will adopt
      // the new epoch once the owner wraps the new key to them).
      const isOwner = lastSnapshotRef.current.find((m) => m.device_id === identity.deviceId)?.role === 'owner';
      if (isOwner) {
        const newEpoch = groupEpochRef.current + 1;
        const newKey = randomGroupKey();
        try {
          await api.rotateGroup(identity, groupId, newEpoch);
        } catch (e) {
          // 409 conflict / not owner / race — leave the local key untouched; the
          // member is still removed. We'll converge on the next rotation.
          console.warn(`family: group rotation failed; skipping re-key: ${String(e)}`);
          await refresh();
          return;
        }

        // Fetch a fresh roster and wrap the new key to every remaining,
        // binding-verified member (excluding self and the removed device).
        const snap = await api.getSnapshot(identity, groupId);
        await Promise.all(
          snap.members
            .filter(
              (row) =>
                row.device_id !== identity.deviceId &&
                row.device_id !== deviceId &&
                row.pub_x25519
            )
            .map(async (row) => {
              if (!memberBindingAcceptable(row.device_id, row.pub_ed25519, row.pub_x25519, row.x25519_sig)) {
                console.warn(`family: skipping re-key to ${row.device_id} — X25519 key not bound to identity`);
                return;
              }
              try {
                const recipientPub = b64uDecodeStrict(row.pub_x25519, 32);
                const ciphertext = sealGroupKeyForMember(identity.xPriv, recipientPub, groupId, newKey);
                await api.putKeyEnvelope(identity, groupId, row.device_id, {
                  key_epoch: newEpoch,
                  ciphertext,
                });
                keyEnvelopeSentRef.current.add(`${groupId}:${row.device_id}:${newEpoch}`);
              } catch {
                // Retry via grantGroupKeyToMembers on the next snapshot.
              }
            })
        );

        // Adopt the new key locally.
        groupKeyRef.current = newKey;
        groupEpochRef.current = newEpoch;
        await setGroupSecret(groupId, newKey, newEpoch);
        // Re-encrypt own display + status under the new epoch so peers (and we)
        // can read us once they adopt; AAD binds the epoch.
        await reencodeOwnFields();
      }
      await refresh();
    },
    [reencodeOwnFields, refresh]
  );

  const leaveFamily = useCallback(async () => {
    const identity = identityRef.current;
    const groupId = groupIdRef.current;
    if (identity && groupId) {
      await api.removeMember(identity, groupId, identity.deviceId).catch(() => undefined);
    }
    teardownSocket();
    await resetFamilyData();
    const nextIdentity = await getOrCreateIdentity();
    identityRef.current = nextIdentity;
    await api.registerDevice(nextIdentity).catch(() => undefined);
    groupIdRef.current = null;
    groupKeyRef.current = null;
    groupEpochRef.current = 1;
    freshnessRef.current.clear();
    freshnessDirtyRef.current = false;
    lastSnapshotRef.current = [];
    keyEnvelopeSentRef.current.clear();
    reconnectDelayRef.current = 1500;
    setHasGroup(false);
    setMembers([]);
    setMyName('');
    setMyStatus('unknown');
    setSafetyNumber('');
    setPendingInvite(null);
  }, [teardownSocket]);

  const value = useMemo<FamilyContextValue>(
    () => ({
      ready,
      configured,
      hasGroup,
      members,
      myName,
      myStatus,
      safetyNumber,
      pendingInvite,
      busy,
      error,
      createFamily,
      acceptInvite,
      dismissInvite,
      setStatus,
      makeInviteLink,
      submitInviteUrl,
      removeMember,
      leaveFamily,
      refresh,
    }),
    [
      ready,
      configured,
      hasGroup,
      members,
      myName,
      myStatus,
      safetyNumber,
      pendingInvite,
      busy,
      error,
      createFamily,
      acceptInvite,
      dismissInvite,
      setStatus,
      makeInviteLink,
      submitInviteUrl,
      removeMember,
      leaveFamily,
      refresh,
    ]
  );

  return <FamilyContext.Provider value={value}>{children}</FamilyContext.Provider>;
}

export function useFamily(): FamilyContextValue {
  const ctx = useContext(FamilyContext);
  if (!ctx) throw new Error('useFamily must be used within FamilyProvider');
  return ctx;
}
