-- Replay cache for signed API requests.
-- request_key is a SHA-256 digest over the device id plus either x-request-id
-- or the legacy signature value. Rows expire after the request timestamp window.
CREATE TABLE IF NOT EXISTS signed_request_replays (
  request_key TEXT PRIMARY KEY,
  device_id   TEXT NOT NULL,
  request_id  TEXT,
  expires_at  INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_signed_request_replays_expires ON signed_request_replays(expires_at);

CREATE TABLE IF NOT EXISTS ws_ticket_uses (
  jti        TEXT PRIMARY KEY,
  group_id   TEXT NOT NULL,
  device_id  TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ws_ticket_uses_expires ON ws_ticket_uses(expires_at);

CREATE TABLE IF NOT EXISTS key_envelopes (
  group_id            TEXT NOT NULL,
  recipient_device_id TEXT NOT NULL,
  sender_device_id    TEXT NOT NULL,
  key_epoch           INTEGER NOT NULL DEFAULT 1,
  ciphertext          TEXT NOT NULL,
  created_at          INTEGER NOT NULL,
  PRIMARY KEY (group_id, recipient_device_id, sender_device_id, key_epoch)
);

CREATE INDEX IF NOT EXISTS idx_key_envelopes_recipient ON key_envelopes(group_id, recipient_device_id);

CREATE TABLE IF NOT EXISTS api_rate_limits (
  bucket_key TEXT PRIMARY KEY,
  count      INTEGER NOT NULL,
  reset_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_api_rate_limits_reset ON api_rate_limits(reset_at);
