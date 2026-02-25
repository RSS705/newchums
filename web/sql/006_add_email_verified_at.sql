-- Migration 006: Add email_verified_at to users for Credentials email verification
-- Credentials signups start with email_verified_at = NULL; Google OAuth users get now().
-- If using newchums schema: ALTER TABLE newchums.users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ NULL;

ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ NULL;
