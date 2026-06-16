#!/usr/bin/env python3
"""
Fetch + normalise civil-protection shelter data for Estonia, Latvia and Poland
into the same schema as the Lithuanian PAGD seed (data/seed/shelters.json), then
merge (keeping the existing LT records untouched) and rewrite the seed.

Sources (all official, openly licensed — verified 2026-05):
  EE  Päästeamet / SMIT     https://opendata.smit.ee/gis/varjumiskohad.gpkg   (CC BY-SA 3.0 EE, EPSG:3301)
  LV  Rīgas dome / data.gov.lv  GeoPackages (CC BY 4.0, EPSG:3059)  — Riga only (national data not open)
  PL  KG PSP / dane.gov.pl  dataset 28058 tabular API              (CC BY 4.0, already EPSG:4326)

Reprojection (EE/LV) uses ogr2ogr (GDAL). Poland is already WGS84.
"""
from __future__ import annotations

import json
import os
import subprocess
import tempfile
import urllib.parse
import urllib.request
from typing import Any, Iterable

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SEED = os.path.join(ROOT, "data", "seed", "shelters.json")
MANIFEST = os.path.join(ROOT, "data", "seed", "shelters.manifest.json")

EE_GPKG = "https://opendata.smit.ee/gis/varjumiskohad.gpkg"
# National shelter layer behind VUGD's 112.lv map (IeM ArcGIS), 803 points, WGS84.
LV_NATIONAL = "https://services9.arcgis.com/f2QOaaoX08g1sAc2/arcgis/rest/services/PatvertnesDati_view/FeatureServer/0/query?where=1%3D1&outFields=*&f=geojson"
# Riga evacuation assembly points (the national layer is shelters only).
LV_EVAC_GPKG = "https://data.gov.lv/dati/dataset/34edc7d7-7b35-41b7-ad69-a3fac7f4ea82/resource/d5c15b0e-860e-472a-a6f6-760e553fd586/download/caoip_evakuacijas_vietas.gpkg"
# dane.gov.pl tabular API caps at 10k rows; the CSVW JSON-LD bulk dump has all ~82k.
# The dump URL is date+hash-stamped and changes on every KG PSP republish, so we
# resolve the current one from the dataset API (below) and keep this only as a
# last-resort fallback if the API is unreachable.
PL_DATASET = "28058"
PL_JSONLD_FALLBACK = "https://api.dane.gov.pl/media/resources/20260310/punkty_schronienia_875cc428.jsonld"

USER_AGENT = "Baltic72/1.0"
DOWNLOAD_CHUNK_BYTES = 1024 * 1024
JSON_MAX_BYTES = 32 * 1024 * 1024
PL_API_MAX_BYTES = 8 * 1024 * 1024
GPKG_MAX_BYTES = 128 * 1024 * 1024
PL_JSONLD_MAX_BYTES = 512 * 1024 * 1024

# (host, path, exact_path, required_suffix)
URL_ALLOWLIST: tuple[tuple[str, str, bool, str | None], ...] = (
    ("opendata.smit.ee", "/gis/varjumiskohad.gpkg", True, None),
    (
        "services9.arcgis.com",
        "/f2QOaaoX08g1sAc2/arcgis/rest/services/PatvertnesDati_view/FeatureServer/0/query",
        True,
        None,
    ),
    (
        "data.gov.lv",
        "/dati/dataset/34edc7d7-7b35-41b7-ad69-a3fac7f4ea82/resource/"
        "d5c15b0e-860e-472a-a6f6-760e553fd586/download/caoip_evakuacijas_vietas.gpkg",
        True,
        None,
    ),
    ("api.dane.gov.pl", f"/1.4/datasets/{PL_DATASET}/resources", True, None),
    ("api.dane.gov.pl", "/media/resources/", False, ".jsonld"),
)

SCHEMA_KEYS = [
    "id", "category", "type", "name", "manager", "latitude", "longitude",
    "address", "city", "county", "municipality", "eldership", "capacity",
    "area_m2", "accessible", "marked", "always_open", "has_lighting",
    "has_sanitation", "has_ventilation", "hours", "notes", "updated_at",
    "country", "source",
]


def rec(**kw: Any) -> dict:
    out = {k: None for k in SCHEMA_KEYS}
    out.update(kw)
    return out


def validate_url(url: str) -> None:
    parsed = urllib.parse.urlparse(url)
    host = (parsed.hostname or "").lower()
    if parsed.scheme != "https" or not host:
        raise ValueError(f"Blocked non-HTTPS or hostless URL: {url}")
    if parsed.username or parsed.password or parsed.port not in (None, 443):
        raise ValueError(f"Blocked URL with credentials or unexpected port: {url}")

    for raw_segment in parsed.path.split("/"):
        segment = urllib.parse.unquote(raw_segment)
        if segment in {".", ".."} or "/" in segment or "\\" in segment:
            raise ValueError(f"Blocked URL with unsafe path segment: {url}")

    for allowed_host, allowed_path, exact_path, suffix in URL_ALLOWLIST:
        if host != allowed_host:
            continue
        path_ok = parsed.path == allowed_path if exact_path else parsed.path.startswith(allowed_path)
        if path_ok and (suffix is None or parsed.path.endswith(suffix)):
            return
    raise ValueError(f"Blocked URL outside shelter source allowlist: {url}")


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


def open_url(url: str, *, timeout: int, accept: str | None = None) -> Any:
    validate_url(url)
    headers = {"User-Agent": USER_AGENT}
    if accept:
        headers["Accept"] = accept
    req = urllib.request.Request(url, headers=headers)
    response = URL_OPENER.open(req, timeout=timeout)
    try:
        validate_url(response.geturl())
    except Exception:
        response.close()
        raise
    return response


def content_length(response: Any) -> int | None:
    value = response.headers.get("Content-Length")
    if value is None:
        return None
    try:
        return int(value)
    except ValueError:
        return None


def ensure_content_length_under_cap(response: Any, max_bytes: int) -> None:
    length = content_length(response)
    if length is not None and length > max_bytes:
        raise ValueError(
            f"Refusing to download {response.geturl()}: "
            f"Content-Length {length} exceeds cap {max_bytes}"
        )


def read_limited(response: Any, max_bytes: int) -> bytes:
    ensure_content_length_under_cap(response, max_bytes)
    chunks = []
    total = 0
    while True:
        chunk = response.read(DOWNLOAD_CHUNK_BYTES)
        if not chunk:
            break
        if total + len(chunk) > max_bytes:
            raise ValueError(f"Refusing to read more than {max_bytes} bytes from {response.geturl()}")
        chunks.append(chunk)
        total += len(chunk)
    return b"".join(chunks)


def copy_limited(response: Any, path: str, max_bytes: int) -> None:
    ensure_content_length_under_cap(response, max_bytes)
    total = 0
    with open(path, "wb") as f:
        while True:
            chunk = response.read(DOWNLOAD_CHUNK_BYTES)
            if not chunk:
                break
            if total + len(chunk) > max_bytes:
                raise ValueError(f"Refusing to write more than {max_bytes} bytes from {response.geturl()}")
            f.write(chunk)
            total += len(chunk)


def http_json(url: str, max_bytes: int = JSON_MAX_BYTES) -> Any:
    with open_url(url, timeout=60, accept="application/json") as r:
        return json.loads(read_limited(r, max_bytes).decode("utf-8"))


def download(url: str, path: str, max_bytes: int) -> None:
    with open_url(url, timeout=120) as r:
        copy_limited(r, path, max_bytes)


def gpkg_to_features(url: str) -> list[dict]:
    """Download a GeoPackage and reproject to WGS84 GeoJSON via ogr2ogr."""
    with tempfile.TemporaryDirectory() as tmp:
        src = os.path.join(tmp, "in.gpkg")
        dst = os.path.join(tmp, "out.geojson")
        download(url, src, GPKG_MAX_BYTES)
        subprocess.run(
            ["ogr2ogr", "-f", "GeoJSON", "-t_srs", "EPSG:4326", dst, src],
            check=True, capture_output=True,
        )
        with open(dst, encoding="utf-8") as f:
            return json.load(f).get("features", [])


def _ring_centroid(ring: list) -> tuple[float, float]:
    ys = [p[1] for p in ring]
    xs = [p[0] for p in ring]
    return sum(ys) / len(ys), sum(xs) / len(xs)


def pt(geom: dict | None) -> tuple[float, float] | None:
    """Representative (lat, lon) for any geometry — polygons collapse to centroid."""
    if not geom:
        return None
    t, c = geom.get("type"), geom.get("coordinates")
    if t == "Point" and c:
        return float(c[1]), float(c[0])
    if t == "MultiPoint" and c:
        return float(c[0][1]), float(c[0][0])
    if t == "Polygon" and c:
        return _ring_centroid(c[0])
    if t == "MultiPolygon" and c:
        return _ring_centroid(c[0][0])
    return None


def s(v: Any) -> str | None:
    if v is None:
        return None
    v = str(v).strip()
    return v or None


# ---------------------------------------------------------------- Estonia
def fetch_estonia() -> list[dict]:
    feats = gpkg_to_features(EE_GPKG)
    out = []
    for i, f in enumerate(feats):
        p = f.get("properties", {})
        ll = pt(f.get("geometry"))
        if not ll:
            continue
        addr = s(p.get("aadress"))
        # Estonian address: "Maakond, Vald, Street nr" — use the vald as the town.
        parts = [x.strip() for x in (addr or "").split(",") if x.strip()]
        city = parts[1] if len(parts) > 1 else (parts[0] if parts else "Eesti")
        out.append(rec(
            id=f"ee-{s(p.get('id')) or i}",
            category="priedanga", type="underground",
            name=s(p.get("nimi")) or addr or "Avalik varjumiskoht",
            address=addr, city=city, county=parts[0] if parts else None,
            latitude=ll[0], longitude=ll[1],
            country="EE", source="Päästeamet / SMIT",
        ))
    return out


# ---------------------------------------------------------------- Latvia (national)
def fetch_latvia() -> list[dict]:
    out = []
    doc = http_json(LV_NATIONAL)
    for i, f in enumerate(doc.get("features", [])):
        p = f.get("properties", {})
        ll = pt(f.get("geometry"))
        if not ll:
            continue
        street = s(p.get("ielasnosaukums"))
        num = s(p.get("ekasnumurs"))
        addr = " ".join(x for x in [street, num] if x) or None
        place = s(p.get("pilsetasvaiapdzvietasnosaukums"))
        out.append(rec(
            id=f"lv-{s(p.get('objectid')) or i}",
            category="priedanga", type="underground",
            name=addr or place or "Patvertne",
            address=addr, city=place or "Latvija",
            notes=s(p.get("komentars")),
            latitude=ll[0], longitude=ll[1],
            country="LV", source="VUGD / 112.lv",
        ))
    for i, f in enumerate(gpkg_to_features(LV_EVAC_GPKG)):
        p = f.get("properties", {})
        ll = pt(f.get("geometry"))
        if not ll:
            continue
        out.append(rec(
            id=f"lv-riga-evac-{i}",
            category="evakuacija", type="assembly",
            name=s(p.get("nosaukums")) or s(p.get("atr_vieta")) or "Evakuācijas pulcēšanās vieta",
            city="Rīga", municipality="Rīgas valstspilsēta", eldership=s(p.get("apkaime")),
            latitude=ll[0], longitude=ll[1],
            country="LV", source="Rīgas dome / data.gov.lv",
        ))
    return out


# ---------------------------------------------------------------- Poland
def pl_parse(path: str) -> list[dict]:
    """Parse the dane.gov.pl CSVW JSON-LD dump (data nodes are keyed by CSV
    column URLs whose '#fragment' is the column name)."""
    import urllib.parse

    graph = json.load(open(path, encoding="utf-8"))["@graph"]
    out = []
    for n in graph:
        if not isinstance(n, dict):
            continue
        row: dict[str, Any] = {}
        for k, v in n.items():
            if "#" not in k:
                continue
            name = urllib.parse.unquote(k.split("#", 1)[1]).lstrip("﻿").strip()
            row[name] = v
        lat, lon = row.get("Szerokosc geograficzna"), row.get("Dlugosc geograficzna")
        if lat is None or lon is None:
            continue
        try:
            latf, lonf = float(lat), float(lon)
        except (TypeError, ValueError):
            continue
        addr, city = s(row.get("Adres")), s(row.get("Gmina"))
        out.append(rec(
            id=f"pl-{s(row.get('Identyfikator publiczny')) or len(out)}",
            category="priedanga", type="underground",
            name=addr or city or "Miejsce ochronne",
            address=addr, city=city or "Polska",
            county=s(row.get("Wojewodztwo")), municipality=s(row.get("Powiat")),
            hours=s(row.get("Dostepnosc")),
            latitude=latf, longitude=lonf,
            country="PL", source="KG PSP / dane.gov.pl",
        ))
    return out


def resolve_pl_jsonld() -> str:
    """Current bulk JSON-LD media URL for dataset 28058.

    The published file is date+hash-stamped; `jsonld_file_url` on the resource
    always points at the latest snapshot. NOTE: do NOT use `jsonld_download_url`
    — it 302-redirects to a CSV on gdziesieukryc.pl that is geo-blocked outside
    Poland. Falls back to the last-known URL if the API is unreachable.
    """
    try:
        data = http_json(
            f"https://api.dane.gov.pl/1.4/datasets/{PL_DATASET}/resources?per_page=50",
            max_bytes=PL_API_MAX_BYTES,
        )
        for res in data.get("data", []):
            url = (res.get("attributes") or {}).get("jsonld_file_url")
            if url:
                validate_url(url)
                print(f"  PL: resolved JSON-LD → {url}", flush=True)
                return url
    except Exception as e:  # noqa: BLE001 — network/shape issues fall back gracefully
        print(f"  PL: dynamic resolve failed ({e}); using fallback URL", flush=True)
    return PL_JSONLD_FALLBACK


def fetch_poland() -> list[dict]:
    url = resolve_pl_jsonld()
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "pl.jsonld")
        download(url, path, PL_JSONLD_MAX_BYTES)
        return pl_parse(path)


def main() -> None:
    with open(SEED, encoding="utf-8") as f:
        existing = json.load(f)
    lt = [r for r in existing if r.get("country") == "LT"]
    print(f"LT (kept): {len(lt)}")

    ee = fetch_estonia()
    print(f"EE: {len(ee)}")
    lv = fetch_latvia()
    print(f"LV: {len(lv)}")
    pl = fetch_poland()
    print(f"PL: {len(pl)}")

    merged = lt + ee + lv + pl
    with open(SEED, "w", encoding="utf-8") as f:
        json.dump(merged, f, ensure_ascii=False, separators=(",", ":"))

    by_country: dict[str, int] = {}
    for r in merged:
        by_country[r["country"]] = by_country.get(r["country"], 0) + 1
    with open(MANIFEST, "w", encoding="utf-8") as f:
        json.dump({"count": len(merged), "byCountry": by_country, "generated": "intl"}, f, indent=2)

    print(f"\nTOTAL: {len(merged)}  {by_country}")
    print(f"seed size: {os.path.getsize(SEED) / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
