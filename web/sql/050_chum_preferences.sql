-- 050_chum_preferences.sql
-- Adds chum preferences table and seeds baseline user_metrics rows.

-- Chum preferences: per-user matching strictness settings
CREATE TABLE IF NOT EXISTS newchums.chum_preferences (
  user_id            UUID        PRIMARY KEY REFERENCES newchums.users(id) ON DELETE CASCADE,
  enabled            BOOLEAN     NOT NULL DEFAULT true,
  reliability_level  TEXT        NOT NULL DEFAULT 'preferred',
  sociability_level  TEXT        NOT NULL DEFAULT 'open',
  presentation_level TEXT        NOT NULL DEFAULT 'open',
  hosting_level      TEXT        NOT NULL DEFAULT 'open',
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chum_pref_reliability_check  CHECK (reliability_level  IN ('open', 'preferred', 'important', 'required')),
  CONSTRAINT chum_pref_sociability_check  CHECK (sociability_level  IN ('open', 'preferred', 'important', 'required')),
  CONSTRAINT chum_pref_presentation_check CHECK (presentation_level IN ('open', 'preferred', 'important', 'required')),
  CONSTRAINT chum_pref_hosting_check      CHECK (hosting_level      IN ('open', 'preferred', 'important', 'required'))
);
