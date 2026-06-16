-- Push notification subscriptions and delivery accounting.
-- Device push tokens are sensitive routing identifiers, not user identity.
-- They are stored only to deliver emergency alerts and can be disabled when
-- providers report that the token is no longer valid.

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id            TEXT PRIMARY KEY,
  device_id     TEXT NOT NULL,
  platform      TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  token         TEXT NOT NULL,
  environment   TEXT NOT NULL DEFAULT 'production' CHECK (environment IN ('sandbox', 'production')),
  app_version   TEXT,
  locale        TEXT,
  enabled       INTEGER NOT NULL DEFAULT 1,
  failure_count INTEGER NOT NULL DEFAULT 0,
  last_error    TEXT,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  UNIQUE(platform, token)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_device ON push_subscriptions(device_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_enabled ON push_subscriptions(enabled, platform);

CREATE TABLE IF NOT EXISTS push_subscription_countries (
  subscription_id TEXT NOT NULL,
  country         TEXT NOT NULL CHECK (country IN ('LT', 'LV', 'EE', 'PL')),
  PRIMARY KEY (subscription_id, country)
);

CREATE INDEX IF NOT EXISTS idx_push_subscription_countries_country
  ON push_subscription_countries(country, subscription_id);

CREATE TABLE IF NOT EXISTS notification_alerts (
  id               TEXT PRIMARY KEY,
  title            TEXT NOT NULL,
  body             TEXT NOT NULL,
  severity         TEXT NOT NULL CHECK (severity IN ('info', 'watch', 'warning', 'critical')),
  countries        TEXT NOT NULL,
  time_sensitive   INTEGER NOT NULL DEFAULT 0,
  critical         INTEGER NOT NULL DEFAULT 0,
  dry_run          INTEGER NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'queued',
  total_targets    INTEGER NOT NULL DEFAULT 0,
  enqueued_batches INTEGER NOT NULL DEFAULT 0,
  sent_count       INTEGER NOT NULL DEFAULT 0,
  failed_count     INTEGER NOT NULL DEFAULT 0,
  created_at       INTEGER NOT NULL,
  completed_at     INTEGER
);

CREATE INDEX IF NOT EXISTS idx_notification_alerts_created ON notification_alerts(created_at);
CREATE INDEX IF NOT EXISTS idx_notification_alerts_status ON notification_alerts(status);

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id               TEXT PRIMARY KEY,
  alert_id         TEXT NOT NULL,
  subscription_id  TEXT,
  platform         TEXT NOT NULL,
  status           TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'dry_run')),
  provider_status  INTEGER,
  provider_message TEXT,
  attempted_at     INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_alert ON notification_deliveries(alert_id);
