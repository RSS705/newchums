# Rollback Procedures

A short, practical note for rolling back a NewChums pilot deploy. This is not a
full incident response runbook - it covers the 95% case: "I pushed something and
the site is worse than before, get me back to the last known-good state."

## Before you deploy

1. Record the current production Worker version ID for both workers:

   ```bash
   # From repo root
   cd api && npx wrangler deployments list --env production | head -5
   cd ../web && npx wrangler deployments list --env production | head -5
   ```

   The top row in each listing is the currently active version. Copy both IDs
   into a note. These are your "known good" rollback targets.

2. If the deploy includes a schema change, take a Neon branch or note the
   current Neon PITR timestamp before applying the migration. Neon's
   point-in-time restore is the only supported way to undo a migration unless
   an explicit `NNN_*.down.sql` file exists for it.

## Rolling back a Worker

Cloudflare lets you re-point the production alias at any previous deployment.
The commands below do not roll back code in git - they swap which worker version
is running in production.

### Rolling back the API worker

```bash
cd api
npx wrangler deployments list# Pick the previous deployment ID (the one that was active before the bad deploy).
npx wrangler rollback <deployment-id>```

### Rolling back the web worker

```bash
cd web
npx wrangler deployments listnpx wrangler rollback <deployment-id>```

### Order matters

If you are rolling back both workers because a migration broke things, roll
back the API worker first (it is the one reading from the DB), then the web
worker. If you rolled back because the web worker is broken, the API worker
does not need to move.

## Rolling back the database

There is no general "migrate down" command. Most migrations under
[web/sql/](../web/sql) are forward-only - they add columns, add tables, or do
one-way data changes. Only a few early migrations have an accompanying
`NNN_*.down.sql` file.

If you need to undo a migration, the supported path is Neon point-in-time
restore:

1. Open the Neon console for the production database.
2. Restore or branch from a point-in-time just before the migration ran.
3. If you created a Neon branch before deploying, promote that branch instead.
4. Update the API worker's `DATABASE_URL` secret if the restore produced a new
   connection string.

Forward-only migrations you cannot undo with a down file include (but are not
limited to) the guest-participation removal
([084_remove_guest_participation.sql](../web/sql/084_remove_guest_participation.sql))
and all QR-redirect migrations (085-089). Plan DB rollback around PITR, not
around down migrations.

## What to do if the pilot breaks

Work through this list top to bottom. Stop as soon as the site is healthy.

1. **Tail both workers** - open two terminals and run
   `npx wrangler tail --env production` in `api/` and `web/`. Look for the first
   error line and the handler that threw.
2. **Check Sentry** - if the error pattern is clear in Sentry, that is usually
   faster than tailing.
3. **Decide the scope** - is it a frontend-only regression, an API-only
   regression, or a DB/migration issue? The rollback target follows the scope:
   only roll back the worker that is actually broken.
4. **Roll back the offending worker** using the commands above.
5. **If a migration is implicated**, do not just revert the worker - restore
   the DB via Neon PITR before restoring the pre-migration worker. Otherwise
   the old code will run against a new schema.
6. **Verify** - hit the main paths that failed and confirm the errors are gone.
   Tail for another few minutes.
7. **Take notes** - write down what happened and what you rolled back to, so
   the follow-up fix and redeploy can land cleanly.

If rolling back does not restore the site (e.g. the previous version is also
broken because an external dependency changed), escalate by putting a
temporary maintenance banner on the landing page rather than continuing to
roll back further.

## Sanity checks after any rollback

- Load `/` and one authed page (e.g. `/your-plan`) in a fresh incognito window.
- Sign in with email + password.
- Confirm Sentry stops receiving the error pattern you rolled back to fix.
- Confirm Postmark activity looks normal for any emails the broken path would
  have triggered.
