-- Migration 110: per-recipient outbox for cron-sent plan emails.
--
-- processPlanWrapUpEmails and processRunItAgainNudges used to stamp a plan
-- as processed before knowing whether the provider accepted the send, so a
-- rejected send was lost silently and nothing recorded it. The jobs now
-- expand plans into outbox rows (the plan-level stamp means "expanded", and
-- keeps its once-per-plan meaning), and a shared processor delivers from
-- here with bounded retries. See processEmailOutbox in api/src/index.ts for
-- the retry/give-up classification.

CREATE TABLE IF NOT EXISTS newchums.email_outbox (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind        TEXT        NOT NULL,  -- 'plan_wrapup' | 'run_it_again'
  event_id    UUID        NOT NULL REFERENCES newchums.events(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES newchums.users(id) ON DELETE CASCADE,
  -- Render inputs frozen at enqueue time (e.g. wrap-up role); everything
  -- else (names, unsubscribe tokens) is resolved at send time so tokens
  -- are fresh on retries.
  payload     JSONB       NOT NULL DEFAULT '{}'::jsonb,
  attempts    INT         NOT NULL DEFAULT 0,
  -- pending: awaiting (re)delivery. sent: provider accepted. gave_up:
  -- provider definitively rejected (non-retryable 4xx) or retries
  -- exhausted. ambiguous: the request may or may not have been delivered
  -- (network-level failure with no HTTP response); never retried, because
  -- a duplicate email is worse than a missing one.
  status      TEXT        NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'sent', 'gave_up', 'ambiguous')),
  last_error  TEXT        NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at     TIMESTAMPTZ NULL,
  UNIQUE (kind, event_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_email_outbox_pending
  ON newchums.email_outbox (created_at)
  WHERE status = 'pending';
