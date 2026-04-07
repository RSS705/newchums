-- 071: Add age preference column to chum_preferences and drop the master toggle.
--
-- Two coordinated changes:
--   1. Add `age_pref_years` (NULL = Any age, otherwise 5/10/15) — evaluated
--      dynamically against DOB at match time, never stored as absolute bounds.
--   2. Remove the `enabled` master toggle. Permissive metric values
--      ('open' / Any age) are now the canonical "no filtering" state.
--
-- Behavior preservation: users who previously had `enabled = false` had all
-- chum preference checks short-circuited. To keep that effective behavior
-- after the column drop, reset all of their metric levels to 'open' first.

ALTER TABLE newchums.chum_preferences
  ADD COLUMN IF NOT EXISTS age_pref_years SMALLINT NULL;

ALTER TABLE newchums.chum_preferences
  ADD CONSTRAINT chum_pref_age_years_check
    CHECK (age_pref_years IS NULL OR age_pref_years IN (5, 10, 15));

UPDATE newchums.chum_preferences
SET reliability_level  = 'open',
    sociability_level  = 'open',
    presentation_level = 'open',
    hosting_level      = 'open',
    updated_at         = NOW()
WHERE enabled = false;

ALTER TABLE newchums.chum_preferences DROP COLUMN IF EXISTS enabled;
