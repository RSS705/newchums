-- Migration 027: Add private notes to user_chums
--
-- Each note is private to the user who saved the chum entry.
-- Only the owner of the chum relationship can read or write this note.

ALTER TABLE newchums.user_chums
  ADD COLUMN IF NOT EXISTS note TEXT NULL;

COMMENT ON COLUMN newchums.user_chums.note IS
  'Private note about this chum, visible only to the user who added them (user_id)';
