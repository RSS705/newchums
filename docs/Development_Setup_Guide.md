# Development Setup Guide

**Last Updated:** February 18, 2026

## Current State

- Web (Next.js): runs on `localhost:3000`.
- API (Cloudflare Workers): runs via `npx wrangler dev`.
- Auth split layout: `AuthSplitLayout` used by login, signup, forgot-password. Two-column on desktop; single-column on mobile.

## Web

cd web npm install npm run dev

## API

cd api npx wrangler dev

## Layout Debug Method

document.querySelector('header img').getBoundingClientRect().left
document.querySelector('main h1').getBoundingClientRect().left

Values must match before modifying structure.

---

## Chunk: Auth Split Layout + Forgot Password Alignment

- **Goal:** Align forgot-password UI to template structure (two-column auth layout) and create a shared layout reusable across auth pages.
- **Changes made:**
  - Created `AuthSplitLayout` (`web/src/components/layout/AuthSplitLayout.tsx`): two-column layout (illustration left, form right), responsive collapse on mobile.
  - Refactored `LoginClient` to use `AuthSplitLayout` instead of inline layout.
  - Refactored `ForgotPasswordPage` to use `AuthSplitLayout` with template-like structure: title "Forgot your password?", description, email field, primary "Send reset link" button, secondary "Back to login" button.
- **Env vars / secrets added or changed:** None.
- **Deploy notes:** Web only (Cloudflare Pages).
- **Verification steps:** Open `http://localhost:3000/login` and `http://localhost:3000/forgot-password`; confirm two-column layout on desktop, single-column on mobile; confirm forgot-password form submit and "Back to login" navigation work.
- **Troubleshooting notes:** None.

## Chunk: Signup Page Auth Split Layout + Template Structure

- **Goal:** Align signup page UI to template register layout (two-column, headline, Google sign-up, divider, form, footer link).
- **Changes made:**
  - Refactored signup to use `AuthSplitLayout` (same as login, forgot-password).
  - Added headline "Welcome to NewChums" + subtitle "Your place to find your people".
  - Added Google sign-up button wired to `signIn("google")` with `?next` redirect support.
  - Added "or sign up with" divider.
  - Replaced AppTextField with AuthField for Name, Email address, Password (consistent with login).
  - Added AuthFooterLink: "Already have an account? Sign In" → /login.
  - Preserved existing signup logic (API call, validation, redirect to login on success).
- **Env vars / secrets added or changed:** None.
- **Deploy notes:** Web only (Cloudflare Pages).
- **Verification steps:** Open `http://localhost:3000/signup`; confirm two-column layout, Google button, form submit, and "Sign In" link work; test email/password signup flow.
- **Troubleshooting notes:** None.
