# System Map

**Last Updated:** February 20, 2026

## Flow

User → Next.js (Pages) → Auth.js → API Route → Neon PostgreSQL

## Identity Model

users table: - id - email - password_hash - username (display) -
username_norm (unique)

## OAuth Flow

Google login → create user (no username) → onboarding gate → set
username

## Email Signup Flow

Signup form → `/api/auth/signup` → insert user with username +
username_norm
