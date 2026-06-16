-- Baltic72 Family — initial schema.
-- PRIVACY: the server stores ONLY public keys and ciphertext. It never sees
-- a member's name or status in plaintext. The group key that decrypts status
-- lives only on member devices. Invite links carry only a token; an existing
-- member grants the key to the new member as an X25519-wrapped key envelope.

-- A device = an identity. No phone number, no email, no account.
-- id = base64url(sha256(ed25519 public key)). Self-certifying.
CREATE TABLE devices (
  id          TEXT PRIMARY KEY,
  pub_x25519  TEXT NOT NULL,   -- base64url, for per-device key envelopes
  pub_ed25519 TEXT NOT NULL,   -- base64, for request signing / sender auth
  created_at  INTEGER NOT NULL
);

CREATE TABLE groups (
  id         TEXT PRIMARY KEY,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- One row per (group, member). display_ciphertext and status_ciphertext are
-- both encrypted with the shared group key — opaque to the server.
CREATE TABLE memberships (
  group_id          TEXT NOT NULL,
  device_id         TEXT NOT NULL,
  role              TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  display_ciphertext TEXT,                            -- encrypted display name
  status_ciphertext  TEXT,                            -- encrypted {status, ts}
  status_updated_at  INTEGER,
  joined_at         INTEGER NOT NULL,
  PRIMARY KEY (group_id, device_id)
);

-- Invite tokens. We store only a hash of the token; the raw token lives in the
-- shared link. The group KEY is never stored here.
CREATE TABLE invites (
  token_hash TEXT PRIMARY KEY,
  group_id   TEXT NOT NULL,
  created_by TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  max_uses   INTEGER NOT NULL DEFAULT 0,  -- 0 = unlimited until expiry
  uses       INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_memberships_group ON memberships(group_id);
CREATE INDEX idx_invites_group ON invites(group_id);

CREATE TABLE signed_request_replays (
  request_key TEXT PRIMARY KEY,
  device_id   TEXT NOT NULL,
  request_id  TEXT,
  expires_at  INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_signed_request_replays_expires ON signed_request_replays(expires_at);

CREATE TABLE ws_ticket_uses (
  jti        TEXT PRIMARY KEY,
  group_id   TEXT NOT NULL,
  device_id  TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at    INTEGER NOT NULL
);
CREATE INDEX idx_ws_ticket_uses_expires ON ws_ticket_uses(expires_at);

CREATE TABLE key_envelopes (
  group_id            TEXT NOT NULL,
  recipient_device_id TEXT NOT NULL,
  sender_device_id    TEXT NOT NULL,
  key_epoch           INTEGER NOT NULL DEFAULT 1,
  ciphertext          TEXT NOT NULL,
  created_at          INTEGER NOT NULL,
  PRIMARY KEY (group_id, recipient_device_id, sender_device_id, key_epoch)
);
CREATE INDEX idx_key_envelopes_recipient ON key_envelopes(group_id, recipient_device_id);

CREATE TABLE api_rate_limits (
  bucket_key TEXT PRIMARY KEY,
  count      INTEGER NOT NULL,
  reset_at   INTEGER NOT NULL
);
CREATE INDEX idx_api_rate_limits_reset ON api_rate_limits(reset_at);
