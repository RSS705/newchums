-- Migration 023: Create chum_invites table
--
-- Stores invitations sent by existing users to email addresses not yet on NewChums.
-- When the recipient signs up via the invite link, both users are auto-linked as Chums.
--
-- inviter_user_id     = the authenticated user who sent the invite
-- invitee_email       = the email the invite was sent to (lowercased)
-- token               = the plaintext token included in the invite URL (short-lived, URL-safe)
-- token_hash          = SHA-256 of the token; the plaintext token is never stored
-- status              = 'pending' | 'accepted' | 'expired'
-- expires_at          = 30 days from creation; pending invites older than this are ignored
-- accepted_at         = timestamp set when the invite is consumed during signup
-- accepted_user_id    = the newly-created user's id once the invite is accepted
-- created_at          = invite creation time

CREATE TABLE IF NOT EXISTS newchums.chum_invites (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_user_id   UUID        NOT NULL REFERENCES newchums.users(id) ON DELETE CASCADE,
  invitee_email     TEXT        NOT NULL,
  token_hash        TEXT        NOT NULL,
  status            TEXT        NOT NULL DEFAULT 'pending',
  expires_at        TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  accepted_at       TIMESTAMPTZ NULL,
  accepted_user_id  UUID        NULL REFERENCES newchums.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chum_invites_status_check CHECK (status IN ('pending', 'accepted', 'expired')),
  CONSTRAINT chum_invites_no_self_invite CHECK (
    accepted_user_id IS NULL OR accepted_user_id <> inviter_user_id
  )
);

-- Fast lookup for "does a valid pending invite already exist for this email?"
CREATE INDEX IF NOT EXISTS idx_chum_invites_email_status
  ON newchums.chum_invites (invitee_email, status);

-- Fast lookup for consuming an invite by token hash
CREATE UNIQUE INDEX IF NOT EXISTS idx_chum_invites_token_hash
  ON newchums.chum_invites (token_hash);

-- Fast lookup by inviter
CREATE INDEX IF NOT EXISTS idx_chum_invites_inviter
  ON newchums.chum_invites (inviter_user_id);
