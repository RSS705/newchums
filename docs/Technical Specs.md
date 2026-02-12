# NewChums Technical Specification

## Overview

This document defines the complete technology stack, architecture, design system, development workflow, and feature roadmap for NewChums. It serves as the authoritative reference for all technical decisions.

**Last Updated:** February 12, 2026
**Version:** 1.7

---

## Mission Context

NewChums is an event-first platform designed to help people meet others through shared activities, not profiles or chat. The core action is: **attend, be notified of, and create a small, public event around a shared interest.**

Phase 1 validates this through a controlled board-game pilot at a local game store.

---

## Technology Stack

### Core Application

| Layer | Technology | Purpose |
|-------|------------|---------|
| Frontend | Next.js | React framework hosted on Cloudflare Pages |
| API | Hono | Lightweight API framework on Cloudflare Workers |
| Database | Neon (PostgreSQL + PostGIS) | Serverless database with geospatial queries |
| File Storage | Cloudflare R2 | Profile image storage |

### UI & Styling

| Layer | Technology | Purpose |
|-------|------------|---------|
| Component Library | MUI (Material UI) v7 (current) | Pre-built React components |
| Styling System | Emotion (CSS-in-JS) | MUI's default styling engine |
| Icons | MUI Icons | Consistent icon set |
| Fonts | Next.js `next/font` (Geist default; Roboto optional) | Typography |

### Services

| Purpose | Technology | Notes |
|---------|------------|-------|
| Authentication | Auth.js | Credentials (Neon users table) + Google OAuth; sessions via NextAuth route handlers|
| Email | Postmark | Transactional emails, notifications, chat digests |
| Maps | Google Maps API | Event locations, place autocomplete |
| Error Tracking | Sentry | Production error monitoring |
| Logging | Axiom | Debugging and pattern analysis |
| Analytics | Plausible | Privacy-focused usage metrics |
| DNS & CDN | Cloudflare | SSL, caching, DDoS protection |
| Web Hosting | Cloudflare Pages | Next.js frontend; auto-deploy from GitHub |
| API Hosting | Cloudflare Workers | Hono API; deployed via Wrangler |

### Development Tools

| Purpose | Technology |
|---------|------------|
| Code Editor | VS Code + Claude AI extension |
| Version Control | GitHub |
| Local API Testing | Wrangler CLI |
| Local Frontend | Next.js dev server (Turbopack) |
| Code Quality | TypeScript, ESLint, Prettier |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         USERS                               │
│                    (Web Browser)                            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      CLOUDFLARE                             │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  DNS + CDN + SSL                                    │   │
│  │  (newchums.com pointed from Namecheap)              │   │
│  └─────────────────────────────────────────────────────┘   │
│                            │                                │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Cloudflare Pages                                   │   │
│  │  (Next.js Frontend)                                 │   │
│  └─────────────────────────────────────────────────────┘   │
│                            │                                │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Cloudflare Workers                                 │   │
│  │  (Hono API)                                         │   │
│  └─────────────────────────────────────────────────────┘   │
│                            │                                │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Cloudflare R2                                      │   │
│  │  (Profile Images)                                   │   │
│  └─────────────────────────────────────────────────────┘   │
│                            │                                │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Cloudflare Queues + Cron Triggers                  │   │
│  │  (Background Jobs: reminders, digest emails)        │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                         NEON                                │
│              PostgreSQL + PostGIS Extension                 │
│                   (Production Database)                     │
└─────────────────────────────────────────────────────────────┘


                     EXTERNAL SERVICES

   ┌──────────────────────────────────────────────────────────┐
   │                                                          │
   │  ┌─────────┐ ┌──────────┐ ┌──────────┐ ┌─────────┐      │
   │  │ Auth.js │ │ Postmark │ │  Google  │ │ Sentry  │      │
   │  │         │ │          │ │  Maps    │ │         │      │
   │  │  Auth   │ │  Email   │ │   API    │ │ Errors  │      │
   │  └─────────┘ └──────────┘ └──────────┘ └─────────┘      │
   │                                                          │
   │  ┌──────────┐ ┌───────────┐                             │
   │  │  Axiom   │ │ Plausible │                             │
   │  │          │ │           │                             │
   │  │   Logs   │ │ Analytics │                             │
   │  └──────────┘ └───────────┘                             │
   │                                                          │
   └──────────────────────────────────────────────────────────┘
```

## Authentication (Chunk 9)

Phase 1 authentication is implemented directly in the Next.js App Router using Auth.js (v5).

- **Google OAuth:** Auth.js Google provider (OAuth client configured in Google Cloud Console).
- **Email/password:** Auth.js Credentials provider backed by Neon (`users.password_hash`).
- **Signup:** `POST /api/auth/signup` creates a user row and stores a bcrypt hash.
- **Password reset:** `POST /api/auth/password-reset/request` and `POST /api/auth/password-reset/confirm` using `password_reset_tokens`.
- **Verification approach:** We verify auth in both dev and production-mode locally:
  - `npm run dev` (fast iteration)
  - `npm run build` + `npm run start` (production build + prerender checks)

Implementation notes:
- Pages using `useSearchParams()` are wrapped in `<Suspense>` by splitting them into a server `page.tsx` wrapper and a client component.
- Reset links are returned only in development mode; production mode returns a generic success response until Postmark is added.

---

## Database Integration (Chunk 10)

Chunk 10 connects the **Cloudflare Workers API (Hono)** to **Neon Postgres (PostGIS)** and adds a small set of **dev-only** endpoints to prove end-to-end CRUD.

### Implementation summary

- **Neon driver:** `@neondatabase/serverless` is used from the Workers runtime.
- **Env var:** `DATABASE_URL` is read from Workers env (`env.DATABASE_URL`).
  - **Local dev:** stored in `api/.dev.vars` so `wrangler dev --local` picks it up.
  - **Deployed:** stored via `wrangler secret put DATABASE_URL` (never committed to git).
- **Health endpoints (DB):**
  - `GET /db/ping` returns the DB server timestamp (`SELECT NOW()`).
  - `GET /db/postgis` runs a simple geo distance query using PostGIS (meters between two points) to verify PostGIS works.
- **Dev-only CRUD proof (Users):**
  - `POST /dev/users` (requires `email`, optional `name`) inserts a row and returns it.
  - `GET /dev/users/:id` reads the row.
  - `PATCH /dev/users/:id` updates allowed fields (e.g., `name`).
  - `DELETE /dev/users/:id` deletes the row.

### Verification checklist (what “done” means)

- `curl http://127.0.0.1:8787/db/ping` → `200` with `{ ok: true, now: ... }`
- `curl http://127.0.0.1:8787/db/postgis` → `200` with `{ ok: true, meters: ... }`
- Full CRUD via API:
  - create → read → update → verify in Neon SQL editor → delete → confirm 0 rows

---

## Email Setup (Chunk 11)

Chunk 11 adds **transactional email delivery** via Postmark and wires it into the API so the app can reliably send user-facing emails.

### Implementation summary

- **Provider:** Postmark (transactional).
- **Domain authentication:** DKIM + Return-Path configured in DNS for `ourmodule.com` to improve deliverability and speed Postmark approval.
- **Templates:** Postmark templates are created for:
  - Email verification
  - Password reset
  - RSVP confirmation
- **API integration:** The Workers API sends template-based emails via Postmark.
  - Local testing uses `wrangler dev --local`
  - Production uses the deployed Worker URL

### Cloudflare Workers configuration

- **Secret (not committed):**
  - `POSTMARK_SERVER_TOKEN` stored in Cloudflare via `wrangler secret put POSTMARK_SERVER_TOKEN`
- **Environment variables (safe to keep in `wrangler.toml`):**
  - `EMAIL_FROM` (example: `NewChums <no-reply@ourmodule.com>`)
  - `WEB_BASE_URL` (local: `http://localhost:3000`, prod: `https://newchums.com`)
  - `POSTMARK_TEMPLATE_VERIFY` / `POSTMARK_TEMPLATE_RESET` / `POSTMARK_TEMPLATE_RSVP` (template IDs)

### API endpoints used for verification

During setup, we verified Postmark delivery using simple API routes:

- `POST /email/verification`
- `POST /email/password-reset`
- `POST /email/rsvp-confirmation`

Each route triggers a Postmark template send and returns `{ ok: true }` on success.

### Verification checklist (what “done” means)

- Local:
  - `POST /email/*` routes succeed in Wrangler dev and Postmark Activity shows the message.
- Production:
  - API deployed to Workers and test emails sent via the deployed Worker URL.
  - Email arrives in the destination inbox and is not routed to spam (also checked Postmark Activity).
- Note:
  - While Postmark accounts are pending approval, Postmark may restrict recipient domains to match the From domain.



---

## Error Tracking & Logging (Chunk 12)

Chunk 12 adds **production-grade observability** so you can see what users are experiencing (Sentry), what the API is doing (Axiom logs), and basic traffic analytics (Plausible).

### Sentry (Frontend: Cloudflare Pages + Next.js)

- **Install/config:** Sentry Next.js SDK added via the Sentry wizard in `web/`.
- **DSN:** `NEXT_PUBLIC_SENTRY_DSN` is stored in Cloudflare Pages **Secrets/Variables** (and can exist locally in `web/.env.local`).
- **Test page:** `/sentry-test` provides a “Trigger Error” button for local/non-prod validation and returns `404` in production.
- **Build note:** Source maps/releases require a Sentry auth token for the build step. If not set, Sentry still captures errors, but source map upload/release creation is skipped.

### Sentry (API: Cloudflare Workers + Hono)

- **Worker DSN:** `SENTRY_DSN` is stored as a Worker secret.
- **Test endpoint:** `GET /__sentry-test` intentionally throws a server error so you can confirm it appears in the Sentry **Issues** dashboard.
- **Prod safety:** `GET /__sentry-test` and `GET /__log-test` require `x-internal-token` in production (`APP_ENV=production`), and return `404` when the token is missing/invalid.

### Axiom (API Logging)

- **Dataset:** `newchums-api` dataset created in Axiom.
- **Token:** An Axiom ingest token is generated and stored as `AXIOM_TOKEN` (secret).
- **Routing:** The API sends structured logs to Axiom with a request id, path, status, and duration.
- **Test endpoint:** `GET /__log-test` writes a test log event and returns `{ ok: true }`.

### Health Endpoints (API)

- `GET /health` returns `{ ok: true, service: "api", ts }` and does not query the database.
- `GET /health/db` performs a `SELECT 1` check and is guarded in production with the same internal token behavior as test endpoints.

### Plausible (Frontend Analytics)

- **Site:** `newchums.com` site created in Plausible.
- **Domain env:** `NEXT_PUBLIC_PLAUSIBLE_DOMAIN=newchums.com` is set in Cloudflare Pages variables and used by the layout script loader.
- **Verification:** Use Plausible “Verify installation” and the browser Network tab to confirm:
  - script loads (`plausible.js`)
  - events post (`/api/event`)


## Setup Cleanup (Chunk 13)

Chunk 13 focused on production hygiene and reducing accidental exposure.

- Web `/sentry-test` is gated to return `404` in production.
- API internal routes (`/__sentry-test`, `/__log-test`, `/health/db`) are gated in production using `APP_ENV=production` plus an internal header `x-internal-token` that must match the Worker secret `INTERNAL_TEST_TOKEN`.
- Added `GET /health` (no DB) and `GET /health/db` (DB ping + latency).
- Added `scripts/check-env.mjs` to validate required local env keys exist without printing values.
- `.gitattributes` enforces LF for markdown/docs for stable diffs.

### Cloudflare Pages compatibility notes (Next.js on Pages)

- Pages builds need **DATABASE_URL** present during build if any server-side code imports the DB client while Next collects data.
- Pages requires non-static routes to run on **Edge runtime**. App Router pages and route handlers used by auth/protected pages should export:

`export const runtime = "edge";`

---

## Design System

### Overview

NewChums uses MUI (Material UI) as its component library with a custom theme. The visual direction is **minimal, clean, modern, and warm**—an app that feels inviting and alive, not corporate or sterile.

### Color Palette (Placeholder — Refine Before Pilot)

These colors establish a warm, friendly, vibrant feel. They can be adjusted as you build and see them in context.

```javascript
// theme.js - MUI Theme Configuration

const palette = {
  primary: {
    main: '#FF6B35',      // Warm coral orange - energetic, friendly
    light: '#FF8F66',
    dark: '#E55A2B',
    contrastText: '#FFFFFF',
  },
  secondary: {
    main: '#2EC4B6',      // Teal - fresh, modern, trustworthy
    light: '#5DD4C8',
    dark: '#25A99D',
    contrastText: '#FFFFFF',
  },
  error: {
    main: '#E63946',      // Clear red for errors
  },
  warning: {
    main: '#F4A261',      // Warm amber
  },
  success: {
    main: '#2A9D8F',      // Green-teal for confirmations
  },
  background: {
    default: '#FAFAFA',   // Very light warm gray
    paper: '#FFFFFF',
  },
  text: {
    primary: '#1A1A2E',   // Near-black with slight warmth
    secondary: '#4A4A68', // Muted for secondary text
  },
  divider: '#E8E8E8',
};
```

**Color Usage Guidelines:**
- **Primary (Coral):** CTAs, primary buttons, key interactive elements, active states
- **Secondary (Teal):** Secondary actions, links, accents, success states
- **Background:** Keep clean and light; let content breathe
- **Text:** High contrast for readability; use secondary for less important text

### Typography

NewChums uses Next.js `next/font` (Geist) by default for a clean, modern baseline.
MUI typography can either inherit the app font (recommended) or explicitly set Roboto if you prefer a more classic MUI look.

```javascript
const typography = {
  fontFamily: 'var(--font-geist-sans), "Roboto", "Helvetica", "Arial", sans-serif',
  
  h1: {
    fontSize: '2.5rem',
    fontWeight: 700,
    lineHeight: 1.2,
  },
  h2: {
    fontSize: '2rem',
    fontWeight: 600,
    lineHeight: 1.3,
  },
  h3: {
    fontSize: '1.5rem',
    fontWeight: 600,
    lineHeight: 1.4,
  },
  h4: {
    fontSize: '1.25rem',
    fontWeight: 600,
    lineHeight: 1.4,
  },
  body1: {
    fontSize: '1rem',
    lineHeight: 1.6,
  },
  body2: {
    fontSize: '0.875rem',
    lineHeight: 1.5,
  },
  button: {
    textTransform: 'none',  // Avoid ALL CAPS buttons
    fontWeight: 600,
  },
};
```

**Typography Guidelines:**
- Headings: Bold and clear, create hierarchy
- Body: Comfortable reading size with generous line height
- Buttons: Sentence case (not ALL CAPS) for friendlier feel

### Component Customization

Chunk 8 establishes a baseline theme (palette + typography + a few key overrides).
As you build real screens (events, RSVP, profile), you’ll refine component variants and spacing to match the NewChums brand.

MUI components will be customized to feel warmer and more modern:

```javascript
const components = {
  MuiButton: {
    styleOverrides: {
      root: {
        borderRadius: 8,           // Slightly rounded corners
        padding: '10px 24px',
        boxShadow: 'none',         // Flat by default
        '&:hover': {
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        },
      },
      contained: {
        '&:hover': {
          transform: 'translateY(-1px)',  // Subtle lift on hover
        },
      },
    },
  },
  MuiCard: {
    styleOverrides: {
      root: {
        borderRadius: 12,
        boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
      },
    },
  },
  MuiTextField: {
    defaultProps: {
      variant: 'outlined',
    },
    styleOverrides: {
      root: {
        '& .MuiOutlinedInput-root': {
          borderRadius: 8,
        },
      },
    },
  },
  MuiChip: {
    styleOverrides: {
      root: {
        borderRadius: 8,
      },
    },
  },
};
```

### Spacing System

MUI uses an 8px grid by default. Stick to this for consistency:

| Spacing | Value | Use Case |
|---------|-------|----------|
| 1 | 8px | Tight spacing (icon to text) |
| 2 | 16px | Default padding, gaps between related items |
| 3 | 24px | Section padding |
| 4 | 32px | Large gaps, card margins |
| 5 | 40px | Section separators |
| 6 | 48px | Major layout divisions |

### Core MUI Components Used

| Component | Use Case |
|-----------|----------|
| `Button` | Primary actions, CTAs |
| `TextField` | All form inputs |
| `Card` | Event cards, profile sections |
| `Chip` | Interest tags, status badges |
| `Avatar` | User profile images |
| `Dialog` | Confirmations, RSVP flow |
| `Snackbar` | Toast notifications |
| `AppBar` | Top navigation |
| `BottomNavigation` | Mobile navigation |
| `List` | Event attendees, chat messages |
| `Tabs` | Upcoming/Past events toggle |
| `CircularProgress` | Loading states |
| `Skeleton` | Content loading placeholders |

### Iconography

Use MUI Icons consistently. Key icons for NewChums:

| Icon | Use |
|------|-----|
| `Event` | Events, calendar |
| `People` | Attendees, community |
| `Place` | Location |
| `AccessTime` | Time, duration |
| `Chat` | Event chat |
| `Notifications` | Alerts |
| `Person` | Profile |
| `Add` | Create event |
| `Check` | Confirmed, success |
| `Star` | Favorites, ratings |
| `Settings` | User settings |

---

## Screen Layouts (Wireframe Descriptions)

### 1. Landing Page (Logged Out)

**Purpose:** Explain NewChums, drive signups

```
┌─────────────────────────────────────────────────────────────┐
│  [Logo]                              [Log In]  [Sign Up]    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│     HERO SECTION                                            │
│     ─────────────                                           │
│     Headline: "Find your people. Do things together."       │
│     Subhead: Brief explanation of event-first connection    │
│     [Primary CTA: "Browse Events"]  [Secondary: "Sign Up"]  │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│     HOW IT WORKS (3 steps, icons + short text)              │
│     1. Find an event near you                               │
│     2. RSVP and confirm attendance                          │
│     3. Show up and meet your new chums                      │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│     SAMPLE EVENTS (3-4 cards, real or example events)       │
│     [Event Card] [Event Card] [Event Card]                  │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│     FINAL CTA                                               │
│     "Ready to meet your chums?"                             │
│     [Sign Up Free]                                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 2. Home Page (Logged In)

**Purpose:** Show relevant events, encourage action

```
┌─────────────────────────────────────────────────────────────┐
│  [Logo]              [Search]           [Profile Avatar]    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│     WELCOME BACK, [Name]                                    │
│     "12 people near you share your interests"               │
│     (Tier 2 feature - displays interest-based counts)       │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│     YOUR UPCOMING EVENTS (if any)                           │
│     [Event Card - "Board Game Night - Confirmed"]           │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│     [Tabs: Upcoming | Past]                                 │
│                                                             │
│     EVENTS NEAR YOU                                         │
│     [Event Card]                                            │
│     [Event Card]                                            │
│     [Event Card]                                            │
│     [Load More]                                             │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│     [Floating Action Button: + Create Event]                │
│                                                             │
└─────────────────────────────────────────────────────────────┘

MOBILE: Bottom navigation with Home | Events | Create | Chat | Profile
```

### 3. Event Card Component

**Purpose:** Scannable summary of an event

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  [Interest Chip: "Board Games"]           [Distance: 2.3km] │
│                                                             │
│  EVENT TITLE                                                │
│  Board Game Night - Catan & More                            │
│                                                             │
│  📍 The Game Store, Main Street                             │
│  📅 Saturday, Feb 15 · 7:00 PM                              │
│  👥 4/6 seats filled                                        │
│                                                             │
│  [Host Avatar] Hosted by Alex                               │
│                                                             │
│  [Chip: Beginner Friendly]                                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 4. Event Detail Page

**Purpose:** Full event info, RSVP action

```
┌─────────────────────────────────────────────────────────────┐
│  [← Back]                                    [Share Icon]   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [Interest Chip: "Board Games"]                             │
│                                                             │
│  EVENT TITLE                                                │
│  Board Game Night - Catan & More                            │
│                                                             │
│  [Host Avatar] Hosted by Alex                               │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  DETAILS                                                    │
│  ─────────                                                  │
│  📍 The Game Store                                          │
│     123 Main Street, Toronto                                │
│     [View on Map]                                           │
│                                                             │
│  📅 Saturday, February 15, 2026                             │
│  🕖 7:00 PM - 10:00 PM (3 hours)                            │
│                                                             │
│  👥 4 of 6 seats filled                                     │
│     [Avatar][Avatar][Avatar][Avatar] + 2 open               │
│                                                             │
│  🎯 Skill Level: Beginner Friendly                          │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ABOUT THIS EVENT                                           │
│  ─────────────────                                          │
│  "Join us for a relaxed evening of board games! We'll       │
│  start with Catan and see where the night takes us.         │
│  All experience levels welcome. Just bring yourself!"       │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ATTENDEES (4)                                              │
│  ─────────────                                              │
│  [Avatar] Alex (Host)                                       │
│  [Avatar] Jordan                                            │
│  [Avatar] Sam                                               │
│  [Avatar] Riley                                             │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  EVENT CHAT                                                 │
│  ──────────                                                 │
│  [Message preview: "Looking forward to it! Should I..."]    │
│  [View All Messages →]                                      │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              [RSVP - Reserve Your Seat]             │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  "You'll need to confirm 24 hours before the event"         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 5. Create Event Page

**Purpose:** Simple form to create a new event

```
┌─────────────────────────────────────────────────────────────┐
│  [← Cancel]                              Create Event       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  EVENT DETAILS                                              │
│  ─────────────                                              │
│                                                             │
│  Event Title *                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Board Game Night - Catan & More                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  What's this event about? *                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Join us for a relaxed evening of board games...     │   │
│  │                                                     │   │
│  │                                                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Interest Category *                                        │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Board Games                                    ▼    │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  WHEN & WHERE                                               │
│  ────────────                                               │
│                                                             │
│  Date *                          Time *                     │
│  ┌──────────────────────┐       ┌──────────────────────┐   │
│  │ Feb 15, 2026    📅   │       │ 7:00 PM         ▼    │   │
│  └──────────────────────┘       └──────────────────────┘   │
│                                                             │
│  Duration                                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 3 hours                                        ▼    │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Location *                                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 🔍 Search for a place...                            │   │
│  └─────────────────────────────────────────────────────┘   │
│  (Google Places autocomplete)                               │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ATTENDANCE                                                 │
│  ──────────                                                 │
│                                                             │
│  Number of seats *                                          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 6                                              ▼    │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Skill level                                                │
│  ○ All levels  ○ Beginner  ○ Intermediate  ○ Advanced      │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              [Create Event]                         │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 6. User Profile Page

**Purpose:** User settings, interests, history

```
┌─────────────────────────────────────────────────────────────┐
│  [← Back]                                    [Settings ⚙️]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│              [Large Avatar]                                 │
│              [Edit Avatar]                                  │
│                                                             │
│              JORDAN SMITH                                   │
│              Joined January 2026                            │
│                                                             │
│              [Chip: Early Adopter 🌟]                       │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  STATS                                                      │
│  ─────                                                      │
│  Events Attended: 3                                         │
│  Events Hosted: 1                                           │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  MY INTERESTS                                    [Edit]     │
│  ────────────                                               │
│  [Chip: Board Games] [Chip: D&D] [Chip: Video Games]       │
│  [Chip: Hiking] [+ Add More]                                │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  LOCATION SETTINGS                               [Edit]     │
│  ─────────────────                                          │
│  📍 Toronto, ON                                             │
│  🚗 Willing to travel: 25 km                                │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  NOTIFICATION PREFERENCES                        [Edit]     │
│  ────────────────────────                                   │
│  ✓ Email me about new events matching my interests          │
│  ✓ Email me chat digests for my events                      │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [Log Out]                                                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 7. Event Chat Page

**Purpose:** Communication between event attendees

```
┌─────────────────────────────────────────────────────────────┐
│  [← Back to Event]                     Board Game Night     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ [Avatar] Alex (Host)                    2 hours ago │   │
│  │ Hey everyone! Looking forward to Saturday. I'll     │   │
│  │ bring Catan and Ticket to Ride. Any requests?       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ [Avatar] Jordan                         1 hour ago  │   │
│  │ Awesome! Could we try Wingspan if you have it?      │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ [Avatar] Sam                           30 mins ago  │   │
│  │ I've never played Catan but excited to learn!       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ [Avatar] Alex (Host)                    15 mins ago │   │
│  │ @Sam No worries, it's easy to pick up! I'll teach.  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│                                                             │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Type a message...                          [Send]   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 8. Sign Up / Log In Pages

**Purpose:** Account creation and authentication

```
SIGN UP:
┌─────────────────────────────────────────────────────────────┐
│                         [Logo]                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│              Create your account                            │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ [G] Continue with Google                            │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ─────────────────── or ───────────────────                 │
│                                                             │
│  Name                                                       │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                                                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Email                                                      │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                                                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Password                                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                                                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              [Create Account]                       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Already have an account? [Log in]                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘

LOG IN:
┌─────────────────────────────────────────────────────────────┐
│                         [Logo]                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│              Welcome back                                   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ [G] Continue with Google                            │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ─────────────────── or ───────────────────                 │
│                                                             │
│  Email                                                      │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                                                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Password                                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                                                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  [Forgot password?]                                         │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              [Log In]                               │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Don't have an account? [Sign up]                           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Cloudflare Pages Build Configuration

- **Root directory:** `web`
- **Framework preset:** `Next.js` (not the HTML export preset)
- **Build command:** `npx @cloudflare/next-on-pages@1`
- **Build output directory:** `/vercel/output/static`
- **Compatibility flags:** `nodejs_compat` enabled for **Production** and **Preview**.
- **Frontend env vars (Pages):**
  - `NEXT_PUBLIC_API_BASE_URL` = `https://newchums-api.robsmith775.workers.dev`

---

## Domain Configuration

- Domain is managed in **Cloudflare DNS**.
- The **Cloudflare Pages** project has both custom domains attached:
  - `newchums.com` (apex)
  - `www.newchums.com`
- **SSL** is enabled for both.
- Current behavior: `newchums.com` resolves to the site and can redirect to `www.newchums.com` (preferred canonical).

---

## Phase 1 Feature Tiers (90 Days)

### Tier 1: Must Have (Weeks 5-6)
*Without these, the pilot cannot happen.*

**Authentication & Profile**
- [ ] User signup with email/password
- [ ] Google OAuth login
- [ ] User profile page
- [ ] Save interests to profile
- [ ] Set travel distance preference

**Events - Viewing**
- [ ] Home page with upcoming events
- [ ] Home page with past events
- [ ] Single event detail page
- [ ] Filter/browse by location

**Events - Creation**
- [ ] Create public event form
- [ ] Google Places autocomplete for location
- [ ] Set date, time, duration
- [ ] Set seat limit
- [ ] Set event description and expectations
- [ ] Specify skill level / beginner friendliness

**Events - Joining**
- [ ] RSVP to reserve seat
- [ ] Waitlist when seats full
- [ ] 24-hour confirmation requirement
- [ ] Auto-release unconfirmed seats to waitlist
- [ ] Cancel RSVP

**Notifications (Email via Postmark)**
- [ ] Email verification on signup
- [ ] Password reset
- [ ] RSVP confirmation
- [ ] 24-hour reminder to confirm attendance
- [ ] Seat released / waitlist promotion notice

**Infrastructure**
- [ ] Error tracking (Sentry)
- [ ] Logging (Axiom)
- [ ] Analytics (Plausible)

---

### Tier 2: Should Have (Week 7, before pilot)
*These make the pilot experience significantly better.*

**Event Chat**
- [ ] Event-specific chat visible to all attendees
- [ ] Post messages to event chat
- [ ] View message history
- [ ] Email digest notification for new messages (e.g., "3 new messages in your upcoming event")
- [ ] Profile setting to disable chat digest emails

**Discovery**
- [ ] "X people near you share this interest" count on home page
- [ ] Display counts per interest category

**Notifications**
- [ ] Email notification when new event matches user interests + location

---

### Tier 3: Nice to Have (Weeks 9-10, after first pilot)
*Add these only if Tier 1-2 are solid and time permits.*

**Private Events**
- [ ] Create private event (not publicly listed)
- [ ] Invite specific users by email or username
- [ ] Invited users receive email notification

**Profile Enhancement**
- [ ] Select avatar from preset list
- [ ] Upload custom profile image (Cloudflare R2)

**Basic Gamification**
- [ ] "Early Adopter" badge for first 100 users
- [ ] Display "Events Attended" count on profile
- [ ] Display "Events Hosted" count on profile

---

### Tier 4: Post-Pilot / Phase 2
*Only after Phase 1 is complete and validated.*

**Feedback System (Phase 2 Priority)**
- [ ] Post-event feedback prompt
- [ ] Simple satisfaction rating (thumbs up/down on event)
- [ ] Optional structured feedback (see Feedback System Design below)
- [ ] Behavioral trait aggregation
- [ ] Compatibility-based notification filtering

**Advanced Gamification**
- [ ] "Highly Rated Host" badge
- [ ] "Number of Chums" count
- [ ] Achievement system

**Additional Features**
- [ ] Calendar integration
- [ ] Birthday reminders
- [ ] Friends list
- [ ] "Science of friendship" educational content
- [ ] Apple login

---

## Feedback System Design (Phase 2)

### Data Collection Strategy

To ensure early feedback data remains useful when the full system is built, Phase 1 collects structured data from the start.

**Phase 1 Collection (Simple):**
```
event_feedback table:
- id
- user_id (who gave feedback)
- event_id
- overall_rating (1-5 or thumbs up/down)
- would_attend_again (boolean)
- optional_comment (text, max 500 chars)
- created_at
```

**Phase 2 Collection (Detailed):**
```
attendee_feedback table:
- id
- feedback_giver_id
- feedback_receiver_id
- event_id
- trait_id (foreign key to traits table)
- rating (positive / neutral / negative)
- created_at

traits table:
- id
- name (e.g., "punctuality", "friendliness", "communication")
- description
- category
```

**Migration Path:**
- Phase 1 text comments are preserved for reference
- Phase 2 adds structured trait ratings
- Aggregation logic computes trait scores from `attendee_feedback`
- Notification filtering uses aggregated scores
- Text comments remain visible to admins for context and edge cases

**UX Principles for Feedback:**
- Always optional, never required
- Framed as "help improve your future matches" not "rate this person"
- No public visibility of individual ratings
- Aggregate scores influence matching, not punish users
- Clear path to improve negative patterns (not permanent marks)

---

## Database Schema (Phase 1)

### Core Tables

```sql
-- Users (current implementation)
-- Note: this is the schema currently present in Neon for Chunk 9/10 auth + CRUD verification.
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  password_hash TEXT, -- null if OAuth only
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Users (planned Phase 1 expansion)
-- These columns are expected to be added as profile features are implemented (avatar, preferences, notifications).
-- Keep them out of the DB until the corresponding UI + API behavior exists.
-- ALTER TABLE users ADD COLUMN avatar_preset VARCHAR(50);
-- ALTER TABLE users ADD COLUMN avatar_url VARCHAR(500);
-- ALTER TABLE users ADD COLUMN travel_distance_km INTEGER DEFAULT 25;
-- ALTER TABLE users ADD COLUMN email_chat_digest BOOLEAN DEFAULT true;
-- ALTER TABLE users ADD COLUMN email_new_events BOOLEAN DEFAULT true;
-- ALTER TABLE users ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
-- User locations (PostGIS)
CREATE TABLE user_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  location GEOGRAPHY(POINT, 4326) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Interests
CREATE TABLE interests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100), -- e.g., "Board Games", "Sports", "Music"
  created_at TIMESTAMP DEFAULT NOW()
);

-- User interests (junction)
CREATE TABLE user_interests (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  interest_id UUID REFERENCES interests(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, interest_id)
);

-- Events
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  location_name VARCHAR(255) NOT NULL,
  location_address VARCHAR(500),
  location_place_id VARCHAR(255), -- Google Places ID
  location GEOGRAPHY(POINT, 4326) NOT NULL,
  starts_at TIMESTAMP NOT NULL,
  duration_minutes INTEGER DEFAULT 120,
  seat_limit INTEGER NOT NULL,
  skill_level VARCHAR(50), -- "beginner", "intermediate", "advanced", "all"
  is_private BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Event interests (junction)
CREATE TABLE event_interests (
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  interest_id UUID REFERENCES interests(id) ON DELETE CASCADE,
  PRIMARY KEY (event_id, interest_id)
);

-- RSVPs
CREATE TABLE rsvps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL, -- "pending", "confirmed", "waitlisted", "cancelled"
  confirmed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(event_id, user_id)
);

-- Event invitations (for private events)
CREATE TABLE event_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  invited_email VARCHAR(255) NOT NULL,
  invited_user_id UUID REFERENCES users(id), -- null if not yet registered
  status VARCHAR(20) DEFAULT 'pending', -- "pending", "accepted", "declined"
  created_at TIMESTAMP DEFAULT NOW()
);

-- Event chat messages
CREATE TABLE event_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Event feedback (Phase 1 - simple)
CREATE TABLE event_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  overall_rating INTEGER CHECK (overall_rating >= 1 AND overall_rating <= 5),
  would_attend_again BOOLEAN,
  comment TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(event_id, user_id)
);

-- Gamification (Phase 1 - simple)
CREATE TABLE user_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  badge_type VARCHAR(50) NOT NULL, -- "early_adopter", "first_event_hosted", etc.
  awarded_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, badge_type)
);

-- PostGIS indexes for geospatial queries
CREATE INDEX idx_events_location ON events USING GIST (location);
CREATE INDEX idx_user_locations_location ON user_locations USING GIST (location);
```

### Example Geospatial Queries

```sql
-- Find events within 25km of a user
SELECT e.* FROM events e
WHERE ST_DWithin(
  e.location,
  ST_MakePoint(-79.3832, 43.6532)::geography, -- user's location
  25000 -- meters
)
AND e.starts_at > NOW()
ORDER BY e.starts_at;

-- Count users near me with shared interests
SELECT COUNT(DISTINCT ui.user_id) 
FROM user_interests ui
JOIN user_locations ul ON ui.user_id = ul.user_id
WHERE ui.interest_id IN (
  SELECT interest_id FROM user_interests WHERE user_id = 'current_user_id'
)
AND ST_DWithin(
  ul.location,
  ST_MakePoint(-79.3832, 43.6532)::geography,
  25000
)
AND ui.user_id != 'current_user_id';
```

---

## Development Workflow

### One-Time Setup

1. **Install Node.js**
   - Download from nodejs.org (LTS version)
   - Includes npm package manager

2. **Install VS Code Extensions**
   - Claude AI (optional)
   - ESLint
   - Prettier

3. **Install Wrangler CLI (for Workers / API)**
   ```bash
   npm install -g wrangler
   ```

4. **Clone Repository**
   ```bash
   git clone https://github.com/[your-username]/newchums.git
   cd newchums
   ```

5. **Install dependencies (monorepo)**
   ```bash
   cd web
   npm install
   cd ../api
   npm install
   ```

6. **Configure Environment Variables**
   - Create `web/.env.local` (Next.js)
   - Add API keys for: Neon, Postmark, Google Maps, Sentry, Auth.js secrets


### MUI + Emotion + Next.js App Router SSR

When using MUI (Emotion) with the Next.js App Router, you must ensure server‑rendered styles are inserted consistently so hydration matches.
In Chunk 8 we added an App Router–compatible Emotion cache integration (in the theme/provider layer) to eliminate hydration mismatches.

### Daily Workflow

```
┌─────────────────────────────────────────────────────────────┐
│                    DEVELOPMENT                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Open VS Code                                            │
│                                                             │
│  2. Start local servers:                                    │
│     Terminal 1: cd web && npm run dev        (Next.js on :3000)       │
│     Terminal 2: cd api && npx wrangler dev   (Hono API on :8787)      │
│                                                             │
│  3. Write code, test in browser at localhost:3000           │
│                                                             │
│  4. Repeat until feature complete                           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    DEPLOYMENT                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  5. Commit and push to GitHub:                              │
│     git add .                                               │
│     git commit -m "Description of changes"                  │
│     git push                                                │
│                                                             │
│  6. Deploy API (manual):                                    │
│     npx wrangler deploy                                     │
│                                                             │
│  7. Frontend auto-deploys via Cloudflare Pages              │
│     (triggered by GitHub push)                              │
│     - Root directory: /web                                  │
│     - Framework preset: Next.js (Cloudflare)                │
│     - Build command: npx @cloudflare/next-on-pages@1         │
│     - Output dir: /vercel/output/static                      │
│     - Compatibility flag: nodejs_compat (Prod + Preview)     │
│                                                             │
│  8. Verify at newchums.com                                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Build Schedule (Phase 1)

### Days 1-30: Definition & Scoping
*(Per your Phase 1 plan - no code yet)*

- Week 1: Problem & user clarity
- Week 2: MVP scope lock
- Week 3: Pilot experience design
- Week 4: Technical planning & pilot readiness

### Days 31-60: MVP Build

**Week 5: Environment & Foundations**
- [ ] GitHub repo setup
- [ ] Cloudflare Pages + Workers configuration
- [ ] Neon database provisioned with PostGIS
- [ ] Auth.js integration (email + Google)
- [ ] MUI theme configuration (colors, typography, components)
- [ ] Basic project structure
- [ ] Deploy working shell to newchums.com

**Week 6: Tier 1 Features (Core MVP)**
- [ ] User signup/login flow
- [ ] Profile page with interests and travel distance
- [ ] Create event form with Google Places
- [ ] Event listing page (upcoming/past)
- [ ] Event detail page
- [ ] RSVP flow (reserve → confirm → attend)
- [ ] Waitlist logic
- [ ] 24-hour confirmation emails
- [ ] Mobile-responsive design

**Week 7: Tier 2 Features (Before Pilot)**
- [ ] Event chat system
- [ ] Chat digest email (Cloudflare Cron + Postmark)
- [ ] "People near you" interest counts
- [ ] New event notification emails
- [ ] Profile email preferences

### Days 61-90: Pilot & Validation

**Week 8: First Pilot Event**
- Run board game event at store
- Observe behavior and friction
- Document issues

**Week 9: Iteration**
- Fix top 2 friction points
- Improve event copy and flow
- Begin Tier 3 if time permits:
  - [ ] Private events
  - [ ] Avatar selection
  - [ ] Profile image upload

**Week 10: Second Pilot**
- Run second event
- Compare metrics
- Continue Tier 3 if time permits:
  - [ ] Basic gamification badges

**Week 11: Review**
- Document learnings
- Identify validated/invalidated assumptions

**Week 12: Phase 2 Planning**
- Write retrospective
- Plan next 90 days
- Brief recovery

---

## Service Accounts Required

| Service | URL | Free Tier | Phase 1 Cost Estimate |
|---------|-----|-----------|----------------------|
| Cloudflare | cloudflare.com | Yes | $0 |
| Neon | neon.tech | Yes (generous) | $0 |
| Auth.js | authjs.dev | Open source | $0 |
| Google Cloud | console.cloud.google.com | $200/month credit | $0 |
| Postmark | postmarkapp.com | 100 free, then $15/mo | $15/month |
| Sentry | sentry.io | 5K errors/month | $0 |
| Axiom | axiom.co | 500GB/month | $0 |
| Plausible | plausible.io | No free tier | $9/month |
| GitHub | github.com | Yes | $0 |

**Estimated Monthly Cost (Phase 1):** $24/month

---

## Key Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Own backend vs BaaS | Own (Hono + Neon) | Long-term control, no platform lock-in |
| Component library | MUI (Material UI) | Rich components, vibrant theming, polished feel |
| Styling approach | Emotion (CSS-in-JS) | MUI's native styling system, no conflicts |
| Auth approach | Auth.js | Simplest path to email + Google login |
| Email provider | Postmark | 15-year track record, reliability |
| Geospatial | PostGIS | Keeps queries in database, no extra service |
| Hosting | Cloudflare | Edge performance, integrated ecosystem |
| Dev environment | Production only (initially) | No users to affect, simplicity |
| CI/CD | Skip initially | Manual deploy acceptable for solo builder |
| Mobile | Deferred | Web proves concept first |
| Event chat | Email digest, not real-time | Avoids notification fatigue |
| Feedback system | Structured from start | Data remains useful when full system built |

---

## Risk Mitigations

| Risk | Mitigation |
|------|------------|
| Neon goes down | Data exportable as standard PostgreSQL |
| Postmark pricing changes | Commodity service, easy to switch to Resend/SendGrid |
| Cloudflare issues | Workers code portable to other runtimes |
| Google Maps cost | Monitor usage, Mapbox as alternative |
| Auth.js limitations | Standard OAuth, can migrate to custom |
| Feature creep | Tier system enforces priority; cut Tier 3 if behind |
| Pilot failure | Phase 1 checkpoints catch problems early |
| MUI "Material" feel too strong | Custom theme reduces this; consider migration if needed |

---

## Phase 2 Preview (Not Built in Phase 1)

| Feature | Technology | Trigger |
|---------|------------|---------|
| Behavioral feedback system | Custom (see design above) | After Phase 1 validates core |
| Apple login | Auth.js + Apple Provider | When users request it |
| Automated reminders | Cloudflare Queues + Cron | Already in Phase 1 for chat digest |
| CI/CD pipeline | GitHub Actions | When deployment safety matters |
| Dev environment | Neon branching | When real users exist |
| Paid subscriptions | Stripe | When monetization phase begins |
| Event images | Cloudflare R2 expansion | When organizers request it |
| Friends list | Custom | Phase 2+ |
| Calendar integration | Google Calendar API | Phase 2+ |
| Mobile app | React Native + Expo | If/when mobile necessary |

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | February 5, 2026 | Initial specification |
| 1.1 | February 5, 2026 | Added feature tiers, event chat, gamification, feedback system design, database schema, build schedule |
| 1.2 | February 5, 2026 | Added Design System (MUI, color palette, typography, components), screen wireframes, replaced Tailwind/shadcn with MUI/Emotion |
| 1.3 | February 9, 2026 | Updated docs to reflect Next.js scaffold + current local workflow (removed Vite references) |
| 1.4 | February 10, 2026 | Completed Chunk 8 (MUI theme + Next.js App Router SSR style integration); clarified font strategy (Geist default) |
| 1.5 | February 10, 2026 | Completed Chunk 9 (Auth.js credentials + Google OAuth + signup/login pages + password reset); added production-mode build verification notes |
| 1.6 | February 11, 2026 | Completed Chunk 11 (Postmark transactional email: verification, password reset, RSVP confirmation); added Workers email configuration + verification notes |
| 1.7 | February 12, 2026 | Chunk 13 cleanup: production gating for internal test routes, API health endpoint contract, and env consistency checks |

---

## Checkpoints Reference

Per your Phase 1 plan, evaluate progress at these points:

- **Checkpoint A (End of Week 2):** Can you explain the MVP in one sentence?
- **Checkpoint B (End of Week 4):** Is the plan buildable and grounded?
- **Checkpoint C (End of Week 6):** Can a stranger complete the core flow?
- **Checkpoint D (After First Pilot):** Did real people show up?
- **Checkpoint E (After Second Pilot):** Is this repeatable?
- **Checkpoint F (End of Phase 1):** Go / Adjust / Pause decision

---

*This document is the authoritative technical reference for NewChums Phase 1.*
