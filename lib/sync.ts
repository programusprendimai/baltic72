import Constants from 'expo-constants';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { SQLiteDatabase } from 'expo-sqlite';

import type { Shelter } from '@/lib/db/types';

type ShelterUpdateManifest = {
  /** Monotonically increasing integer or ISO timestamp identifying the dataset version. */
  version: string;
  /** When the JSON was generated, ISO-8601. */
  generated_at: string;
  /** Total feature count, used for a sanity check before swap. */
  count: number;
  /** Absolute URL to the shelters JSON payload (same shape as `data/seed/shelters.json`). */
  url: string;
  /** Lowercase hex SHA-256 of the exact JSON payload body. */
  payload_sha256: string;
  /** Human-readable source label for audit logs/debugging. */
  source?: string;
};

const META_LAST_VERSION = 'shelter_data_version';
const META_LAST_CHECK = 'shelter_data_last_check';
const FETCH_TIMEOUT_MS = 15_000;
const CHECK_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6h
const DEFAULT_MANIFEST_URL = 'https://api.baltic72.com/shelters/manifest';
const MIN_SHELTER_ROWS = 1_000;
const MAX_SHELTER_ROWS = 200_000;
const MAX_PAYLOAD_BYTES = 120 * 1024 * 1024;
const ALLOWED_UPDATE_HOSTS = new Set(['api.baltic72.com', 'raw.githubusercontent.com']);
const RAW_GITHUB_PATH_PREFIX = '/programusprendimai/baltic72/';
const HEX_SHA256_RE = /^[a-f0-9]{64}$/;
const VERSION_RE = /^[A-Za-z0-9._:-]{1,80}$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z?)?$/;
const COUNTRY_BOUNDS: Record<string, { minLat: number; maxLat: number; minLon: number; maxLon: number }> = {
  EE: { minLat: 57.0, maxLat: 60.1, minLon: 21.3, maxLon: 28.6 },
  LT: { minLat: 53.8, maxLat: 56.7, minLon: 20.7, maxLon: 26.9 },
  LV: { minLat: 55.4, maxLat: 58.2, minLon: 20.5, maxLon: 28.5 },
  PL: { minLat: 48.7, maxLat: 55.3, minLon: 13.9, maxLon: 24.3 },
};
const CATEGORY_TO_TYPE = {
  kas: 'collective_protection',
  priedanga: 'underground',
  evakuacija: 'assembly',
  sirena: 'siren',
} as const;
const REQUIRED_STRING_FIELDS = ['id', 'category', 'type', 'name', 'city', 'country', 'source'] as const;
const NULLABLE_STRING_FIELDS = [
  'manager',
  'address',
  'county',
  'municipality',
  'eldership',
  'hours',
  'notes',
  'updated_at',
  'evac_type',
] as const;
const NULLABLE_NUMBER_FIELDS = ['capacity', 'area_m2', 'siren_radius_m'] as const;
const NULLABLE_BOOL_FIELDS = [
  'accessible',
  'marked',
  'always_open',
  'has_lighting',
  'has_sanitation',
  'has_ventilation',
] as const;
const ALLOWED_SHELTER_KEYS = new Set([
  ...REQUIRED_STRING_FIELDS,
  ...NULLABLE_STRING_FIELDS,
  ...NULLABLE_NUMBER_FIELDS,
  ...NULLABLE_BOOL_FIELDS,
  'latitude',
  'longitude',
]);

function getManifestUrl(): string | null {
  const extra = (Constants.expoConfig?.extra ?? {}) as { shelterUpdateUrl?: string };
  const url = (extra.shelterUpdateUrl ?? '').trim();
  return url || DEFAULT_MANIFEST_URL;
}

/** Whether over-the-air shelter updates are configured (a manifest URL is set). */
export function isShelterUpdateConfigured(): boolean {
  return getManifestUrl() != null;
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal, cache: 'no-store' });
  } finally {
    clearTimeout(timer);
  }
}

function assertAllowedHttpsUrl(rawUrl: string, label: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`${label} URL is invalid`);
  }
  if (parsed.protocol !== 'https:') {
    throw new Error(`${label} URL must use HTTPS`);
  }
  if (parsed.username || parsed.password) {
    throw new Error(`${label} URL must not include credentials`);
  }
  if (!ALLOWED_UPDATE_HOSTS.has(parsed.hostname)) {
    throw new Error(`${label} host is not allowed`);
  }
  if (parsed.hostname === 'api.baltic72.com' && !parsed.pathname.startsWith('/shelters/')) {
    throw new Error(`${label} path is not allowed`);
  }
  if (
    parsed.hostname === 'raw.githubusercontent.com' &&
    !parsed.pathname.startsWith(RAW_GITHUB_PATH_PREFIX)
  ) {
    throw new Error(`${label} path is not allowed`);
  }
  return parsed;
}

function readContentLength(res: Response): number | null {
  const raw = res.headers.get('content-length');
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function assertJsonResponse(res: Response, label: string): void {
  const contentType = res.headers.get('content-type') ?? '';
  const normalized = contentType.toLowerCase();
  if (
    normalized &&
    !normalized.includes('application/json') &&
    !normalized.includes('text/json') &&
    !normalized.includes('text/plain')
  ) {
    throw new Error(`${label} response is not JSON`);
  }
}

function parseManifest(value: unknown): ShelterUpdateManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Manifest is not an object');
  }
  const manifest = value as Record<string, unknown>;
  const version = manifest.version;
  const generatedAt = manifest.generated_at;
  const count = manifest.count;
  const url = manifest.url;
  const payloadSha256 = manifest.payload_sha256;
  if (typeof version !== 'string' || !VERSION_RE.test(version)) {
    throw new Error('Manifest version is invalid');
  }
  if (typeof generatedAt !== 'string' || !ISO_DATE_RE.test(generatedAt)) {
    throw new Error('Manifest generated_at is invalid');
  }
  if (
    typeof count !== 'number' ||
    !Number.isInteger(count) ||
    count < MIN_SHELTER_ROWS ||
    count > MAX_SHELTER_ROWS
  ) {
    throw new Error('Manifest count is outside expected bounds');
  }
  if (typeof url !== 'string' || !url.trim()) {
    throw new Error('Manifest url is invalid');
  }
  if (typeof payloadSha256 !== 'string' || !HEX_SHA256_RE.test(payloadSha256)) {
    throw new Error('Manifest payload_sha256 is invalid');
  }
  assertAllowedHttpsUrl(url, 'Payload');
  return {
    version,
    generated_at: generatedAt,
    count,
    url,
    payload_sha256: payloadSha256,
    source: typeof manifest.source === 'string' ? manifest.source : undefined,
  };
}

function asNullableString(row: Record<string, unknown>, key: string, index: number): string | null {
  const value = row[key];
  if (value == null) return null;
  if (typeof value !== 'string') {
    throw new Error(`Shelter ${index} field ${key} must be a string or null`);
  }
  const trimmed = value.trim();
  if (trimmed.length > 2_000) {
    throw new Error(`Shelter ${index} field ${key} is too long`);
  }
  return trimmed || null;
}

function asRequiredString(row: Record<string, unknown>, key: string, index: number): string {
  const value = row[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Shelter ${index} field ${key} must be a non-empty string`);
  }
  const trimmed = value.trim();
  if (trimmed.length > 500) {
    throw new Error(`Shelter ${index} field ${key} is too long`);
  }
  return trimmed;
}

function asNullableNumber(row: Record<string, unknown>, key: string, index: number): number | null {
  const value = row[key];
  if (value == null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Shelter ${index} field ${key} must be a finite number or null`);
  }
  if (value < 0) {
    throw new Error(`Shelter ${index} field ${key} must not be negative`);
  }
  return value;
}

function asNullableBool(row: Record<string, unknown>, key: string, index: number): boolean | null {
  const value = row[key];
  if (value == null) return null;
  if (typeof value !== 'boolean') {
    throw new Error(`Shelter ${index} field ${key} must be a boolean or null`);
  }
  return value;
}

function validateShelters(value: unknown, expectedCount: number): Shelter[] {
  if (!Array.isArray(value)) {
    throw new Error('Data payload is not an array');
  }
  if (value.length !== expectedCount) {
    throw new Error(`Manifest count ${expectedCount} disagrees with payload ${value.length}`);
  }
  if (value.length < MIN_SHELTER_ROWS || value.length > MAX_SHELTER_ROWS) {
    throw new Error(`Payload row count is outside expected bounds: ${value.length}`);
  }

  const seenIds = new Set<string>();
  return value.map((item, index): Shelter => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`Shelter ${index} is not an object`);
    }
    const row = item as Record<string, unknown>;
    for (const key of Object.keys(row)) {
      if (!ALLOWED_SHELTER_KEYS.has(key)) {
        throw new Error(`Shelter ${index} has unexpected field ${key}`);
      }
    }

    const id = asRequiredString(row, 'id', index);
    if (seenIds.has(id)) {
      throw new Error(`Duplicate shelter id ${id}`);
    }
    seenIds.add(id);

    const category = asRequiredString(row, 'category', index);
    if (!(category in CATEGORY_TO_TYPE)) {
      throw new Error(`Shelter ${index} has invalid category`);
    }
    const type = asRequiredString(row, 'type', index);
    if (CATEGORY_TO_TYPE[category as keyof typeof CATEGORY_TO_TYPE] !== type) {
      throw new Error(`Shelter ${index} category/type mismatch`);
    }
    const country = asRequiredString(row, 'country', index);
    const bounds = COUNTRY_BOUNDS[country];
    if (!bounds) {
      throw new Error(`Shelter ${index} has invalid country`);
    }
    const latitude = row.latitude;
    const longitude = row.longitude;
    if (typeof latitude !== 'number' || !Number.isFinite(latitude)) {
      throw new Error(`Shelter ${index} latitude must be a finite number`);
    }
    if (typeof longitude !== 'number' || !Number.isFinite(longitude)) {
      throw new Error(`Shelter ${index} longitude must be a finite number`);
    }
    if (
      latitude < bounds.minLat ||
      latitude > bounds.maxLat ||
      longitude < bounds.minLon ||
      longitude > bounds.maxLon
    ) {
      throw new Error(`Shelter ${index} is outside the ${country} geofence`);
    }

    const normalized = {
      id,
      category: category as Shelter['category'],
      type: type as Shelter['type'],
      name: asRequiredString(row, 'name', index),
      manager: asNullableString(row, 'manager', index),
      latitude,
      longitude,
      address: asNullableString(row, 'address', index),
      city: asRequiredString(row, 'city', index),
      county: asNullableString(row, 'county', index),
      municipality: asNullableString(row, 'municipality', index),
      eldership: asNullableString(row, 'eldership', index),
      capacity: asNullableNumber(row, 'capacity', index),
      area_m2: asNullableNumber(row, 'area_m2', index),
      accessible: asNullableBool(row, 'accessible', index),
      marked: asNullableBool(row, 'marked', index),
      always_open: asNullableBool(row, 'always_open', index),
      has_lighting: asNullableBool(row, 'has_lighting', index),
      has_sanitation: asNullableBool(row, 'has_sanitation', index),
      has_ventilation: asNullableBool(row, 'has_ventilation', index),
      hours: asNullableString(row, 'hours', index),
      notes: asNullableString(row, 'notes', index),
      updated_at: asNullableString(row, 'updated_at', index),
      country,
      source: asRequiredString(row, 'source', index),
      siren_radius_m: asNullableNumber(row, 'siren_radius_m', index),
      evac_type: asNullableString(row, 'evac_type', index),
    };

    if (normalized.updated_at && !ISO_DATE_RE.test(normalized.updated_at)) {
      throw new Error(`Shelter ${index} updated_at is invalid`);
    }
    return normalized;
  });
}

function sha256Hex(text: string): string {
  return bytesToHex(sha256(new TextEncoder().encode(text)));
}

async function getMetaValue(db: SQLiteDatabase, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>(
    `SELECT value FROM meta WHERE key = ?`,
    key
  );
  return row?.value ?? null;
}

async function setMetaValue(
  db: SQLiteDatabase,
  key: string,
  value: string
): Promise<void> {
  await db.runAsync(
    `INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)`,
    key,
    value
  );
}

function boolToInt(value: boolean | null | undefined): number | null {
  if (value == null) return null;
  return value ? 1 : 0;
}

const SHELTER_COLUMNS = [
  'id',
  'category',
  'type',
  'name',
  'manager',
  'latitude',
  'longitude',
  'address',
  'city',
  'county',
  'municipality',
  'eldership',
  'capacity',
  'area_m2',
  'accessible',
  'marked',
  'always_open',
  'has_lighting',
  'has_sanitation',
  'has_ventilation',
  'hours',
  'notes',
  'updated_at',
  'country',
  'source',
  'siren_radius_m',
  'evac_type',
];

async function replaceShelters(db: SQLiteDatabase, rows: Shelter[]): Promise<void> {
  const placeholders = SHELTER_COLUMNS.map(() => '?').join(', ');
  const sql = `INSERT INTO shelters (${SHELTER_COLUMNS.join(', ')}) VALUES (${placeholders})`;

  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM shelters');
    const stmt = await db.prepareAsync(sql);
    try {
      for (const row of rows) {
        await stmt.executeAsync([
          row.id,
          row.category,
          row.type,
          row.name,
          row.manager,
          row.latitude,
          row.longitude,
          row.address,
          row.city,
          row.county,
          row.municipality,
          row.eldership,
          row.capacity,
          row.area_m2,
          boolToInt(row.accessible),
          boolToInt(row.marked),
          boolToInt(row.always_open),
          boolToInt(row.has_lighting),
          boolToInt(row.has_sanitation),
          boolToInt(row.has_ventilation),
          row.hours,
          row.notes,
          row.updated_at,
          row.country ?? 'LT',
          row.source ?? 'PAGD/data.gov.lt',
          row.siren_radius_m ?? null,
          row.evac_type ?? null,
        ]);
      }
    } finally {
      await stmt.finalizeAsync();
    }
  });
}

export type SyncResult =
  | { status: 'disabled' }
  | { status: 'unavailable' }
  | { status: 'cooldown' }
  | { status: 'up_to_date'; version: string }
  | { status: 'updated'; version: string; count: number }
  | { status: 'error'; message: string };

export async function refreshShelters(
  db: SQLiteDatabase,
  options: { force?: boolean } = {}
): Promise<SyncResult> {
  const manifestUrl = getManifestUrl();
  if (!manifestUrl) {
    return { status: 'disabled' };
  }

  if (!options.force) {
    const lastCheck = await getMetaValue(db, META_LAST_CHECK);
    if (lastCheck) {
      const elapsed = Date.now() - Number(lastCheck);
      if (Number.isFinite(elapsed) && elapsed < CHECK_COOLDOWN_MS) {
        return { status: 'cooldown' };
      }
    }
  }

  try {
    assertAllowedHttpsUrl(manifestUrl, 'Manifest');
    const manifestRes = await fetchWithTimeout(manifestUrl, FETCH_TIMEOUT_MS);
    if (manifestRes.status === 404) {
      return { status: 'unavailable' };
    }
    if (!manifestRes.ok) {
      throw new Error(`Manifest HTTP ${manifestRes.status}`);
    }
    assertJsonResponse(manifestRes, 'Manifest');
    const manifest = parseManifest(await manifestRes.json());

    await setMetaValue(db, META_LAST_CHECK, String(Date.now()));

    const currentVersion = await getMetaValue(db, META_LAST_VERSION);
    if (currentVersion === manifest.version) {
      return { status: 'up_to_date', version: manifest.version };
    }

    const dataRes = await fetchWithTimeout(manifest.url, FETCH_TIMEOUT_MS);
    if (!dataRes.ok) {
      throw new Error(`Data HTTP ${dataRes.status}`);
    }
    assertJsonResponse(dataRes, 'Data');
    const contentLength = readContentLength(dataRes);
    if (contentLength != null && contentLength > MAX_PAYLOAD_BYTES) {
      throw new Error('Data payload is too large');
    }
    const payloadText = await dataRes.text();
    if (new TextEncoder().encode(payloadText).byteLength > MAX_PAYLOAD_BYTES) {
      throw new Error('Data payload is too large');
    }
    const actualHash = sha256Hex(payloadText);
    if (actualHash !== manifest.payload_sha256) {
      throw new Error('Data payload hash mismatch');
    }
    const data = validateShelters(JSON.parse(payloadText), manifest.count);

    await replaceShelters(db, data);
    await setMetaValue(db, META_LAST_VERSION, manifest.version);
    return { status: 'updated', version: manifest.version, count: data.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: 'error', message };
  }
}

export async function getLastSyncVersion(db: SQLiteDatabase): Promise<string | null> {
  return getMetaValue(db, META_LAST_VERSION);
}

export async function getLastSyncCheck(db: SQLiteDatabase): Promise<Date | null> {
  const raw = await getMetaValue(db, META_LAST_CHECK);
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) ? new Date(n) : null;
}
