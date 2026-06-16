export const SCHEMA_VERSION = 4;

export const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS shelters (
    id TEXT PRIMARY KEY NOT NULL,
    category TEXT NOT NULL,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    manager TEXT,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    address TEXT,
    city TEXT NOT NULL,
    county TEXT,
    municipality TEXT,
    eldership TEXT,
    capacity INTEGER,
    area_m2 REAL,
    accessible INTEGER,
    marked INTEGER,
    always_open INTEGER,
    has_lighting INTEGER,
    has_sanitation INTEGER,
    has_ventilation INTEGER,
    hours TEXT,
    notes TEXT,
    updated_at TEXT,
    country TEXT NOT NULL DEFAULT 'LT',
    source TEXT NOT NULL DEFAULT 'PAGD/data.gov.lt',
    siren_radius_m REAL,
    evac_type TEXT
  );`,
  `CREATE TABLE IF NOT EXISTS checklist_items (
    id TEXT PRIMARY KEY NOT NULL,
    category TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    label_key TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS checklist_state (
    item_id TEXT PRIMARY KEY NOT NULL,
    checked INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (item_id) REFERENCES checklist_items(id)
  );`,
  `CREATE INDEX IF NOT EXISTS idx_shelters_country ON shelters(country);`,
  `CREATE INDEX IF NOT EXISTS idx_shelters_city ON shelters(city);`,
  `CREATE INDEX IF NOT EXISTS idx_shelters_category ON shelters(category);`,
  `CREATE INDEX IF NOT EXISTS idx_shelters_municipality ON shelters(municipality);`,
  `CREATE INDEX IF NOT EXISTS idx_shelters_lat ON shelters(latitude);`,
  `CREATE INDEX IF NOT EXISTS idx_shelters_lon ON shelters(longitude);`,
];
