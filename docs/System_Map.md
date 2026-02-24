# System Map

Last Updated: February 24, 2026

This document reflects the current production reality of NewChums.

Production Workers:
- Web Worker: newchums-web-dev (production despite suffix)
- API Worker: newchums-api
- Single production environment
- Domain binding to newchums.com pending

---

# 1) Big‑Picture Production Architecture

```mermaid
flowchart TB
  U["Users<br/>(Web Browser)"] --> CF["Cloudflare Edge<br/>(DNS + CDN + SSL)"]
  CF --> W["Web Worker<br/>(Next.js via OpenNext)<br/>newchums-web-dev"]

  W -->|"HTTPS API calls"| API["API Worker<br/>(Hono)<br/>newchums-api"]

  API -->|"SQL (Postgres)"| DB["Neon<br/>(PostgreSQL)"]

  W -->|"Auth flows"| AUTH["Auth.js<br/>(JWT Sessions)"]
  AUTH -->|"OAuth"| GOOGLE["Google OAuth"]
  AUTH -->|"Email verify/reset"| PM["Postmark<br/>(Transactional Email)"]
  API -->|"Send transactional emails"| PM

  W -->|"Frontend errors"| SENTRY_FE["Sentry<br/>(Frontend)"]
  API -->|"API errors"| SENTRY_BE["Sentry<br/>(Backend)"]
  API -->|"Logs"| AX["Axiom<br/>(Logs)"]
  W -->|"Analytics"| PLAUS["Plausible<br/>(Analytics)"]
```

---

# 2) Core User Flows

## Browse Events

```mermaid
sequenceDiagram
  participant User
  participant Web
  participant API
  participant DB

  User->>Web: Open site
  Web->>API: GET /events
  API->>DB: Query events
  DB-->>API: Rows
  API-->>Web: JSON
  Web-->>User: Render UI
```

## Create Event

```mermaid
sequenceDiagram
  participant User
  participant Web
  participant API
  participant DB

  User->>Web: Submit form
  Web->>API: POST /events
  API->>DB: INSERT
  DB-->>API: Success
  API-->>Web: 201 Created
  Web-->>User: Show event page
```

## RSVP

```mermaid
sequenceDiagram
  participant User
  participant Web
  participant API
  participant DB
  participant Email

  User->>Web: Click RSVP
  Web->>API: POST /events/{id}/rsvp
  API->>DB: INSERT/UPDATE RSVP
  API->>Email: Send confirmation
  API-->>Web: Success
  Web-->>User: UI update
```

---

# 3) Local Development Model

```mermaid
flowchart TB
  Browser["Browser"] --> WebLocal["Next.js Dev Server<br/>localhost:3000"]
  WebLocal --> ApiLocal["Wrangler Dev<br/>localhost:8787"]
  ApiLocal --> Neon["Neon (Remote DB)"]
  ApiLocal --> Postmark["Postmark (Dev)"]
  WebLocal --> Google["Google APIs"]
  WebLocal --> SentryFE["Sentry FE"]
  ApiLocal --> SentryBE["Sentry BE"]
```

---

# 4) Architectural Commitments

- Two-worker model is intentional and long-term.
- Business logic belongs in API Worker.
- Web Worker focuses on UI and auth orchestration.
- Some legacy API logic exists in Web Worker (technical debt).
- R2 and background jobs (Cron/Queues) are planned but not yet implemented.
- Single production environment currently active.

---

# 5) Single Consolidated System Model

```mermaid
flowchart TB
  U["Users<br/>(Browser)"] --> CF["Cloudflare Edge"]
  CF --> W["Web Worker<br/>(Next.js via OpenNext)"]

  W -->|"API calls"| API["API Worker<br/>(Hono)"]

  API -->|"SQL"| DB["Neon<br/>(Postgres)"]

  W --> AUTH["Auth.js"]
  AUTH --> GOOGLE["Google OAuth"]
  AUTH --> PM["Postmark"]

  API --> PM

  W --> SENTRY_FE["Sentry FE"]
  API --> SENTRY_BE["Sentry BE"]
  API --> AX["Axiom Logs"]
  W --> PLAUS["Plausible"]

  CRON["Future Cron/Queues"] --> API
  R2["Future R2 Storage"] -.-> API
```
