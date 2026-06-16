-- Baltic72 Family — security hardening v2.
-- 1. Bind the unauthenticated X25519 key to the self-certifying Ed25519 identity
--    (nullable so already-registered 1.0.1 clients backfill it on next /v1/devices).
-- 2. Per-group key epoch so owners can rotate the group key after a member is removed.
-- 3. Server-side cooldown table to throttle status_updated family push fan-out.

ALTER TABLE devices ADD COLUMN x25519_sig TEXT;
ALTER TABLE groups ADD COLUMN key_epoch INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS family_notification_cooldowns (
  group_id     TEXT NOT NULL,
  device_id    TEXT NOT NULL,
  event_type   TEXT NOT NULL,
  last_sent_at INTEGER NOT NULL,
  PRIMARY KEY (group_id, device_id, event_type)
);
