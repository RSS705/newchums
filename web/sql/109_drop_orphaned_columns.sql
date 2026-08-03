-- Migration 109: drop columns nothing reads.
--
-- Sweep method: every column of users/events/user_profile grepped against
-- api/src and web/src; these two had zero references.
--
-- users.share_link_modal_dismissed (migration 062): the share-link first-use
-- modal was replaced by the share moment (Aug 2026); its endpoint and the
-- plan-detail read were removed then, and Technical_Specs has carried a
-- "drop in the next sweep" note since.
--
-- user_profile.chat_digest_sent_at (unread-chat-digest cooldown): the daily
-- digest was retired when plan chat went silent-by-default with per-message
-- opt-in notifications; the cron job that stamped this column is gone.

ALTER TABLE newchums.users DROP COLUMN IF EXISTS share_link_modal_dismissed;
ALTER TABLE newchums.user_profile DROP COLUMN IF EXISTS chat_digest_sent_at;
