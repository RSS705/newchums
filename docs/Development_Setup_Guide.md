# Development Setup Guide

**Last Updated:** February 18, 2026

## Current State

-   **Default post-auth landing:** `/` (Home)
-   **Source of truth:** `web/src/lib/authRedirect.ts` (`DEFAULT_POST_AUTH_REDIRECT`, `getSafeRedirectPath`, `getRequestedPathFromHeaders`)
-   **Onboarding gate:** Root `/` in `(public)/page.tsx`; app routes in `(app)/layout.tsx`
-   **Deep links:** `?next=` on login/signup; `returnTo` through onboarding; validated as relative internal paths only

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

## Date Picker (NCDatePicker)

-   `web/src/components/fields/NCDatePicker.tsx`
-   Used on signup and onboarding. LocalizationProvider in ThemeRegistry.

## Tests

- Run: `cd web && npm run test` (Vitest)
- Age validation: `web/src/lib/ageValidation.test.ts`

## 18+ Testing Checklist

-   **a) Email/password signup – underage:** Use DOB < 18 years ago → expect "NewChums is currently available to people 18 and older." (400)
-   **b) Email/password signup – 18+:** Use valid DOB 18+ → account created, redirect to login
-   **c) Google signup → underage:** Sign in with Google → /onboarding/username → enter DOB < 18 → blocked with same message
-   **d) Google signup → 18+:** Sign in with Google → /onboarding/username → valid DOB 18+ + username → Continue → /

## Post-Auth Redirect Verification

1.  **Existing user email/password login** → lands on `/`
2.  **New user email/password signup** → create account → login → lands on `/`
3.  **Existing Google user login** → lands on `/`
4.  **New Google user:** Sign in with Google → OAuth completes → onboarding (username + DOB) → submit → lands on `/`
5.  **Underage DOB on onboarding:** show "NewChums is currently available to people 18 and older."; stay on onboarding; no redirect
6.  **Deep-link:** visit protected route (e.g. `/profile`) while logged out → login → if onboarded, return to `/profile`; if not onboarded, complete onboarding → lands on `/` (or returnTo if persisted)

## Debugging 500 Signup

1.  Check terminal logs (Next.js).
2.  Inspect Network tab → `/api/auth/signup` → Response.
3.  Confirm DB has:
    -   username column
    -   username_norm column
    -   date_of_birth column (migration 005)
    -   idx_users_username_norm index
