# Development Setup Guide

**Last Updated:** February 20, 2026

## Identity System (Current)

-   Email = login credential
-   Username = public identity
-   Username allows uppercase/lowercase display
-   Uniqueness enforced case-insensitively via `username_norm`

## Username Rules

-   3--20 characters
-   Letters, numbers, underscores
-   Cannot start or end with underscore
-   Case preserved in `username`
-   Lowercase stored in `username_norm`
-   Unique index: `idx_users_username_norm`

## Onboarding Gate

-   Located in `(app)/layout.tsx`
-   Single form at `/onboarding/username`: collects username and date of birth
-   If either is missing → redirect to `/onboarding/username`
-   OAuth users complete both fields (18+ enforced on submit)

## Running Migrations (Local)

Migrations live in `web/sql/` (001–005). Run against Neon Postgres using `DATABASE_URL`:

```bash
cd web
psql "$DATABASE_URL" -f sql/005_add_date_of_birth.sql
```

Or run each file in order (001, 002, 003, 004, 005) for a fresh DB. Down migrations exist as `*.down.sql` for rollback.

## Signup (Email/Password)

-   Route: `/api/auth/signup`
-   Requires:
    -   username
    -   email
    -   date_of_birth (YYYY-MM-DD, must be 18+)
    -   password
    -   confirm password
-   Handles:
    -   EMAIL_EXISTS → 409
    -   USERNAME_TAKEN → 409
    -   INVALID_USERNAME → 400
    -   REQUIRED / INVALID_DATE / UNDERAGE / FUTURE_DATE → 400 (date_of_birth)
    -   SERVER_ERROR → 500

Helper text: "You unique handle (letters, numbers, underscores)."

## Tests

- Run: `cd web && npm run test` (Vitest)
- Age validation: `web/src/lib/ageValidation.test.ts`

## 18+ Testing Checklist

-   **a) Email/password signup – underage:** Use DOB < 18 years ago → expect "NewChums is currently available to people 18 and older." (400)
-   **b) Email/password signup – 18+:** Use valid DOB 18+ → account created, redirect to login
-   **c) Google signup → DOB prompt → underage:** Sign in with Google → redirected to /onboarding/date-of-birth → enter DOB < 18 → blocked with same message
-   **d) Google signup → DOB prompt → 18+:** Sign in with Google → /onboarding/date-of-birth → valid DOB 18+ → Continue → /onboarding/username if needed → /home

## Debugging 500 Signup

1.  Check terminal logs (Next.js).
2.  Inspect Network tab → `/api/auth/signup` → Response.
3.  Confirm DB has:
    -   username column
    -   username_norm column
    -   date_of_birth column (migration 005)
    -   idx_users_username_norm index
