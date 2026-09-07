-- 122: Profile bios are rich text (same editor and sanitiser as plan
-- descriptions, 2026-09-07). The 500-character limit now applies to the
-- words (enforced in PUT /profile via htmlToPlainText); the markup around
-- them needs room, so the column loses its VARCHAR(500) cap.
ALTER TABLE newchums.user_profile ALTER COLUMN bio TYPE TEXT;
