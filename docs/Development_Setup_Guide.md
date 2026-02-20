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
-   Redirects authenticated users without username
-   OAuth users must complete onboarding

## Signup (Email/Password)

-   Route: `/api/auth/signup`
-   Requires:
    -   username
    -   email
    -   password
    -   confirm password
-   Handles:
    -   EMAIL_EXISTS → 409
    -   USERNAME_TAKEN → 409
    -   INVALID_USERNAME → 400
    -   SERVER_ERROR → 500

Helper text: "You unique handle (letters, numbers, underscores)."

## Debugging 500 Signup

1.  Check terminal logs (Next.js).
2.  Inspect Network tab → `/api/auth/signup` → Response.
3.  Confirm DB has:
    -   username column
    -   username_norm column
    -   idx_users_username_norm index
