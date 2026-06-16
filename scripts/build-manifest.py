#!/usr/bin/env python3
"""Emit data/seed/shelters.manifest.json next to shelters.json.

The mobile app fetches the manifest first to decide whether to download
the full payload. The `url` field must point at the JSON file served
publicly (raw.githubusercontent.com is a sensible default).
"""

from __future__ import annotations

import hashlib
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

REPO = os.environ.get("GITHUB_REPOSITORY", "programusprendimai/baltic72")
REF = os.environ.get("GITHUB_REF_NAME", "main")
SEED = Path(__file__).resolve().parent.parent / "data" / "seed" / "shelters.json"
DEST = SEED.with_name("shelters.manifest.json")

PAYLOAD_URL = f"https://raw.githubusercontent.com/{REPO}/{REF}/data/seed/shelters.json"
MIN_ROWS = 1_000
MAX_ROWS = 200_000
HEX_SHA256_RE = re.compile(r"^[a-f0-9]{64}$")
ISO_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z?)?$")
CATEGORY_TO_TYPE = {
    "kas": "collective_protection",
    "priedanga": "underground",
    "evakuacija": "assembly",
    "sirena": "siren",
}
COUNTRY_BOUNDS = {
    "EE": (57.0, 60.1, 21.3, 28.6),
    "LT": (53.8, 56.7, 20.7, 26.9),
    "LV": (55.4, 58.2, 20.5, 28.5),
    "PL": (48.7, 55.3, 13.9, 24.3),
}
REQUIRED_STRINGS = ("id", "category", "type", "name", "city", "country", "source")
NULLABLE_STRINGS = (
    "manager",
    "address",
    "county",
    "municipality",
    "eldership",
    "hours",
    "notes",
    "updated_at",
    "evac_type",
)
NULLABLE_NUMBERS = ("capacity", "area_m2", "siren_radius_m")
NULLABLE_BOOLEANS = (
    "accessible",
    "marked",
    "always_open",
    "has_lighting",
    "has_sanitation",
    "has_ventilation",
)
ALLOWED_KEYS = {
    *REQUIRED_STRINGS,
    *NULLABLE_STRINGS,
    *NULLABLE_NUMBERS,
    *NULLABLE_BOOLEANS,
    "latitude",
    "longitude",
}


def _required_string(row: dict[str, Any], key: str, index: int) -> str:
    value = row.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"row {index}: {key} must be a non-empty string")
    value = value.strip()
    if len(value) > 500:
        raise ValueError(f"row {index}: {key} is too long")
    return value


def _nullable_string(row: dict[str, Any], key: str, index: int) -> None:
    value = row.get(key)
    if value is None:
        return
    if not isinstance(value, str):
        raise ValueError(f"row {index}: {key} must be a string or null")
    if len(value.strip()) > 2_000:
        raise ValueError(f"row {index}: {key} is too long")


def _nullable_number(row: dict[str, Any], key: str, index: int) -> None:
    value = row.get(key)
    if value is None:
        return
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        raise ValueError(f"row {index}: {key} must be a number or null")
    if value != value or value < 0:
        raise ValueError(f"row {index}: {key} must be finite and non-negative")


def _nullable_bool(row: dict[str, Any], key: str, index: int) -> None:
    value = row.get(key)
    if value is None:
        return
    if not isinstance(value, bool):
        raise ValueError(f"row {index}: {key} must be a boolean or null")


def validate_rows(rows: Any) -> list[dict[str, Any]]:
    if not isinstance(rows, list):
        raise ValueError("shelters payload must be a JSON array")
    if len(rows) < MIN_ROWS or len(rows) > MAX_ROWS:
        raise ValueError(f"shelters payload row count is outside expected bounds: {len(rows)}")

    seen_ids: set[str] = set()
    for index, row in enumerate(rows):
        if not isinstance(row, dict):
            raise ValueError(f"row {index}: must be an object")
        extra = set(row) - ALLOWED_KEYS
        if extra:
            raise ValueError(f"row {index}: unexpected keys: {', '.join(sorted(extra))}")

        shelter_id = _required_string(row, "id", index)
        if shelter_id in seen_ids:
            raise ValueError(f"row {index}: duplicate id {shelter_id}")
        seen_ids.add(shelter_id)

        category = _required_string(row, "category", index)
        expected_type = CATEGORY_TO_TYPE.get(category)
        if expected_type is None:
            raise ValueError(f"row {index}: invalid category {category}")
        if _required_string(row, "type", index) != expected_type:
            raise ValueError(f"row {index}: category/type mismatch")

        for key in ("name", "city", "source"):
            _required_string(row, key, index)

        country = _required_string(row, "country", index)
        bounds = COUNTRY_BOUNDS.get(country)
        if bounds is None:
            raise ValueError(f"row {index}: invalid country {country}")
        lat = row.get("latitude")
        lon = row.get("longitude")
        if not isinstance(lat, (int, float)) or isinstance(lat, bool) or lat != lat:
            raise ValueError(f"row {index}: latitude must be finite")
        if not isinstance(lon, (int, float)) or isinstance(lon, bool) or lon != lon:
            raise ValueError(f"row {index}: longitude must be finite")
        min_lat, max_lat, min_lon, max_lon = bounds
        if not (min_lat <= lat <= max_lat and min_lon <= lon <= max_lon):
            raise ValueError(f"row {index}: coordinates outside {country} geofence")

        for key in NULLABLE_STRINGS:
            _nullable_string(row, key, index)
        for key in NULLABLE_NUMBERS:
            _nullable_number(row, key, index)
        for key in NULLABLE_BOOLEANS:
            _nullable_bool(row, key, index)
        updated_at = row.get("updated_at")
        if isinstance(updated_at, str) and updated_at and not ISO_DATE_RE.match(updated_at):
            raise ValueError(f"row {index}: updated_at is invalid")

    return rows


def main() -> int:
    raw = SEED.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    if not HEX_SHA256_RE.match(digest):
        raise ValueError("internal error: invalid SHA-256 digest")
    rows = validate_rows(json.loads(raw))
    manifest = {
        "version": digest[:16],
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "count": len(rows),
        "url": PAYLOAD_URL,
        "payload_sha256": digest,
        "source": "PAGD/data.gov.lt",
    }
    DEST.write_text(json.dumps(manifest, indent=2, ensure_ascii=False))
    print(
        f"Wrote {DEST}: version={manifest['version']} "
        f"count={manifest['count']} sha256={digest}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
