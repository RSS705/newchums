-- Migration 033: Simplify notification preferences JSONB
--
-- Removes the obsolete "frequency" field from each notification preference
-- item and drops the removed "event_reminders" key.
--
-- These values lived only inside the notification_prefs JSONB column on
-- user_profile — no dedicated columns are affected.
--
-- Safe to run: only modifies rows that still contain the old keys/fields.
--
-- Run: psql "$DATABASE_URL" -f web/sql/033_simplify_notification_prefs.sql

-- 1. Remove the "event_reminders" key from existing rows
UPDATE user_profile
SET notification_prefs = notification_prefs #- '{items,event_reminders}'
WHERE notification_prefs->'items' ? 'event_reminders';

-- 2. Strip "frequency" from each remaining notification item
UPDATE user_profile
SET notification_prefs = jsonb_set(
  notification_prefs,
  '{items}',
  (
    SELECT jsonb_object_agg(key, value - 'frequency')
    FROM jsonb_each(notification_prefs->'items')
  )
)
WHERE notification_prefs->'items' IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM jsonb_each(notification_prefs->'items') AS kv
    WHERE kv.value ? 'frequency'
  );
