**Last Updated:** February 17, 2026

Absolutely — here’s the **full system mapping regenerated** in a **VS Code Mermaid-extension-friendly** format:

- **No `\n` line breaks**
- Uses **`<br/>`** for multi-line labels
- Uses **quoted labels** (`["..."]`) for maximum parser compatibility
- Keeps your **big picture**, **core flows**, **background jobs**, and **local dev** maps

---

## 1) Big-picture production architecture

```mermaid
flowchart TB
  U["Users<br/>(Web browser)"] --> CF["Cloudflare Edge<br/>(DNS + CDN + SSL)"]
  CF --> P["Cloudflare Pages<br/>(Next.js Frontend)"]

  P -->|"HTTPS API calls"| W["Cloudflare Workers<br/>(Hono API)"]

  W -->|"SQL (Postgres)"| DB["Neon<br/>(PostgreSQL + PostGIS)"]
  W -->|"Object storage"| R2["Cloudflare R2<br/>(Profile images)"]
  W -->|"Background jobs"| Q["Cloudflare Queues + Cron Triggers"]

  P -->|"Auth flows"| AUTH["Auth.js<br/>(Session + Providers)"]
  AUTH -->|"Email verify/reset"| PM["Postmark<br/>(Transactional email)"]
  W -->|"Send emails"| PM

  P -->|"Places + Maps"| GM["Google Maps APIs<br/>(Places Autocomplete, Maps)"]
  W -->|"Server-side calls (optional)"| GM

  P -->|"Frontend errors"| SENTRY_FE["Sentry<br/>(Frontend)"]
  W -->|"API errors"| SENTRY_BE["Sentry<br/>(Backend)"]
  W -->|"Logs"| AX["Axiom<br/>(Logs)"]
  P -->|"Analytics"| PLAUS["Plausible<br/>(Analytics)"]
```
### Deployment pipeline

1. Developer commits and pushes to **GitHub** (`main`).
2. **Cloudflare Pages** pulls the repo and runs the Next.js build (Cloudflare adapter).
3. Pages publishes the frontend to:
   - `newchums.pages.dev` (auto)
   - `newchums.com` and `www.newchums.com` (custom domains)
4. The frontend calls the API at `NEXT_PUBLIC_API_BASE_URL` (currently `https://newchums-api.robsmith775.workers.dev`).
5. The Workers API is deployed separately via **Wrangler** (`npx wrangler deploy`) and serves both API routes and background triggers.
6. Observability:
   - Frontend errors → Sentry (web project)
   - API errors → Sentry (api project)
   - API logs → Axiom dataset (`newchums-api`)
   - Pageview analytics → Plausible (`newchums.com`)

**Cloudflare Pages note:** because Pages runs server-side Next.js routes on the **Edge runtime**, any non-static route (App Router pages and API route handlers) should export:

`export const runtime = "edge";`

---

## 2) Core user flows (sequence diagrams)

### 2A) Browse & view events

```mermaid
sequenceDiagram
  participant User as User (Browser)
  participant Pages as Cloudflare Pages (Next.js)
  participant API as Workers API (Hono)
  participant DB as Neon (Postgres/PostGIS)

  User->>Pages: Open newchums.com
  Pages->>API: GET /events?near=...&interests=...
  API->>DB: Geo query (PostGIS) + filters
  DB-->>API: Events list
  API-->>Pages: JSON events
  Pages-->>User: Render event cards
```

### 2B) Create event (with Places Autocomplete)

```mermaid
sequenceDiagram
  participant User as User (Browser)
  participant Pages as Cloudflare Pages (Next.js)
  participant Google as Google Places API
  participant API as Workers API (Hono)
  participant DB as Neon (Postgres/PostGIS)

  User->>Pages: Fill "Create Event" form
  Pages->>Google: Places autocomplete query
  Google-->>Pages: place_id + address + lat/lng
  Pages->>API: POST /events (title, time, seats, place_id, lat/lng)
  API->>DB: INSERT event + join tables (interests/tags)
  DB-->>API: event_id
  API-->>Pages: 201 Created + event payload
  Pages-->>User: Show event detail page
```

### 2C) RSVP flow

```mermaid
sequenceDiagram
  participant User as User (Browser)
  participant Pages as Cloudflare Pages (Next.js)
  participant API as Workers API (Hono)
  participant DB as Neon (Postgres/PostGIS)
  participant Email as Postmark

  User->>Pages: Click RSVP
  Pages->>API: POST /events/{id}/rsvps
  API->>DB: INSERT/UPDATE RSVP status
  API->>Email: Send RSVP confirmation email
  Email-->>User: RSVP confirmation received
  API-->>Pages: RSVP success
  Pages-->>User: UI shows RSVP state
```

---

## 3) Background jobs (24h confirm + waitlist + seat release)

```mermaid
flowchart LR
  CRON["Cron Trigger<br/>(Runs on schedule)"] --> JOB["Workers Job Handler<br/>(Hono route or handler)"]

  JOB -->|"Find upcoming events"| DB["Neon<br/>(Postgres/PostGIS)"]

  DB -->|"Unconfirmed RSVPs"| JOB
  JOB -->|"Send confirmation requests"| PM["Postmark<br/>(Email)"]

  DB -->|"Expired confirmations"| JOB
  JOB -->|"Release seats"| DB

  JOB -->|"Promote from waitlist"| DB
  JOB -->|"Notify promoted users"| PM
```

---

## 4) Authentication map (high-level)

```mermaid
flowchart TB
  User["User<br/>(Browser)"] --> Pages["Next.js Frontend<br/>(Cloudflare Pages)"]

  Pages -->|"Sign in / Sign up"| AuthUI["Auth screens<br/>(/login, /signup)"]
  AuthUI -->|"POST /api/auth/[...nextauth]"| NextAuthRoute["NextAuth Route Handler<br/>(Auth.js in Next.js)"]

  NextAuthRoute -->|"Credentials validate"| DB["Neon<br/>(users, password_reset_tokens)"]
  NextAuthRoute -->|"Google OAuth"| Google["Google OAuth"]

  NextAuthRoute -->|"Create session cookie"| Pages

  Pages -->|"Password reset request/confirm"| ResetAPI["Custom reset routes<br/>(/api/auth/password-reset/*)"]
  ResetAPI --> DB
```

**Chunk 9 note:** In production-mode (`npm run build` + `npm run start`) the reset endpoint returns a generic success response and does not expose a reset URL.
Email delivery will be implemented in the Email chunk (Postmark).

---

## 5) Local development architecture (your laptop)


**Chunk 10 note:** Local API DB access is via `wrangler dev --local` reading `DATABASE_URL` from `api/.dev.vars`; deployed uses `wrangler secret put DATABASE_URL`. Dev-only CRUD routes live under `/dev/*`.

```mermaid
flowchart TB
  Browser["Browser"] --> WebLocal["Local Next.js Dev Server (Turbopack)<br/>localhost:3000"]
  WebLocal -->|"API calls"| ApiLocal["Wrangler Dev (Workers)<br/>localhost:8787"]

  ApiLocal -->|"DB connection"| NeonDev["Neon (Dev)<br/>(Remote Postgres)"]
  ApiLocal -->|"Object storage"| R2Dev["Cloudflare R2 (Dev)<br/>(Remote)"]
  ApiLocal -->|"Emails"| PMDev["Postmark (Dev)<br/>(Remote)"]
  WebLocal -->|"Places/Maps"| GoogleDev["Google APIs<br/>(Remote)"]

  ApiLocal -->|"Logs"| AxiomDev["Axiom<br/>(Remote)"]
  WebLocal -->|"Frontend errors"| SentryDevFE["Sentry FE<br/>(Remote)"]
  ApiLocal -->|"API errors"| SentryDevBE["Sentry BE<br/>(Remote)"]
```

---

## 6) One-sentence mental model

**Pages serves the UI, UI calls Workers (API), Workers read/write Neon, store files in R2, and Cron/Queues run background workflows that send emails via Postmark; analytics/logs/errors go to Plausible/Axiom/Sentry.**

## 7) Single Consolidated Model

```mermaid
flowchart TB
%% =========================
%% Clients + Edge + Frontend
%% =========================
U["Users<br/>(Web browser)"] --> CF["Cloudflare Edge<br/>(DNS + CDN + SSL)"]
CF --> P["Cloudflare Pages<br/>(Next.js Frontend)"]

%% =========================
%% API Layer
%% =========================
P -->|"HTTPS API calls"| W["Cloudflare Workers<br/>(Hono API)"]

%% =========================
%% Data + Storage
%% =========================
W -->|"SQL (Postgres)"| DB["Neon<br/>(PostgreSQL + PostGIS)"]
W -->|"Object storage"| R2["Cloudflare R2<br/>(Profile images)"]

%% =========================
%% Auth + Email
%% =========================
P -->|"Sign in / session"| AUTH["Auth.js<br/>(Session + Providers)"]
W -->|"Verify session / token"| AUTH

AUTH -->|"Email verify / reset"| PM["Postmark<br/>(Transactional email)"]
W -->|"Send transactional emails"| PM

%% =========================
%% Maps / Places
%% =========================
P -->|"Places autocomplete / maps"| GM["Google Maps APIs<br/>(Places, Maps)"]
W -->|"Server-side calls (optional)"| GM

%% =========================
%% Background Jobs
%% =========================
CRON["Cron Triggers<br/>(Scheduled jobs)"] --> JOB["Workers Job Handler<br/>(Background workflows)"]
QUEUE["Queues<br/>(Async tasks)"] --> JOB

JOB -->|"Find upcoming events<br/>unconfirmed RSVPs"| DB
JOB -->|"Release seats<br/>promote waitlist"| DB
JOB -->|"Send reminders<br/>confirm links<br/>digests"| PM

%% =========================
%% Observability
%% =========================
P -->|"Frontend errors"| SENTRY_FE["Sentry<br/>(Frontend)"]
W -->|"API errors"| SENTRY_BE["Sentry<br/>(Backend)"]
W -->|"Logs"| AX["Axiom<br/>(Logs)"]
P -->|"Analytics"| PLAUS["Plausible<br/>(Analytics)"]
```

---

## Chunk 14 Addendum: UI Shell + Design System

- Frontend now has a stable **App Shell** and **route-grouped structure**:
  - `/(public)` for unauthenticated routes
  - `/(app)` for authenticated routes
- Navigation is driven by a shared config (`nav.ts`) so desktop + mobile stay in sync.
- `/ui` is an authenticated UI demo route used to validate theme tokens and internal UI primitives quickly.
- Cloudflare Pages deploys Next.js routes on the Edge runtime; keep runtime expectations aligned with Pages adapter behavior.


---

## Chunk 15 Addendum: Profile Core (Interests + Location + Email Prefs)

### New data model (Neon / Postgres + PostGIS)

- `newchums.interests` (catalog)
- `newchums.user_interests` (junction)
- `newchums.user_profile` (home_city, home_lat, home_lng, home_location geography point, travel_radius_km, email prefs)

### Profile settings flow

```mermaid
sequenceDiagram
  participant User as User (Browser)
  participant Pages as Cloudflare Pages (Next.js)
  participant DB as Neon (Postgres/PostGIS)

  User->>Pages: Open /profile or /settings
  Pages->>Pages: GET /api/interests
  Pages->>DB: SELECT interests ORDER BY category, sort_order, name
  DB-->>Pages: Interest catalog
  Pages-->>User: Render profile form

  User->>Pages: Save profile settings
  Pages->>Pages: PUT /api/profile (city, lat/lng, radius, email prefs, interests)
  Pages->>DB: UPSERT user_profile + replace user_interests (transaction)
  DB-->>Pages: OK
  Pages-->>User: Success + settings persist on refresh
```

### Production auth/env dependencies (Pages)

Auth.js on Cloudflare Pages requires these env vars set in **Pages → Settings → Variables and Secrets**:

- `AUTH_SECRET` (Secret)
- `GOOGLE_CLIENT_ID` (Secret)
- `GOOGLE_CLIENT_SECRET` (Secret)

