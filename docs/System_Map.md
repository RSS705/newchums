# System Map

**Last Updated:** February 18, 2026

## Flow

User → Next.js (App Router) → Auth.js → API Route → Neon PostgreSQL

## Routes

-   **`/`:** Landing page. Logged-out or logged-in onboarded users see `LandingLayout` + `LandingHero`. Logged-in not-onboarded → redirect to onboarding.
-   **`/home`, `/events`, `/profile`, etc.:** App routes with `AppShell` (dashboard layout).

## Identity Model

users table: - id - email - password_hash - username (display) -
username_norm (unique) - date_of_birth (nullable, YYYY-MM-DD)

## OAuth Flow

Google login → create user (no username) → onboarding gate → set
username

## Email Signup Flow

Signup form → `/api/auth/signup` → insert user with username +
username_norm
