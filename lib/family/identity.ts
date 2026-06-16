/**
 * Device identity + group secret storage, backed by the OS keychain
 * (expo-secure-store). Private keys and the group key never touch JS-readable
 * storage or the network beyond what E2EE requires.
 */
import * as SecureStore from 'expo-secure-store';

import {
  b64uDecode,
  b64uEncode,
  deviceIdFromEdPub,
  generateIdentity,
  type RawIdentity,
} from '@/lib/family/crypto';

const K_ED_PRIV = 'family.ed.priv';
const K_ED_PUB = 'family.ed.pub';
const K_X_PRIV = 'family.x.priv';
const K_X_PUB = 'family.x.pub';
const K_GROUP = 'family.group'; // JSON { id, key, epoch } (key = base64url)
const K_NAME = 'family.displayName';
const K_COUNTERS = 'family.counters';
const K_FRESHNESS = 'family.freshness';

export type Identity = RawIdentity & { deviceId: string };
export type GroupSecret = { id: string; key: Uint8Array; epoch: number };
export type FamilyFieldFreshnessRecord = {
  counter: number;
  timestamp: number;
  envelope: string;
};

let cached: Identity | null = null;

const STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

async function set(key: string, value: string) {
  await SecureStore.setItemAsync(key, value, STORE_OPTIONS);
}
async function get(key: string) {
  return SecureStore.getItemAsync(key, STORE_OPTIONS);
}

async function del(key: string) {
  await SecureStore.deleteItemAsync(key);
}

export async function getOrCreateIdentity(): Promise<Identity> {
  if (cached) return cached;

  const edPriv = await get(K_ED_PRIV);
  const edPub = await get(K_ED_PUB);
  const xPriv = await get(K_X_PRIV);
  const xPub = await get(K_X_PUB);

  if (edPriv && edPub && xPriv && xPub) {
    const id: Identity = {
      edPriv: b64uDecode(edPriv),
      edPub: b64uDecode(edPub),
      xPriv: b64uDecode(xPriv),
      xPub: b64uDecode(xPub),
      deviceId: '',
    };
    id.deviceId = deviceIdFromEdPub(id.edPub);
    cached = id;
    return id;
  }

  const raw = generateIdentity();
  await set(K_ED_PRIV, b64uEncode(raw.edPriv));
  await set(K_ED_PUB, b64uEncode(raw.edPub));
  await set(K_X_PRIV, b64uEncode(raw.xPriv));
  await set(K_X_PUB, b64uEncode(raw.xPub));
  cached = { ...raw, deviceId: deviceIdFromEdPub(raw.edPub) };
  return cached;
}

export async function getGroupSecret(): Promise<GroupSecret | null> {
  const raw = await get(K_GROUP);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { id: string; key: string; epoch?: number };
    // Backwards compat: stored JSON predating rotation has no `epoch` → default 1.
    const epoch =
      typeof parsed.epoch === 'number' && Number.isSafeInteger(parsed.epoch) && parsed.epoch > 0
        ? parsed.epoch
        : 1;
    return { id: parsed.id, key: b64uDecode(parsed.key), epoch };
  } catch {
    return null;
  }
}

export async function setGroupSecret(id: string, key: Uint8Array, epoch: number): Promise<void> {
  await set(K_GROUP, JSON.stringify({ id, key: b64uEncode(key), epoch }));
}

export async function clearGroupSecret(): Promise<void> {
  await del(K_GROUP);
}

export async function getDisplayName(): Promise<string | null> {
  return get(K_NAME);
}
export async function setStoredDisplayName(name: string): Promise<void> {
  await set(K_NAME, name);
}

function counterKey(groupId: string, deviceId: string, field: string): string {
  return `${groupId}.${deviceId}.${field}`;
}

function isFreshnessRecord(value: unknown): value is FamilyFieldFreshnessRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Partial<FamilyFieldFreshnessRecord>;
  return (
    typeof record.counter === 'number' &&
    Number.isSafeInteger(record.counter) &&
    record.counter > 0 &&
    typeof record.timestamp === 'number' &&
    Number.isSafeInteger(record.timestamp) &&
    record.timestamp >= 0 &&
    typeof record.envelope === 'string' &&
    record.envelope.length > 0
  );
}

export async function getFamilyFieldFreshness(): Promise<
  Record<string, FamilyFieldFreshnessRecord>
> {
  const raw = await get(K_FRESHNESS);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const records: Record<string, FamilyFieldFreshnessRecord> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (isFreshnessRecord(value)) records[key] = value;
    }
    return records;
  } catch {
    return {};
  }
}

export async function setFamilyFieldFreshness(
  records: Record<string, FamilyFieldFreshnessRecord>
): Promise<void> {
  if (Object.keys(records).length === 0) {
    await del(K_FRESHNESS);
    return;
  }
  await set(K_FRESHNESS, JSON.stringify(records));
}

export async function nextFamilyMessageCounter(
  groupId: string,
  deviceId: string,
  field: string
): Promise<number> {
  let counters: Record<string, number> = {};
  const raw = await get(K_COUNTERS);
  if (raw) {
    try {
      counters = JSON.parse(raw) as Record<string, number>;
    } catch {
      counters = {};
    }
  }
  const key = counterKey(groupId, deviceId, field);
  const freshness = await getFamilyFieldFreshness();
  const freshnessPrefix = `${key}.`;
  const freshnessFloor = Object.entries(freshness).reduce((max, [freshnessKey, record]) => {
    if (!freshnessKey.startsWith(freshnessPrefix)) return max;
    return Math.max(max, record.counter);
  }, 0);
  const next = Math.max(0, Number(counters[key]) || 0, freshnessFloor) + 1;
  counters[key] = next;
  await set(K_COUNTERS, JSON.stringify(counters));
  return next;
}

export async function clearFamilyLocalData(): Promise<void> {
  await Promise.all([del(K_GROUP), del(K_NAME), del(K_COUNTERS), del(K_FRESHNESS)]);
}

export async function resetFamilyData(): Promise<void> {
  cached = null;
  await Promise.all([
    del(K_ED_PRIV),
    del(K_ED_PUB),
    del(K_X_PRIV),
    del(K_X_PUB),
    del(K_GROUP),
    del(K_NAME),
    del(K_COUNTERS),
    del(K_FRESHNESS),
  ]);
}
