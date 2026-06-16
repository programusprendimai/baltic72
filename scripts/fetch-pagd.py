#!/usr/bin/env python3
"""Refresh data/seed/shelters.json from the PAGD civil protection open dataset.

Source: data.gov.lt dataset 3984 -> https://www.geoportal.lt/download/opendata/PAGD/PAGD_civiline_sauga.zip

Layers in the .gdb (EPSG:3346, reprojected to WGS84 here):
  - KAS                  -> collective_protection
  - Priedangos           -> underground
  - Evakuacijos_punktai  -> assembly
  - Sirenos              -> siren

Requirements: pip install pyogrio pyproj shapely pyarrow
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
import urllib.parse
import urllib.request
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Any

import pyogrio  # type: ignore
from pyproj import Transformer  # type: ignore
from shapely import wkb as swkb  # type: ignore

URL = "https://www.geoportal.lt/download/opendata/PAGD/PAGD_civiline_sauga.zip"
GDB_NAME = "PAGD_civiline_sauga.gdb"
ALLOWED_DOWNLOAD_HOST = "www.geoportal.lt"

USER_AGENT = "baltic72-fetch"
DOWNLOAD_CHUNK_BYTES = 64 * 1024
# The PAGD zip is ~50-80 MB; allow generous headroom but refuse anything absurd.
ZIP_MAX_BYTES = 512 * 1024 * 1024
# Decompressed .gdb is a few hundred MB at most; cap total + per-member to stop zip bombs.
EXTRACT_MAX_TOTAL_BYTES = 2 * 1024 * 1024 * 1024
EXTRACT_MAX_MEMBER_BYTES = 1 * 1024 * 1024 * 1024

CATEGORY_MAP = {
    "KAS": ("collective_protection", "kas"),
    "Priedangos": ("underground", "priedanga"),
    "Evakuacijos_punktai": ("assembly", "evakuacija"),
    "Sirenos": ("siren", "sirena"),
}


def to_bool(v):
    if v is None:
        return None
    s = str(v).strip()
    if s == "":
        return None
    if s in ("1", "true", "True", "TRUE", "Taip", "TAIP", "taip"):
        return True
    if s in ("0", "false", "False", "FALSE", "Ne", "NE", "ne"):
        return False
    return None


def to_str(v):
    if v is None:
        return None
    t = str(v).strip()
    return t or None


def to_num(v):
    try:
        if v is None:
            return None
        f = float(v)
        if f != f:  # NaN
            return None
        return f
    except (TypeError, ValueError):
        return None


def fmt_addr(gatve, nr):
    g = to_str(gatve)
    n = to_str(nr)
    if g and n:
        return f"{g} {n}"
    return g


def fmt_date(v):
    if isinstance(v, datetime):
        return v.date().isoformat()
    if v is None:
        return None
    return str(v)


def validate_url(url: str) -> None:
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https" or (parsed.hostname or "").lower() != ALLOWED_DOWNLOAD_HOST:
        raise RuntimeError(f"Refusing unexpected PAGD download URL: {url}")
    if parsed.username or parsed.password or parsed.port not in (None, 443):
        raise RuntimeError(f"Refusing PAGD URL with credentials or unexpected port: {url}")


class AllowlistedRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(
        self,
        req: urllib.request.Request,
        fp: Any,
        code: int,
        msg: str,
        headers: Any,
        newurl: str,
    ) -> urllib.request.Request | None:
        target = urllib.parse.urljoin(req.full_url, newurl)
        validate_url(target)
        return super().redirect_request(req, fp, code, msg, headers, target)


URL_OPENER = urllib.request.build_opener(AllowlistedRedirectHandler)


def download(url: str, dest: Path) -> None:
    validate_url(url)
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with URL_OPENER.open(req, timeout=120) as src:
        validate_url(src.geturl())
        length = src.headers.get("Content-Length")
        if length is not None:
            try:
                if int(length) > ZIP_MAX_BYTES:
                    raise RuntimeError(
                        f"Refusing PAGD download: Content-Length {length} exceeds cap {ZIP_MAX_BYTES}"
                    )
            except ValueError:
                pass
        total = 0
        with dest.open("wb") as fh:
            while chunk := src.read(DOWNLOAD_CHUNK_BYTES):
                total += len(chunk)
                if total > ZIP_MAX_BYTES:
                    raise RuntimeError(
                        f"Refusing to write more than {ZIP_MAX_BYTES} bytes from {url}"
                    )
                fh.write(chunk)


def extract(zip_path: Path, dest_dir: Path) -> Path:
    # The system unzip cannot read the "store" compression Esri uses; Python's zipfile does.
    dest_root = dest_dir.resolve()
    with zipfile.ZipFile(zip_path) as zf:
        total_uncompressed = 0
        for member in zf.infolist():
            name = member.filename
            if not name or name.startswith(("/", "\\")):
                raise RuntimeError(f"Unsafe absolute path in zip: {name!r}")
            parts = Path(name).parts
            if ".." in parts:
                raise RuntimeError(f"Unsafe parent path in zip: {name!r}")
            target = (dest_dir / name).resolve()
            if target != dest_root and dest_root not in target.parents:
                raise RuntimeError(f"Zip member escapes destination: {name!r}")
            if member.file_size > EXTRACT_MAX_MEMBER_BYTES:
                raise RuntimeError(
                    f"Zip member {name!r} declares {member.file_size} bytes, "
                    f"exceeds per-member cap {EXTRACT_MAX_MEMBER_BYTES}"
                )
            total_uncompressed += member.file_size
            if total_uncompressed > EXTRACT_MAX_TOTAL_BYTES:
                raise RuntimeError(
                    f"Zip uncompressed total exceeds cap {EXTRACT_MAX_TOTAL_BYTES}"
                )
        # Extract member-by-member with a running byte budget so a member that lies
        # about file_size in its header cannot blow past the cap during inflation.
        budget = EXTRACT_MAX_TOTAL_BYTES
        for member in zf.infolist():
            if member.is_dir():
                zf.extract(member, dest_dir)
                continue
            target = dest_dir / member.filename
            target.parent.mkdir(parents=True, exist_ok=True)
            with zf.open(member) as srcf, target.open("wb") as outf:
                while chunk := srcf.read(DOWNLOAD_CHUNK_BYTES):
                    budget -= len(chunk)
                    if budget < 0:
                        raise RuntimeError(
                            f"Zip inflation exceeded total cap {EXTRACT_MAX_TOTAL_BYTES}"
                        )
                    outf.write(chunk)
    gdb = dest_dir / GDB_NAME
    if not gdb.exists():
        raise RuntimeError(f"{GDB_NAME} not found inside zip")
    return gdb


def transform(gdb: Path) -> list[dict]:
    tx = Transformer.from_crs("EPSG:3346", "EPSG:4326", always_xy=True)
    out: list[dict] = []
    seq = 0
    for layer, (ui_type, cat) in CATEGORY_MAP.items():
        meta, table = pyogrio.read_arrow(str(gdb), layer=layer)
        for row in table.to_pylist():
            wkb_bytes = row.pop("SHAPE", None)
            if not wkb_bytes:
                continue
            try:
                pt = swkb.loads(bytes(wkb_bytes))
                lon, lat = tx.transform(pt.x, pt.y)
            except Exception:
                continue
            if not (lat and lon) or abs(lat) > 90 or abs(lon) > 180:
                continue
            seq += 1
            feat = {
                "id": f"lt-pagd-{cat}-{seq:05d}",
                "category": cat,
                "type": ui_type,
                "name": to_str(row.get("pavadinimas")) or layer,
                "manager": to_str(row.get("valdytojas") or row.get("savininkas")),
                "latitude": round(lat, 6),
                "longitude": round(lon, 6),
                "address": fmt_addr(row.get("gatve"), row.get("namo_numeris"))
                or to_str(row.get("sirenos_sumontavimo_adresas")),
                "city": to_str(row.get("gyvenviete")) or to_str(row.get("savivaldybe")) or "",
                "county": to_str(row.get("apskritis")),
                "municipality": to_str(row.get("savivaldybe")),
                "eldership": to_str(row.get("seniunija")),
                "capacity": int(to_num(row.get("gyventoju_skaicius")) or 0) or None,
                "area_m2": to_num(row.get("plotas")),
                "accessible": to_bool(row.get("pritaikyta_asmenims_su_negalia")),
                "marked": to_bool(row.get("pazenklinta")),
                "always_open": to_bool(row.get("patekimas_visa_para")),
                "has_lighting": to_bool(row.get("patalpu_apsvietimas")),
                "has_sanitation": to_bool(row.get("patalpu_sanitariniai_mazgai")),
                "has_ventilation": to_bool(row.get("patalpu_ventiliacija")),
                "hours": to_str(row.get("darbo_valandos")),
                "notes": to_str(row.get("pastabos")),
                "updated_at": fmt_date(row.get("atnaujinimo_data")),
                "country": "LT",
                "source": "PAGD/data.gov.lt",
            }
            if cat == "sirena":
                feat["siren_radius_m"] = to_num(row.get("garso_spindulys"))
            if cat == "evakuacija":
                feat["evac_type"] = to_str(row.get("evakavimo_punkto_tipas"))
            out.append(feat)
    return out


def main() -> int:
    repo_root = Path(__file__).resolve().parent.parent
    dest = repo_root / "data" / "seed" / "shelters.json"
    with tempfile.TemporaryDirectory() as td:
        td_path = Path(td)
        zip_path = td_path / "pagd.zip"
        print(f"Downloading {URL} ...", flush=True)
        download(URL, zip_path)
        print(f"Extracting {zip_path} ...", flush=True)
        gdb = extract(zip_path, td_path)
        print(f"Transforming {gdb} ...", flush=True)
        rows = transform(gdb)
        counts: dict[str, int] = {}
        for r in rows:
            counts[r["category"]] = counts.get(r["category"], 0) + 1
        print(f"Total: {len(rows)} features  by category: {counts}", flush=True)
        dest.write_text(json.dumps(rows, ensure_ascii=False, separators=(",", ":")))
        print(f"Wrote {dest} ({os.path.getsize(dest)/1024/1024:.2f} MB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
