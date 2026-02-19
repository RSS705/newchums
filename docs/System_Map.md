# System Map

**Last Updated:** February 19, 2026

User → Cloudflare Pages → Auth.js → Worker API → Neon DB

Frontend: LandingLayout (owns gutters) ├─ LandingHeader ├─ LandingHero
└─ LandingFooter

Backend: Hono API (Workers) Neon PostgreSQL (PostGIS)

Layout alignment confirmed and stabilized.
