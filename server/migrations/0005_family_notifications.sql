-- Family push notification routing.
-- `family_enabled` is separate from emergency country alert preferences so
-- family status notifications can be delivered without subscribing the device
-- to country-wide emergency alerts.

ALTER TABLE push_subscriptions ADD COLUMN family_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE notification_alerts ADD COLUMN route TEXT;

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_family
  ON push_subscriptions(family_enabled, platform);
