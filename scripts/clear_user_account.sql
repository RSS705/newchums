-- Clear a user account by email. Run from repo root: psql "$DATABASE_URL" -f scripts/clear_user_account.sql
-- Replace 'robert@ourmodule.com' with the target email.
--
-- Schema note: If your DB uses the newchums schema, replace:
--   users → newchums.users
--   user_interests → newchums.user_interests (if applicable)
--   password_reset_tokens → newchums.password_reset_tokens (if applicable)
--   email_verification_tokens → newchums.email_verification_tokens (if applicable)
--   user_profile → newchums.user_profile (if applicable)

BEGIN;

WITH u AS (
  SELECT id FROM users WHERE email = 'robert@ourmodule.com'
)
DELETE FROM user_interests ui
USING u
WHERE ui.user_id = u.id;

WITH u AS (
  SELECT id FROM users WHERE email = 'robert@ourmodule.com'
)
DELETE FROM email_verification_tokens evt
USING u
WHERE evt.user_id = u.id;

WITH u AS (
  SELECT id FROM users WHERE email = 'robert@ourmodule.com'
)
DELETE FROM password_reset_tokens prt
USING u
WHERE prt.user_id = u.id;

WITH u AS (
  SELECT id FROM users WHERE email = 'robert@ourmodule.com'
)
DELETE FROM user_profile up
USING u
WHERE up.user_id = u.id;

DELETE FROM users
WHERE email = 'robert@ourmodule.com';

COMMIT;
