-- Reliability and audit support for production emergency push delivery.

CREATE TABLE IF NOT EXISTS notification_delivery_state (
  alert_id         TEXT NOT NULL,
  subscription_id  TEXT NOT NULL,
  platform         TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  status           TEXT NOT NULL CHECK (status IN ('processing', 'sent', 'failed')),
  attempts         INTEGER NOT NULL DEFAULT 0,
  provider_status  INTEGER,
  provider_message TEXT,
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL,
  PRIMARY KEY (alert_id, subscription_id)
);

CREATE INDEX IF NOT EXISTS idx_notification_delivery_state_status
  ON notification_delivery_state(status, updated_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_deliveries_alert_subscription
  ON notification_deliveries(alert_id, subscription_id)
  WHERE subscription_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS admin_audit_events (
  id         TEXT PRIMARY KEY,
  event      TEXT NOT NULL,
  ip         TEXT,
  user_agent TEXT,
  cf_ray     TEXT,
  details    TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_events_created
  ON admin_audit_events(created_at);
