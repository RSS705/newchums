-- Migration 003: Add required, unique username to users
-- Run against Neon Postgres. Safe to run multiple times (uses IF NOT EXISTS / IF EXISTS).
-- Backfill: derives username from name (or email local-part), normalizes to lowercase,
-- ensures uniqueness by appending _2, _3, etc. on collisions.

-- 1) Add nullable column
ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT;

-- 2) Backfill existing rows
DO $$
DECLARE
  r RECORD;
  base TEXT;
  candidate TEXT;
  suffix INT;
  sanitized TEXT;
BEGIN
  FOR r IN SELECT id, name, email FROM users WHERE username IS NULL ORDER BY id
  LOOP
    -- Derive base from name or email local-part; sanitize to [a-z0-9_], no leading/trailing underscore
    sanitized := regexp_replace(
      regexp_replace(
        lower(coalesce(nullif(trim(r.name), ''), split_part(r.email, '@', 1))),
        '[^a-z0-9_]',
        '',
        'g'
      ),
      '^_+|_+$',
      '',
      'g'
    );

    IF length(sanitized) < 3 OR sanitized = '' THEN
      base := 'user' || substr(replace(r.id::text, '-', ''), 1, 6);
    ELSE
      base := substr(sanitized, 1, 20);
    END IF;

    candidate := base;
    suffix := 1;

    -- Ensure uniqueness: append _2, _3, ... if candidate already taken
    WHILE EXISTS (SELECT 1 FROM users WHERE username = candidate) LOOP
      suffix := suffix + 1;
      candidate := base || '_' || suffix;
    END LOOP;

    UPDATE users SET username = candidate WHERE id = r.id;
  END LOOP;
END $$;

-- 3) Make NOT NULL
ALTER TABLE users ALTER COLUMN username SET NOT NULL;

-- 4) Add unique constraint
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users (username);
