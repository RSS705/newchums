#!/usr/bin/env bash
# Read-only audit for the growth experiment's test-account cleanup
# (docs/Growth_Experiment_Plan.md §6.1a). Run BEFORE any deletion: for each
# account it reports hosted plans (QA vs real), RSVPs held (flagging any on
# real plans), chat messages, and invites sent, so deletion holds no
# surprises. No emails are stored in this script or the repo; pass them as
# arguments.
#
# Usage:
#   DATABASE_URL=... scripts/research_account_audit.sh a@b.com c@d.com
#   DATABASE_URL=... scripts/research_account_audit.sh --scan   # candidate hunt
#
# --scan lists accounts whose email matches common test patterns. It is a
# suggestion list for a human to review, never an input to deletion.

set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

if [ "${1:-}" = "--scan" ]; then
  psql "$DATABASE_URL" <<'SQL'
SELECT u.email, u.username, u.created_at::date AS created,
       (SELECT COUNT(*) FROM newchums.events e WHERE e.host_user_id = u.id) AS hosted,
       (SELECT COUNT(*) FROM newchums.event_rsvps r WHERE r.user_id = u.id) AS rsvps,
       u.last_active_at::date AS last_active
FROM newchums.users u
WHERE u.email ~* '(^test|[+.]test|example\.|uitest|mailinator|fakemail|@test\.)'
ORDER BY u.created_at;
SQL
  exit 0
fi

if [ $# -eq 0 ]; then
  echo "Pass one or more account emails, or --scan" >&2
  exit 1
fi

for EMAIL in "$@"; do
  echo "════ ${EMAIL} ════"
  psql "$DATABASE_URL" -v email="$EMAIL" <<'SQL'
SELECT u.id, u.username, u.created_at::date AS created, u.last_active_at::date AS last_active,
       u.research_excluded
FROM newchums.users u WHERE LOWER(u.email) = LOWER(:'email');

SELECT 'hosted plans' AS section,
       COUNT(*) FILTER (WHERE COALESCE(e.is_qa, FALSE)) AS qa_plans,
       COUNT(*) FILTER (WHERE NOT COALESCE(e.is_qa, FALSE)) AS real_plans
FROM newchums.events e
JOIN newchums.users u ON u.id = e.host_user_id
WHERE LOWER(u.email) = LOWER(:'email');

SELECT 'REAL plans hosted (deleting cascades their invites/RSVPs/chat)' AS warning,
       e.id, e.title, e.starts_at::date,
       (SELECT COUNT(*) FROM newchums.event_rsvps r WHERE r.event_id = e.id) AS rsvps
FROM newchums.events e
JOIN newchums.users u ON u.id = e.host_user_id
WHERE LOWER(u.email) = LOWER(:'email') AND NOT COALESCE(e.is_qa, FALSE)
ORDER BY e.starts_at;

SELECT 'RSVPs held on REAL plans (evidence this account touched real data)' AS warning,
       e.title, r.status, r.created_at::date
FROM newchums.event_rsvps r
JOIN newchums.users u ON u.id = r.user_id
JOIN newchums.events e ON e.id = r.event_id
WHERE LOWER(u.email) = LOWER(:'email') AND NOT COALESCE(e.is_qa, FALSE)
ORDER BY r.created_at;

SELECT 'chat messages' AS section, COUNT(*) AS total
FROM newchums.event_chat_messages m
JOIN newchums.users u ON u.id = m.user_id
WHERE LOWER(u.email) = LOWER(:'email');

SELECT 'invites sent' AS section, COUNT(*) AS total
FROM newchums.event_invites i
JOIN newchums.users u ON u.id = i.invited_by
WHERE LOWER(u.email) = LOWER(:'email');
SQL
  echo
done
