# 🛡️ Baltic72

> **Offline-first civil-safety app for Lithuania 🇱🇹, Latvia 🇱🇻, Estonia 🇪🇪 and Poland 🇵🇱.**
> Find the nearest shelter, follow emergency protocols, pack a 72-hour kit, and keep your family accounted for — even when the network is down.

Baltic72 is built for the **general public** during civil emergencies: all ages, all tech-literacy levels, refugees, and people under acute stress. The interface is deliberately calm and authoritative — it should feel like an official safety service, not a startup.

---

## ✨ Features

- 🗺️ **Shelter & siren map** — ~98,000 official civil-protection points across LT/LV/EE/PL, browsable fully offline with distance sorting and category filters.
- 📖 **Emergency guides** — step-by-step protocols (air danger, missile threat, nuclear/radiological, natural disaster), available without internet.
- 🎒 **72-hour kit checklist** — track your household go-bag; progress persists on-device.
- 👨‍👩‍👧 **Family safety status (E2EE)** — share "safe / heading to shelter / in shelter / needs help" with your people. End-to-end encrypted: the server only ever sees public keys, ciphertext and metadata.
- 🔔 **Native push notifications** — operator-issued civil-safety notifications are delivered through APNs/FCM (Baltic72 is not an official warning system and does not replace national alerts or cell broadcast); family join/leave/status notifications fan out to the rest of the group in each recipient's selected language.
- 🌐 **Six languages** — Lithuanian, Latvian, Estonian, Polish, English and Ukrainian.
- 📡 **Over-the-air data updates** — shelter data refreshes automatically (and on demand) without an app-store release.
- 🔌 **Offline-first** — the map, guides and kit work with zero connectivity; data lives on the device.

---

## 🧱 Tech stack

| Layer | Tech |
|---|---|
| App | **Expo SDK 56**, **React Native 0.85**, **expo-router**, TypeScript |
| Storage | **expo-sqlite** (prebuilt DB shipped as an asset) |
| Maps | **expo-maps** (Apple/Google native) |
| Crypto | Ed25519 / X25519, keys in the iOS Keychain (**expo-secure-store**) |
| Notifications | Native APNs/FCM tokens via **expo-notifications**, delivered by Cloudflare Queues |
| Backend | **Cloudflare Worker** + D1 + Durable Objects + R2 + Queues |
| Data pipeline | **Python 3** + **GDAL** (`ogr2ogr`) |

---

## 🚀 Getting started

> **Prerequisites:** Node 20+, Xcode + iOS Simulator (primary target: iOS 26 / iPhone 17 Pro). A **dev client** is required (not Expo Go) — the app uses native modules (expo-maps, expo-camera, expo-secure-store, reanimated, …).

```bash
npm install
npx expo run:ios            # builds the dev client, installs on a simulator, starts Metro
```

- **JS-only change?** Just reload — `curl -X POST http://localhost:8081/reload` (or press `r` in Metro).
- **Changed native modules / `app.json` plugins / `Info.plist`?** Re-run `npx expo run:ios`.
- **Typecheck:** `npm run typecheck`.

The map ships as a **prebuilt SQLite database** (`assets/db/baltic72.db`, ~34 MB) that expo-sqlite copies on first launch — this avoids inlining a 55 MB JSON into the JS bundle.

---

## 🗂️ Project structure

```
app/(tabs)/        Pradžia (home) · Priedangos (map) · Šeima (family) · Nustatymai (settings)
components/ui/     Design-system primitives (compose these; don't restyle)
constants/         design.ts (tokens) · Colors.ts (semantic colors) · baltic-geo.ts (vector outlines)
lib/db/            SQLite schema, migrations, queries
lib/i18n/          LT/LV/ET/PL/EN/UK locales
lib/family/        E2EE crypto, keychain identity, signed API + WebSocket client
lib/notifications/ Native APNs/FCM token registration and notification preferences
lib/sync.ts        Over-the-air shelter refresh
providers/         DatabaseProvider · I18nProvider · FamilyProvider
data/seed/         checklist.json (+ generated shelters.json, gitignored)
scripts/           Python data pipeline
server/            Cloudflare Worker (Family E2EE + push + shelter data delivery)
```

> 🎨 **Design system is mandatory** — compose `components/ui/` primitives and `constants/design.ts` tokens. No inline `fontSize`/`borderRadius`/hex values, and no emoji in the app UI (Lithuanian users find them informal in a safety context).

---

## 🌍 Data sources & attribution

All shelter data comes from **official, openly-licensed** government open data:

| Country | Source | License |
|---|---|---|
| 🇱🇹 Lithuania | PAGD via [data.gov.lt dataset 3984](https://data.gov.lt/datasets/3984) | open data |
| 🇪🇪 Estonia | Päästeamet / SMIT — [rescue.ee open data](https://www.rescue.ee/et/juhend/avaandmed/avalikud-varjumiskohad) | attribution required |
| 🇱🇻 Latvia | VUGD via [112.lv](https://www.112.lv/lv/patvertnes) + Rīgas dome ([data.gov.lv](https://data.gov.lv)) | CC BY 4.0 |
| 🇵🇱 Poland | KG PSP via [dane.gov.pl dataset 28058](https://dane.gov.pl/pl/dataset/28058,punkty-schronienia-w-polsce) | CC BY 4.0 |

### 🔄 Refreshing the data

The pipeline normalizes all four heterogeneous sources (Esri GDB, GeoPackage, ArcGIS GeoJSON, CSVW JSON-LD) into one schema:

```bash
python3 scripts/fetch-pagd.py          # Lithuania (PAGD)
python3 scripts/fetch-shelters-intl.py # EE + LV + PL → merged into data/seed/shelters.json
python3 scripts/build-seed-db.py       # rebuild assets/db/baltic72.db
```

For **over-the-air updates**, the snapshot is published to Cloudflare R2 and served by the worker at `/shelters/manifest` + `/shelters/data`; the app polls the manifest and swaps its local table when the version changes. A weekly GitHub Action ([`refresh-shelters.yml`](./.github/workflows/refresh-shelters.yml)) automates this. See [`server/README.md`](./server/README.md).

---

## ☁️ Backend (Cloudflare Worker)

The Family feature, native push notification fan-out, and shelter-data delivery share one Worker in [`server/`](./server). It stores only public keys + ciphertext for family data (E2EE), sends APNs/FCM pushes through a Cloudflare Queue, and streams the shelter snapshot from R2. Deploy steps, endpoints and secrets are documented in [`server/README.md`](./server/README.md).

Current production app build metadata:

| Platform | Value |
|---|---|
| App version | `1.0.1` |
| iOS build number | `6` |
| Android version code | `2` |

> 🔐 **Secrets** (`TICKET_SECRET`, `ADMIN_TOKEN`, APNs key material, Firebase service account JSON, Cloudflare API tokens) live only in Wrangler/GitHub Actions secrets — **never** in this repo or the app bundle.

---

## 🤝 Contributing

Contributions are welcome! Please:

1. Keep the **design system** intact — compose `components/ui/` primitives, don't add ad-hoc styles.
2. Add user-facing strings to **all six** locales (`lib/i18n/locales/{lt,lv,et,pl,en,uk}.ts`).
3. Run `npm run typecheck` before opening a PR.
4. Branch off `main`.

---

## 📄 License

Code is released under the **MIT License** — see [`LICENSE`](./LICENSE). © 2026 MB Programų sprendimai. Shelter datasets remain under their respective sources' licenses listed above; attribution is shown in-app under **Settings → Data sources**.
