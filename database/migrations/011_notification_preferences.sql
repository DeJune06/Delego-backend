-- Migration: 011_notification_preferences
-- Description: Persistent notification preferences per user (#135)

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id UUID PRIMARY KEY,
  email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  push_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notification_preferences_updated_at
  ON notification_preferences(updated_at);

-- Down migration (manual rollback)
-- DROP INDEX IF EXISTS idx_notification_preferences_updated_at;
-- DROP TABLE IF EXISTS notification_preferences;
