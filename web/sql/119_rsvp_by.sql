-- 119: Optional "RSVP by" deadline on plans.
-- Informational only: it tells invitees when the host needs answers and
-- shows on the plan page, the invite email, and the share-link unfurl.
-- RSVPs stay open after it (a late yes beats no yes) and nothing is
-- scheduled off it. Validated in the API to fall before starts_at.
ALTER TABLE newchums.events ADD COLUMN IF NOT EXISTS rsvp_by_at TIMESTAMPTZ NULL;
