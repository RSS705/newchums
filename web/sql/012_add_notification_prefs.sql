-- Migration 012: Add notification_prefs JSONB to user_profile
-- Run: psql "$DATABASE_URL" -f web/sql/012_add_notification_prefs.sql
-- Stores per-notification-type preferences: enabled + frequency.

ALTER TABLE user_profile ADD COLUMN IF NOT EXISTS notification_prefs JSONB NOT NULL DEFAULT '{}'::jsonb;
