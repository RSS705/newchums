-- Preserve who was removed, when, by whom, and why. The row itself already
-- survives the removal (status = 'removed'); these columns let the owner see
-- useful history on the Members tab later and power the removal-notification
-- email to the removed user.

ALTER TABLE newchums.community_members
  ADD COLUMN IF NOT EXISTS removal_reason     TEXT,
  ADD COLUMN IF NOT EXISTS removed_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS removed_by_user_id UUID REFERENCES newchums.users(id);
