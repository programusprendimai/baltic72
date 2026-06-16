# Baltic72 Family — Cloudflare backend

End-to-end-encrypted family status. The server (Cloudflare Worker + D1 + a
Durable Object per group) only ever stores **public keys and ciphertext** — it
cannot read who your family is, their names, or their safe/unsafe status.

The same Worker also delivers native APNs/FCM notifications and serves the
over-the-air shelter data snapshot from R2.

## What this creates on Cloudflare

| Resource | Role |
|---|---|
| **Worker** `baltic72-family` | The HTTPS API (Hono). |
| **D1 database** `baltic72_family` | Stores devices (public keys), group membership, and **ciphertext** status/name blobs. |
| **Durable Object** `FamilyGroup` | One per group; fans out live status over WebSocket. |
| **Queue** `baltic72-alerts` | Fan-out work queue for emergency push delivery. |
| **Queue** `baltic72-alerts-dlq` | Dead-letter queue for exhausted alert-delivery retries. |
| **R2 bucket** `baltic72-shelters` | Open-data shelter snapshot for OTA map refresh. |
| **Var** `FCM_ANDROID_PACKAGE_NAME` | Android package bound into FCM requests. |
| **Secret** `TICKET_SECRET` | HMAC key for short-lived WebSocket tickets. |
| **Secret** `ADMIN_TOKEN` | Bearer token for `/admin/*` notification endpoints. |
| **Secrets** `APNS_*` | Apple APNs key id, team id, bundle id, and private key. |
| **Secret** `FCM_SERVICE_ACCOUNT_JSON` | Firebase service account JSON for Android FCM delivery. |

## Security model (summary)

- **Identity = a keypair**, generated on-device. No phone number, email, or password. Private keys never leave the phone (stored in the OS keychain).
- **Group key** (random 32 bytes) encrypts every status/name. It lives only on member devices. Invite links carry only a group id and token in the URL fragment; existing members grant the group key to the joining device through X25519-wrapped key envelopes. Cloudflare never sees the plaintext key.
- **Every mutating request is signed** with the device's Ed25519 key; the Worker verifies it (replay window ±120s).
- **Server sees metadata only**: which device public keys share a group, and update timestamps. Not the contents.
- **Family notification copy is generic** because the server cannot decrypt names/status. It localizes "member joined", "member left", and "status changed" using the recipient push token's stored locale.

## Deploy (manual)

```bash
cd server
npm install
npx wrangler login                       # opens browser

# 1. Create the D1 database, then paste the printed database_id into wrangler.toml
npx wrangler d1 create baltic72_family

# 2. Apply the schema
npx wrangler d1 migrations apply baltic72_family --remote

# 3. Set the WebSocket ticket secret
openssl rand -base64 32 | npx wrangler secret put TICKET_SECRET

# 4. Set provider/admin notification secrets if push is enabled
npx wrangler secret put ADMIN_TOKEN
npx wrangler secret put APNS_KEY_ID
npx wrangler secret put APNS_TEAM_ID
npx wrangler secret put APNS_BUNDLE_ID
npx wrangler secret put APNS_PRIVATE_KEY
npx wrangler secret put FCM_SERVICE_ACCOUNT_JSON

# 5. Deploy
npx wrangler deploy
```

`wrangler deploy` prints your API URL, e.g. `https://baltic72-family.<subdomain>.workers.dev`.
Put it in the app's `app.json` under `expo.extra.familyApiUrl`.

## API

All `/v1/*` calls except `POST /v1/devices` require these headers:
`x-device-id`, `x-timestamp` (ms), `x-signature` = base64url Ed25519 signature of
`` `${timestamp}.${method}.${path+query}.${requestId}.${base64url(sha256(body))}` ``.
Clients also send `x-request-id`; legacy clients without it use
`` `${timestamp}.${method}.${path+query}.${base64url(sha256(body))}` ``.

| Method | Path | Purpose |
|---|---|---|
| POST | `/v1/devices` | Register device public keys → returns `deviceId`. |
| POST | `/v1/groups` | Create a group (caller becomes owner). |
| POST | `/v1/groups/:id/invites` | Mint a single-use invite token; group key is delivered later through key envelopes. |
| POST | `/v1/groups/:id/join` | Join with an invite token. |
| PUT  | `/v1/groups/:id/me` | Update my encrypted status / name; fans out live. |
| GET  | `/v1/groups/:id` | Snapshot of all members (ciphertext). |
| PUT | `/v1/groups/:id/key-envelopes/:deviceId` | Existing member uploads an encrypted group-key envelope for a new member. |
| GET | `/v1/groups/:id/key-envelopes/me` | Pending key envelopes for the calling device. |
| DELETE | `/v1/groups/:id/members/:deviceId` | Leave, or (owner) remove a member. |
| POST | `/v1/groups/:id/ws-ticket` | Get a 60s WebSocket ticket. |
| GET  | `/v1/groups/:id/ws?ticket=…` | WebSocket stream of live updates. |
| PUT | `/v1/push/subscription` | Signed native APNs/FCM token + country preference registration. |
| PUT | `/v1/push/preferences` | Update country alert preferences and/or family notification preference for existing tokens. |
| DELETE | `/v1/push/subscription` | Remove all push subscriptions for the calling device. |

## Note on member removal

Removing a member stops the server from relaying their updates, but they retain
the group key they already received. For true forward secrecy on removal, rotate
the group key and re-share it to remaining members; a `key_epoch` column is
reserved for that upgrade.

## Emergency push notification backend

The Worker sends production alerts directly to APNs and FCM. Admin requests
create an alert row in D1 and enqueue fan-out batches to `baltic72-alerts`.
The Queue consumer sends provider requests, records each delivery attempt, and
lets Cloudflare retry failed queue messages before they move to
`baltic72-alerts-dlq`. Delivery state rows make queue retries idempotent, so
successful devices are not sent the same alert again when a batch is retried.

Family notifications use the same delivery pipeline. When a member joins,
leaves/is removed, or changes encrypted status, the Worker creates a
time-sensitive family notification for the other family devices that registered
`familyEnabled: true`. The alert row stores `family_event_type`; each provider
request uses the target subscription's `locale` to choose Lithuanian, Latvian,
Estonian, Polish, English, or Ukrainian copy.

Required provider secrets:

```bash
npx wrangler secret put ADMIN_TOKEN
npx wrangler secret put APNS_KEY_ID
npx wrangler secret put APNS_TEAM_ID
npx wrangler secret put APNS_BUNDLE_ID
npx wrangler secret put APNS_PRIVATE_KEY
npx wrangler secret put FCM_SERVICE_ACCOUNT_JSON
```

Admin API:

| Method | Path | Purpose |
|---|---|---|
| POST | `/admin/alerts` | Create and enqueue an emergency alert. Requires `Authorization: Bearer <ADMIN_TOKEN>`. |
| GET | `/admin/alerts/:id` | Read alert fan-out status. |
| POST | `/admin/smoke` | Enqueue a dry-run alert to verify Queue + D1 processing. |

## Shelter data delivery (over-the-air updates)

The worker also serves the open-data shelter snapshot so the app can refresh its
map data without an app-store release. The app polls `shelterUpdateUrl`
(`app.json` → `expo.extra`, set to `…/shelters/manifest`); `lib/sync.ts` swaps
the local SQLite table when the manifest `version` changes. Auto-refresh runs on
launch + foreground (6h cooldown); Settings → Data has a manual "Update" button.

| Method | Path | Purpose |
|---|---|---|
| GET | `/shelters/manifest` | `{version, generated_at, count, url}` — `url` is injected at the request origin. |
| GET | `/shelters/data` | Full normalized shelters JSON (array), streamed from R2. |

Cloudflare Workers can't run GDAL, so normalization stays in the Python pipeline
(`scripts/`). The pipeline produces `data/seed/shelters.json` +
`shelters.manifest.json`; those are uploaded to an R2 bucket the worker reads.

### One-time setup
```bash
npx wrangler r2 bucket create baltic72-shelters   # bound as SHELTERS in wrangler.toml
npx wrangler deploy                                 # ship the /shelters/* routes
```
For automated refresh, add repo secrets `CLOUDFLARE_API_TOKEN` (R2 read/write)
and `CLOUDFLARE_ACCOUNT_ID`; the `.github/workflows/refresh-shelters.yml` cron
rebuilds + publishes weekly. This supersedes `refresh-pagd.yml` (which commits
the ~55 MB JSON into git) — that workflow can be deleted.

### Manual publish
```bash
python3 scripts/fetch-pagd.py
python3 scripts/fetch-shelters-intl.py
scripts/publish-shelters.sh        # builds manifest + uploads both to R2
```
