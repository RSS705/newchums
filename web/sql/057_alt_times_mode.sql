-- 057: Add scheduling presentation mode for alternate times feature.
-- 'suggest' = current behavior (suggest another time if needed)
-- 'availability' = collaborative (share your availability)

ALTER TABLE newchums.events
  ADD COLUMN IF NOT EXISTS alt_times_mode TEXT NOT NULL DEFAULT 'suggest';
