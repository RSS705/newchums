-- Migration 018: Add gender field to users table
-- Stored as free-form text; validated to allowed values in application code.
-- Allowed values: male, female, other, prefer_not_to_say (or NULL for unset).

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS gender TEXT NULL;
