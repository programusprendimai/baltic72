import type { SQLiteDatabase } from 'expo-sqlite';

import type { ChecklistItem, Shelter, ShelterCategory } from '@/lib/db/types';

type ShelterRow = Omit<
  Shelter,
  | 'accessible'
  | 'marked'
  | 'always_open'
  | 'has_lighting'
  | 'has_sanitation'
  | 'has_ventilation'
> & {
  accessible: number | null;
  marked: number | null;
  always_open: number | null;
  has_lighting: number | null;
  has_sanitation: number | null;
  has_ventilation: number | null;
};

const SELECT_SHELTER = `
  id, category, type, name, manager, latitude, longitude, address, city,
  county, municipality, eldership, capacity, area_m2,
  accessible, marked, always_open, has_lighting, has_sanitation, has_ventilation,
  hours, notes, updated_at, country, source, siren_radius_m, evac_type
`;

function intToBool(value: number | null | undefined): boolean | null {
  if (value == null) return null;
  return value !== 0;
}

function hydrate(row: ShelterRow): Shelter {
  return {
    ...row,
    accessible: intToBool(row.accessible),
    marked: intToBool(row.marked),
    always_open: intToBool(row.always_open),
    has_lighting: intToBool(row.has_lighting),
    has_sanitation: intToBool(row.has_sanitation),
    has_ventilation: intToBool(row.has_ventilation),
  };
}

function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export type ShelterFilter = {
  categories?: ShelterCategory[];
  municipality?: string;
  limit?: number;
};

export async function getAllShelters(
  db: SQLiteDatabase,
  filter: ShelterFilter = {}
): Promise<Shelter[]> {
  const where: string[] = [];
  const params: (string | number)[] = [];

  if (filter.categories?.length) {
    where.push(
      `category IN (${filter.categories.map(() => '?').join(', ')})`
    );
    params.push(...filter.categories);
  }
  if (filter.municipality) {
    where.push(`municipality = ?`);
    params.push(filter.municipality);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const limitSql = filter.limit ? `LIMIT ${Math.max(1, filter.limit | 0)}` : '';

  const rows = await db.getAllAsync<ShelterRow>(
    `SELECT ${SELECT_SHELTER} FROM shelters ${whereSql} ORDER BY city, name ${limitSql}`,
    ...params
  );
  return rows.map(hydrate);
}

export async function countShelters(
  db: SQLiteDatabase,
  filter: ShelterFilter = {}
): Promise<number> {
  const where: string[] = [];
  const params: (string | number)[] = [];

  if (filter.categories?.length) {
    where.push(
      `category IN (${filter.categories.map(() => '?').join(', ')})`
    );
    params.push(...filter.categories);
  }
  if (filter.municipality) {
    where.push(`municipality = ?`);
    params.push(filter.municipality);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM shelters ${whereSql}`,
    ...params
  );
  return row?.count ?? 0;
}

export async function countSheltersByCategory(
  db: SQLiteDatabase
): Promise<Record<ShelterCategory, number>> {
  const rows = await db.getAllAsync<{ category: ShelterCategory; count: number }>(
    `SELECT category, COUNT(*) as count FROM shelters GROUP BY category`
  );
  const out: Record<ShelterCategory, number> = {
    kas: 0,
    priedanga: 0,
    evakuacija: 0,
    sirena: 0,
  };
  for (const row of rows) {
    out[row.category] = row.count;
  }
  return out;
}

export async function getSheltersNear(
  db: SQLiteDatabase,
  latitude: number,
  longitude: number,
  filter: ShelterFilter & { radiusDeg?: number } = {}
): Promise<Shelter[]> {
  const limit = filter.limit ?? 20;
  // 1° lat ≈ 111 km — use a generous bounding box, then refine with haversine.
  const radiusDeg = filter.radiusDeg ?? 0.6;

  const where: string[] = [
    'latitude BETWEEN ? AND ?',
    'longitude BETWEEN ? AND ?',
  ];
  const params: (string | number)[] = [
    latitude - radiusDeg,
    latitude + radiusDeg,
    longitude - radiusDeg,
    longitude + radiusDeg,
  ];

  if (filter.categories?.length) {
    where.push(
      `category IN (${filter.categories.map(() => '?').join(', ')})`
    );
    params.push(...filter.categories);
  }
  if (filter.municipality) {
    where.push(`municipality = ?`);
    params.push(filter.municipality);
  }

  const rows = await db.getAllAsync<ShelterRow>(
    `SELECT ${SELECT_SHELTER} FROM shelters WHERE ${where.join(' AND ')}`,
    ...params
  );

  const hydrated = rows.map(hydrate).map((shelter) => ({
    ...shelter,
    distanceKm: haversineKm(latitude, longitude, shelter.latitude, shelter.longitude),
  }));

  hydrated.sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));

  if (hydrated.length >= limit) {
    return hydrated.slice(0, limit);
  }

  // Fallback when nothing is nearby (e.g. user outside LT): widen to whole table.
  const all = await getAllShelters(db, {
    categories: filter.categories,
    municipality: filter.municipality,
  });
  const enriched = all.map((shelter) => ({
    ...shelter,
    distanceKm: haversineKm(latitude, longitude, shelter.latitude, shelter.longitude),
  }));
  enriched.sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
  return enriched.slice(0, limit);
}

export type Bounds = {
  south: number;
  north: number;
  west: number;
  east: number;
};

/**
 * All shelters inside a lat/lng bounding box (the visible map region),
 * ordered by distance to `center` (the viewport centre — what the user is
 * looking at), capped at `limit`. Used for viewport-based loading + clustering.
 *
 * `distanceKm` (shown on the card) is measured from `userLocation` — the
 * device's real GPS position — NOT from the viewport centre. When the user
 * hasn't shared location (`userLocation` is null) `distanceKm` is left
 * undefined so the UI can hide the "x km away" label entirely.
 */
export async function getSheltersInBounds(
  db: SQLiteDatabase,
  bounds: Bounds,
  center: { latitude: number; longitude: number },
  filter: ShelterFilter = {},
  userLocation: { latitude: number; longitude: number } | null = null
): Promise<Shelter[]> {
  const where: string[] = [
    'latitude BETWEEN ? AND ?',
    'longitude BETWEEN ? AND ?',
  ];
  const params: (string | number)[] = [
    bounds.south,
    bounds.north,
    bounds.west,
    bounds.east,
  ];

  if (filter.categories?.length) {
    where.push(`category IN (${filter.categories.map(() => '?').join(', ')})`);
    params.push(...filter.categories);
  }
  if (filter.municipality) {
    where.push(`municipality = ?`);
    params.push(filter.municipality);
  }

  // Order by (planar) distance to the centre IN SQL before the cap, so the
  // rows we keep are genuinely the nearest — not an arbitrary first slice.
  const cap = Math.max(1, Math.floor(Number(filter.limit ?? 600)) || 600);
  const orderParams = [
    center.latitude,
    center.latitude,
    center.longitude,
    center.longitude,
  ];

  const rows = await db.getAllAsync<ShelterRow>(
    `SELECT ${SELECT_SHELTER} FROM shelters WHERE ${where.join(' AND ')}
     ORDER BY ((latitude - ?) * (latitude - ?) + (longitude - ?) * (longitude - ?))
     LIMIT ${cap}`,
    ...params,
    ...orderParams
  );

  return rows
    .map(hydrate)
    .map((shelter) => ({
      shelter: {
        ...shelter,
        // Distance from the user's real location (for display), or undefined
        // when location isn't shared — never from the viewport centre.
        distanceKm: userLocation
          ? haversineKm(
              userLocation.latitude,
              userLocation.longitude,
              shelter.latitude,
              shelter.longitude
            )
          : undefined,
      },
      // Ordering key: proximity to the viewport centre, independent of whether
      // the user has shared their location.
      centerKm: haversineKm(
        center.latitude,
        center.longitude,
        shelter.latitude,
        shelter.longitude
      ),
    }))
    .sort((a, b) => a.centerKm - b.centerKm)
    .map((entry) => entry.shelter);
}

export type ClusterCell = {
  gx: number;
  gy: number;
  count: number;
  lat: number;
  lng: number;
  sampleId: string;
};

/**
 * Grid-cluster EVERY shelter in the bounding box, in SQL. Returns one row per
 * occupied cell (at most ~cols² rows) with its member count and centroid — so
 * a zoomed-out map represents all ~14k shelters as a few count bubbles, with no
 * row cap dropping whole regions. `cell` is the cell size in degrees.
 */
export async function getClusterCells(
  db: SQLiteDatabase,
  bounds: Bounds,
  cell: { lat: number; lng: number },
  filter: ShelterFilter = {}
): Promise<ClusterCell[]> {
  const where: string[] = [
    'latitude BETWEEN ? AND ?',
    'longitude BETWEEN ? AND ?',
  ];
  // First two params feed the CAST() grid expressions; bounds follow.
  const params: (string | number)[] = [
    cell.lng,
    cell.lat,
    bounds.south,
    bounds.north,
    bounds.west,
    bounds.east,
  ];

  if (filter.categories?.length) {
    where.push(`category IN (${filter.categories.map(() => '?').join(', ')})`);
    params.push(...filter.categories);
  }
  if (filter.municipality) {
    where.push(`municipality = ?`);
    params.push(filter.municipality);
  }

  return db.getAllAsync<ClusterCell>(
    `SELECT
       CAST(longitude / ? AS INTEGER) AS gx,
       CAST(latitude / ? AS INTEGER) AS gy,
       COUNT(*) AS count,
       AVG(latitude) AS lat,
       AVG(longitude) AS lng,
       MIN(id) AS sampleId
     FROM shelters
     WHERE ${where.join(' AND ')}
     GROUP BY gx, gy`,
    ...params
  );
}

export async function getChecklistItems(db: SQLiteDatabase): Promise<ChecklistItem[]> {
  return db.getAllAsync<ChecklistItem>(
    `SELECT i.id, i.category, i.sort_order, i.label_key, s.checked
     FROM checklist_items i
     JOIN checklist_state s ON s.item_id = i.id
     ORDER BY i.sort_order`
  );
}

export async function setChecklistItemChecked(
  db: SQLiteDatabase,
  itemId: string,
  checked: boolean
): Promise<void> {
  await db.runAsync(
    `UPDATE checklist_state SET checked = ? WHERE item_id = ?`,
    checked ? 1 : 0,
    itemId
  );
}
