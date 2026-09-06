-- 121: Remove the text shout-outs and the community roadmap.
--
-- Run AFTER the API and web deploys that stop referencing these tables
-- (commit "Kudos replace shout-outs; roadmap retired; ...").
-- Rob's call, 2026-09-06: the data is not worth keeping, so nothing is
-- exported or archived here. R2 objects under roadmap_attachments/ are left
-- in the bucket; nothing serves them any more.
DROP TABLE IF EXISTS newchums.shoutouts;
ALTER TABLE newchums.users DROP COLUMN IF EXISTS is_hidden_shoutouts;

DROP TABLE IF EXISTS newchums.roadmap_comments;
DROP TABLE IF EXISTS newchums.roadmap_admin_notes;
DROP TABLE IF EXISTS newchums.roadmap_votes;
DROP TABLE IF EXISTS newchums.roadmap_follows;
DROP TABLE IF EXISTS newchums.roadmap_items;

-- Bell rows that pointed at the removed sections, and any queued mail.
DELETE FROM newchums.notifications WHERE type = 'shoutout_received' OR type LIKE 'roadmap%';
DELETE FROM newchums.email_outbox WHERE kind IN ('shoutout_received', 'roadmap_update') AND status = 'pending';
DELETE FROM newchums.admin_view_timestamps WHERE section IN ('shoutouts', 'roadmap');
-- The onboarding objective was renamed to give_first_kudos; old completions would be orphans.
DELETE FROM newchums.user_objective_completions WHERE objective_key = 'send_first_shoutout';
