#!/usr/bin/env python3
"""
Build the prebuilt SQLite database shipped as a bundled asset
(assets/db/baltic72.db). It contains the full multi-country shelter set plus the
72h-kit checklist, so the app copies it on first launch instead of inlining a
55 MB JSON into the JS bundle and inserting ~98k rows at runtime.

Schema mirrors lib/db/schema.ts (SCHEMA_VERSION). Rebuild after re-running
fetch-shelters-intl.py.
"""
import importlib.util
import json
import os
import sqlite3

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _load_validate_rows():
    """Reuse the geofence/schema/row-count/field-length validation from
    build-manifest.py (hyphenated filename, so load it by path)."""
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "build-manifest.py")
    spec = importlib.util.spec_from_file_location("build_manifest", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.validate_rows


validate_rows = _load_validate_rows()
SHELTERS = os.path.join(ROOT, "data", "seed", "shelters.json")
CHECKLIST = os.path.join(ROOT, "data", "seed", "checklist.json")
MANIFEST = os.path.join(ROOT, "data", "seed", "shelters.manifest.json")
OUT_DIR = os.path.join(ROOT, "assets", "db")
OUT = os.path.join(OUT_DIR, "baltic72.db")
SCHEMA_VERSION = 4

DDL = [
    "CREATE TABLE meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);",
    """CREATE TABLE shelters (
        id TEXT PRIMARY KEY NOT NULL, category TEXT NOT NULL, type TEXT NOT NULL,
        name TEXT NOT NULL, manager TEXT, latitude REAL NOT NULL, longitude REAL NOT NULL,
        address TEXT, city TEXT NOT NULL, county TEXT, municipality TEXT, eldership TEXT,
        capacity INTEGER, area_m2 REAL, accessible INTEGER, marked INTEGER, always_open INTEGER,
        has_lighting INTEGER, has_sanitation INTEGER, has_ventilation INTEGER, hours TEXT,
        notes TEXT, updated_at TEXT, country TEXT NOT NULL DEFAULT 'LT',
        source TEXT NOT NULL DEFAULT 'PAGD/data.gov.lt', siren_radius_m REAL, evac_type TEXT);""",
    """CREATE TABLE checklist_items (id TEXT PRIMARY KEY NOT NULL, category TEXT NOT NULL,
        sort_order INTEGER NOT NULL, label_key TEXT NOT NULL);""",
    """CREATE TABLE checklist_state (item_id TEXT PRIMARY KEY NOT NULL,
        checked INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (item_id) REFERENCES checklist_items(id));""",
    "CREATE INDEX idx_shelters_country ON shelters(country);",
    "CREATE INDEX idx_shelters_city ON shelters(city);",
    "CREATE INDEX idx_shelters_category ON shelters(category);",
    "CREATE INDEX idx_shelters_municipality ON shelters(municipality);",
    "CREATE INDEX idx_shelters_lat ON shelters(latitude);",
    "CREATE INDEX idx_shelters_lon ON shelters(longitude);",
]

COLS = [
    "id", "category", "type", "name", "manager", "latitude", "longitude", "address",
    "city", "county", "municipality", "eldership", "capacity", "area_m2", "accessible",
    "marked", "always_open", "has_lighting", "has_sanitation", "has_ventilation",
    "hours", "notes", "updated_at", "country", "source", "siren_radius_m", "evac_type",
]
BOOLS = {"accessible", "marked", "always_open", "has_lighting", "has_sanitation", "has_ventilation"}


def b(v):
    return None if v is None else (1 if v else 0)


def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    if os.path.exists(OUT):
        os.remove(OUT)

    shelters = validate_rows(json.load(open(SHELTERS, encoding="utf-8")))
    checklist = json.load(open(CHECKLIST, encoding="utf-8"))
    manifest = json.load(open(MANIFEST, encoding="utf-8"))

    con = sqlite3.connect(OUT)
    cur = con.cursor()
    for stmt in DDL:
        cur.execute(stmt)
    cur.execute("INSERT INTO meta (key, value) VALUES ('schema_version', ?)", (str(SCHEMA_VERSION),))
    cur.execute(
        "INSERT INTO meta (key, value) VALUES ('shelter_data_version', ?)",
        (manifest["version"],),
    )

    placeholders = ", ".join("?" for _ in COLS)
    rows = []
    for r in shelters:
        rows.append(tuple(b(r.get(c)) if c in BOOLS else r.get(c) for c in COLS))
    cur.executemany(f"INSERT INTO shelters ({', '.join(COLS)}) VALUES ({placeholders})", rows)

    for it in checklist:
        cur.execute(
            "INSERT INTO checklist_items (id, category, sort_order, label_key) VALUES (?, ?, ?, ?)",
            (it["id"], it["category"], it["sort_order"], it["label_key"]),
        )
        cur.execute("INSERT INTO checklist_state (item_id, checked) VALUES (?, 0)", (it["id"],))

    con.commit()
    cur.execute("VACUUM")
    con.commit()

    counts = dict(cur.execute("SELECT country, COUNT(*) FROM shelters GROUP BY country").fetchall())
    con.close()
    print(f"built {OUT}")
    print(f"shelters: {sum(counts.values())} {counts}")
    print(f"checklist items: {len(checklist)}")
    print(f"db size: {os.path.getsize(OUT) / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
