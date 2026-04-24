# SQL migrations

All NewChums database migrations live in this directory. They are plain `.sql`
files numbered sequentially, applied in order with `psql`.

## File naming

- `NNN_short_name.sql` - the forward migration. Apply this.
- `NNN_short_name.down.sql` - optional down migration. Only a handful of the
  early migrations (003, 004, 005, 009) ship one. Most recent migrations are
  forward-only.

Files that add columns, tables, or indexes can generally be re-applied safely
if they use `IF NOT EXISTS` guards. Data migrations should be treated as one
shot.

## Applying migrations

There is no migration runner or version-tracking table. Migrations are applied
manually, in numerical order, against the target database. This is the same
command pattern used in
[docs/Development_Setup_Guide.md](../../docs/Development_Setup_Guide.md):

```bash
# From web/
psql "$DATABASE_URL" -f sql/083_subscription_plan.sql
psql "$DATABASE_URL" -f sql/084_remove_guest_participation.sql
# ... etc, in numerical order
```

For a fresh local database, apply every file in order from `001_` through the
highest-numbered file. Against an existing database, apply only the new
migrations since the last deploy.

## Deploy order

Always run migrations against production Neon **before** deploying the API or
web workers that depend on the new schema. Deploying code that expects columns
that do not yet exist will surface as 500s immediately.

Recommended order for a pilot deploy:

1. Apply any new `web/sql/NNN_*.sql` files to the production Neon database.
2. Deploy the API worker (`cd api && npx wrangler deploy --env production`).
3. Deploy the web worker (`cd web && npx wrangler deploy --env production`).

## Forward-only and destructive migrations

Recent migrations (roughly 040+) do not ship `.down.sql` files and should be
treated as forward-only. Some are destructive - for example
[084_remove_guest_participation.sql](084_remove_guest_participation.sql) drops
columns and rows tied to the old guest-RSVP model.

For anything forward-only or destructive, plan recovery around Neon
point-in-time restore, not down migrations. See
[docs/Rollback_Procedures.md](../../docs/Rollback_Procedures.md) for details.

Before applying a destructive migration to production:

- Take a Neon branch or note the PITR timestamp.
- Skim the SQL file to understand what it drops or rewrites.
- If the change is risky, apply it to a Neon branch first and smoke-test
  the API worker against that branch's connection string.

## Latest applied migration

The highest-numbered file here is the latest migration. To see what is
currently on disk:

```bash
ls web/sql/ | tail -5
```

There is no `schema_migrations` table or equivalent, so the "current version"
of the production database is whatever numbered file was last applied. Keep a
deploy note for each pilot push recording which file you ran.
