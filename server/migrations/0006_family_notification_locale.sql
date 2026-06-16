-- Preserve the family event type so each APNs/FCM delivery can localize
-- notification title/body using the recipient device's stored app locale.

ALTER TABLE notification_alerts ADD COLUMN family_event_type TEXT;
