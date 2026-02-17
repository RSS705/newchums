# NewChums Development Environment Setup

## Overview

## Current State (Mental Model)

- Web (`web/`) deploys automatically to Cloudflare Pages when changes are pushed to `main`.
- Pages Preview deployments are branch/PR builds; they run automatically for non-`main` pushes and use the Preview env-var set (separate from Production).
- API (`api/`) does not auto-deploy from git; it deploys only when you run `npx wrangler deploy`.
- Workers secrets/vars are managed separately from Pages vars, and may differ by Worker environment (`production`, `preview`, etc.).
- `APP_ENV` is used by the API to distinguish production vs non-prod behavior (notably internal test-route access).
- Cloudflare Pages Functions/Workers have a bundle size limit; Next.js + OpenNext can exceed the Free plan (3 MiB gzipped), requiring a Workers Paid plan (10 MiB) for production deploys.
- Next.js dev indicators (the floating “N” overlay) are framework-provided and can be disabled via `next.config.ts` if they overlap app UI.

**Last Updated:**

**Last Updated:** February 16, 2026

This guide walks through setting up your development environment in sequential chunks. Complete each chunk before moving to the next. Each chunk should take 30-60 minutes.

NewChums — Chunk Checklist (overview only)

[ ] Chunk 1: Local Development Tools — Install/verify Node.js, Git, VS Code + extensions so you can run node, npm, and git locally.

[ ] Chunk 2: Project Setup & Local Integration — Install/run web/ (Next.js) and install api/ (Hono); verify local dev servers and env loading.

[ ] Chunk 3: Domain & DNS — Move newchums.com DNS authority to Cloudflare (nameservers) and confirm Cloudflare shows the domain as Active.

[ ] Chunk 4: Database Setup — Create Neon Postgres (newchums), enable PostGIS, capture the connection string, and verify you can run a simple query.

[ ] Chunk 5: Project Scaffolding — Establish the “real” app structure (Next.js + dependencies + lint/format + env files) and verify the app boots locally.

[ ] Chunk 6: Cloudflare Workers Setup — Configure and deploy the API (Hono/Workers) with Wrangler; verify the deployed endpoint responds.

[ ] Chunk 7: Cloudflare Pages Setup — Connect GitHub repo to Pages for auto-deploys and map the custom domain; verify pushes deploy to newchums.com.

[ ] Chunk 8: MUI Theme Configuration — Implement the NewChums theme (palette/typography/overrides) and confirm components render with the expected styling.

[ ] Chunk 9: Authentication Setup — Implement Auth.js sign-up/login/logout (email + Google) and validate the full auth flow end-to-end.

[ ] Chunk 10: Database Integration — Connect API ↔ database, create schema, confirm CRUD works, and verify a basic PostGIS geo query.

[ ] Chunk 11: Email Setup — Configure Postmark + templates (verification/reset/RSVP) and confirm emails deliver properly.

[ ] Chunk 12: Error Tracking & Logging — Add Sentry (web + api), Axiom logging, and Plausible analytics; confirm events/errors/logs show up in dashboards.

[ ] Chunk 13: Setup Cleanup Checklist - Gate internal test routes in production, add API health checks, validate env coverage, and normalize line endings.

**Prerequisite:** You have a computer with admin access (Mac, Windows, or Linux).

---

## Chunk 1: Local Development Tools

**Goal:** Install the software you need to write and run code locally.

- [ ] Install Node.js (LTS version) from nodejs.org
- [ ] Verify installation: `node --version` and `npm --version`
- [ ] Install VS Code from code.visualstudio.com
- [ ] Install VS Code extensions:
  - Claude AI
  - ESLint
  - Prettier
  - TypeScript (if not built-in)
- [ ] Install Git from git-scm.com (if not already installed)
- [ ] Configure Git with your name and email

**Done when:** You can run `node`, `npm`, and `git` commands in your terminal.

Absolutely — here’s **Chunk 1 rewritten cleanly as a step-by-step setup guide**, in the same plain, readable style as your map legend.
This is written so you can **hand it to Future-You** on a totally fresh laptop and just follow it top to bottom.

---

# Chunk 1 — Local Development Tools Setup

**Goal:** Install and verify the core tools needed to write and run code locally.

---

## Step 1: Install Node.js (LTS)

**What this gives you:**
The JavaScript runtime and package manager used by the project.

1. Go to **[https://nodejs.org](https://nodejs.org)**
2. Download **LTS** (not “Current”)
3. Run the installer
   - Accept all defaults
   - Make sure **“Add to PATH”** is checked

4. Close and reopen your terminal

### Verify

Open a terminal and run:

```bash
node --version
npm --version
```

You should see version numbers for both.

---

## Step 2: Install Git

**What this gives you:**
Version control for tracking and managing code changes.

1. Go to **[https://git-scm.com](https://git-scm.com)**
2. Download and run the installer
3. Accept defaults (Git Bash optional but useful)
4. Close and reopen your terminal

### Verify

```bash
git --version
```

---

## Step 3: Configure Git Identity

**What this does:**
Sets your name and email so commits are correctly attributed.

```bash
git config --global user.name "Your Name"
git config --global user.email "your@email.com"
```

Verify:

```bash
git config --global --list
```

You should see `user.name` and `user.email`.

---

## Step 4: Install Visual Studio Code

**What this gives you:**
Your main code editor and development environment.

1. Go to **[https://code.visualstudio.com](https://code.visualstudio.com)**
2. Download and install VS Code
3. Accept defaults

Optional verification:

```bash
code --version
```

(If `code` isn’t recognized, VS Code still works — this can be fixed later.)

---

## Step 5: Install VS Code Extensions

**What this does:**
Adds formatting, linting, and developer assistance inside the editor.

1. Open VS Code
2. Press **Ctrl + Shift + X** (Extensions)
3. Install:
   - **ESLint** (Microsoft)
   - **Prettier – Code formatter** (Prettier)

Notes:

- **TypeScript** support is built into VS Code — no install needed.
- AI extensions (Claude, Cursor, etc.) are optional and project-specific.

---

## Step 6: Configure Formatting (Recommended)

**What this does:**
Keeps code automatically formatted and clean.

1. Open VS Code Settings (`Ctrl + ,`)
2. Set:
   - **Editor: Default Formatter** → `Prettier - Code formatter`
   - **Editor: Format On Save** → On

(Optional but helpful)
Enable ESLint fixes on save by adding this to settings JSON:

```json
{
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  }
}
```

---

## Step 7: Final Sanity Check

Run these in your terminal:

```bash
node --version
npm --version
git --version
```

If all return versions, **Chunk 1 is complete**.

---

## Chunk 1 — Done When

- Node.js (LTS) installed and working
- npm available
- Git installed and configured
- VS Code installed
- ESLint + Prettier installed and active

---

## Chunk 2: Project Setup & Local Integration

**Goal:** Confirm the repo and both projects (`web/` and `api/`) are installed locally and can run in development mode.

**Assumptions:**

- Chunk 1 is complete (Node, npm, Git, VS Code)
- You are using Windows **Command Prompt (cmd)** (PowerShell is fine too, but commands below are cmd-friendly)
- Repo root is cloned locally (example path: `C:\Users\Rober\OneDrive\Documents\NewChums`)

---

### Target folder structure

```
NewChums/
├─ web/        (frontend: Next.js + TypeScript + MUI)
├─ api/        (backend: Hono API intended for Cloudflare Workers)
├─ .gitignore
└─ README.md
```

---

### Step 1: Verify you are in the repo root

```bat
cd C:\Users\Rober\OneDrive\Documents\NewChums
git status
```

You should see `On branch main` and no critical errors.

---

### Step 2: Install + run the frontend (Next.js)

```bat
cd web
npm install
npm run dev
```

Verify in browser:

- http://localhost:3000

Stop the dev server:

- `Ctrl + C`

---

### Step 3: Install API dependencies (Hono)

```bat
cd ..\api
npm install
npm ls hono
```

You should see `hono@...` listed.

---

### Step 4: Optional local API run (if Wrangler is already set up)

If you have Wrangler configured (Chunk 6), you can run the API locally:

```bat
npx wrangler dev
```

Expected local URL is typically:

- http://localhost:8787

(Exact behavior depends on your `wrangler.toml` and entry file, which is covered in Chunk 6.)

---

### Step 5: Env file sanity check (frontend)

In `web/`, ensure you have:

- `.env.local` (NOT committed to git)

You can confirm Next sees it by starting the dev server; it will list `.env.local` under “Environments”.

---

### Chunk 2 — Done When

- `web/` starts with `npm run dev` and loads at http://localhost:3000
- `api/` dependencies install cleanly and `npm ls hono` shows Hono installed
- (Optional) If Wrangler is configured: `npx wrangler dev` runs locally without errors

---

## Chunk 3: Domain & DNS

**Goal:** Point your domain to Cloudflare.

- [ ] Add newchums.com as a site in Cloudflare
- [ ] Copy the two Cloudflare nameservers provided
- [ ] Log into Namecheap → Domain List → Manage → Nameservers
- [ ] Change to "Custom DNS" and enter Cloudflare nameservers
- [ ] Wait for propagation (check status in Cloudflare dashboard)
- [ ] Verify domain is active in Cloudflare

**Done when:** Cloudflare shows your domain as "Active."

### Chunk 3: Domain & DNS (newchums.com → Cloudflare)

- Logged into **Cloudflare** and started domain setup using **Onboard a domain**.
- Added **newchums.com** to Cloudflare and selected the **Free** plan.
- Ran Cloudflare’s **DNS quick scan** and reviewed the imported DNS records (including the default Namecheap parking + email forwarding records).
- Reached Cloudflare’s “Update your nameservers” step and copied the two assigned Cloudflare nameservers:
  - `paityn.ns.cloudflare.com`
  - `quentin.ns.cloudflare.com`

- Logged into **Namecheap → Domain List → Manage → Nameservers**, switched to **Custom DNS**, and replaced the old Namecheap nameservers (`dns1/2.registrar-servers.com`) with the two Cloudflare nameservers above.
- Confirmed Cloudflare began checking nameservers, then verified in the Cloudflare dashboard that **newchums.com status = Active** (meaning Cloudflare is now authoritative for DNS).
- Note going forward: **all DNS record changes should now be made in Cloudflare**, not Namecheap.

---

## Chunk 4: Database Setup

**Goal:** Create and configure your PostgreSQL database.

- [ ] Create a new project in Neon
- [ ] Create a database named `newchums`
- [ ] Enable the PostGIS extension
- [ ] Note your database connection string
- [ ] Test connection using Neon's SQL editor or a local client

**Done when:** You can connect to your database and run a simple query.

## Chunk 4: Database Setup (Neon + Postgres + PostGIS)

1. Logged into Neon and created a new project named **NewChums**.
2. Used the default Neon database **neondb** (Neon UI did not expose a separate “Databases” management option).
3. Opened **SQL Editor** in Neon (branch: `production`, database: `neondb`).
4. Created a dedicated schema for the app:
   - Ran `CREATE SCHEMA IF NOT EXISTS newchums;`

5. Made the schema the default location for future tables by updating the role search path:
   - Confirmed role/db with `SELECT current_user, session_user, current_database();` → `neondb_owner / neondb`
   - Set default search path: `ALTER ROLE neondb_owner SET search_path = newchums, public;`
   - Verified with `SHOW search_path;` → `newchums, public`

6. Enabled PostGIS:
   - Ran `CREATE EXTENSION IF NOT EXISTS postgis;`
   - Verified with `SELECT PostGIS_Version();` (returned version info successfully)

7. Tested the database connection in Neon’s SQL Editor:
   - Ran `SELECT NOW();` and confirmed it returned a timestamp (successful query execution).

8. Located the project connection string via the **Connect** button (noting Neon provides **pooled** vs **direct** connection types; the pooled host includes `-pooler`).

---

## Chunk 5: Project Scaffolding

**Goal:** Create the basic project structure locally.

- [ ] Clone your empty GitHub repo locally
- [ ] Initialize Next.js project
- [ ] Install core dependencies:
  - MUI (@mui/material, @emotion/react, @emotion/styled)
  - Auth.js
  - Hono (for API)
- [ ] Create basic folder structure
- [ ] Set up TypeScript configuration
- [ ] Set up ESLint and Prettier configuration
- [ ] Create `.env.local` file (add to .gitignore)
- [ ] Add placeholder environment variables

**Done when:** You can run `npm run dev` and see a default Next.js page at localhost:3000.

## Chunk 5 Summary — Project Scaffolding (What we did)

- Cloned/opened the NewChums GitHub repository locally and confirmed it was clean and up to date using `git status`.
- Verified the repo structure includes separate top-level folders for `web/` (frontend) and `api/` (backend).
- Initialized the `web/` frontend as a **Next.js** project with TypeScript enabled, and confirmed it runs locally.
- Installed the core frontend dependencies in `web/`:
  - MUI (`@mui/material`)
  - Emotion (`@emotion/react`, `@emotion/styled`)
  - MUI Icons (`@mui/icons-material`)
  - Auth.js for Next.js (`next-auth@beta`)

- Confirmed the installed frontend dependencies using `npm ls` to ensure versions were correctly present in `web/`.
- Set up formatting tooling in `web/`:
  - Ensured Prettier config files existed (`.prettierrc`, `.prettierignore`)
  - Confirmed Prettier-related packages were installed as needed

- Created a `web/.env.local` file and added placeholder environment variables for Auth, OAuth, database, email, and maps.
- Updated `web/.gitignore` to ensure `.env.local` is not committed to Git.
- Installed the core API dependency in `api/`:
  - Hono (`hono`)

- Verified Hono installation in `api/` using `npm ls hono`.
- Ran the local development server in `web/` with `npm run dev` and confirmed the app loads successfully at **[http://localhost:3000](http://localhost:3000)** (with `.env.local` detected).
- Updated project documentation to reflect the current stack and workflow:
  - Development Setup Guide (new dated version)
  - Technical Specs (new dated version)
  - System Map (new dated version)

Note, during this step, we actually removed Vite and replaced it with Next.js, and went back to ensure our prior chunks were still correct. All documentation was updated at this time as well, being the System Map 09FEB2026, Technical Specs 09FEB2026 and Development Setup Guide 09FEB2026 markdown files.

---

## Chunk 6: Cloudflare Workers Setup

**Goal:** Configure your API to run on Cloudflare Workers.

- [ ] Install Wrangler CLI: `npm install -g wrangler`
- [ ] Authenticate Wrangler: `wrangler login`
- [ ] Create `wrangler.toml` configuration file
- [ ] Create basic Hono API entry point
- [ ] Test locally: `npx wrangler dev`
- [ ] Deploy to Cloudflare: `npx wrangler deploy`
- [ ] Verify API responds at your Workers URL

**Done when:** Your API is live on Cloudflare and responds to a test request.

## Chunk 6 recap: what we actually did

- Verified **Wrangler was installed** by checking its version.
- Ran **`wrangler login`** to authenticate your machine with Cloudflare.
- Confirmed your Worker entry-point setup:
  - `api/wrangler.toml` points to `main = "src/index.ts"`.
  - `api/src/index.ts` exists and exports a Hono app.

- Started the API locally with:
  - `npx wrangler dev --local`
  - (We used `--local` so it stays on `127.0.0.1:8787` instead of flipping into remote preview mode.)

- Verified the API responds correctly using CMD:
  - `curl http://127.0.0.1:8787/health` → `{"ok":true}`
  - `curl http://127.0.0.1:8787/` → `NewChums API is live`

- Added long-term scripts to `api/package.json` so you can run:
  - `npm run dev` (local worker dev)
  - `npm run deploy` (deploy to Cloudflare)

Wrangler is Cloudflare’s official **command-line tool** for working with **Cloudflare Workers**.

## What a CLI is

A **CLI** (Command Line Interface) is a program you run in a terminal (CMD/PowerShell) by typing commands instead of clicking buttons in a website.

Why teams use CLIs long-term:

- **Repeatable**: the same command does the same thing every time (`npm run deploy`)
- **Scriptable**: you can automate it later (CI/CD, GitHub Actions)
- **Traceable**: commands + config files (`wrangler.toml`) can live in Git so your setup is documented

Wrangler is the CLI that talks to Cloudflare on your behalf.

## What a Worker is

A **Cloudflare Worker** is Cloudflare’s “serverless” runtime: a small JavaScript/TypeScript program that Cloudflare runs for you on their network.

In our project, the Worker is your **API server**:

- It receives HTTP requests (e.g., `/health`, `/api/events`)
- Runs your Hono app code
- Returns HTTP responses (JSON/text)

Key characteristics:

- **No server to manage**: you don’t provision a VM, install nginx, or keep a Node server running
- **Runs close to users**: Cloudflare can run it at the edge (globally distributed)
- **Stateless by default**: each request should be handled independently; persistent data goes in external services (Neon Postgres, KV, D1, R2, etc.)

So when we say “deploy the API,” we really mean “deploy the Worker that contains our API.”

## What Wrangler specifically does for Workers

Wrangler is the tool that handles the whole Worker lifecycle:

- **Login / permissions**
  - `wrangler login` connects your machine to your Cloudflare account securely

- **Local development**
  - `wrangler dev --local` runs your Worker on your computer at a localhost URL
  - It simulates the Workers runtime so you can test routes quickly

- **Deployment**
  - `wrangler deploy` uploads your compiled Worker to Cloudflare
  - Cloudflare assigns it a live URL (like `*.workers.dev` or a custom domain later)

- **Configuration**
  - `wrangler.toml` defines the Worker’s name, entry file, compatibility date, flags, env vars, bindings, etc.

- **Secrets and environment variables**
  - `wrangler secret put ...` stores secrets in Cloudflare (not in your repo)
  - Useful for things like `DATABASE_URL`, auth secrets, API keys, etc.

---

## Chunk 7: Cloudflare Deployment (Web + Domain)

**Goal:** Connect your frontend to automatic deployments.

- [ ] In Cloudflare dashboard, go to Pages
- [ ] Connect your GitHub repository
- [ ] Configure build settings:
  - Build command: `npm run build`
  - Output directory: `.next` or `out` (depending on setup)
- [ ] Set environment variables in Cloudflare Pages
- [ ] Trigger first deployment
- [ ] Configure custom domain (newchums.com)

**Done when:** Pushing to GitHub automatically deploys your frontend to newchums.com.

**Goal:** Deploy the Next.js frontend to Cloudflare Pages, wire up the custom domain, and confirm automatic deploys from GitHub.

### What we did

1. **Connected Cloudflare Pages to GitHub**

- In Cloudflare: Workers & Pages → **Create application** → Pages → **Connect GitHub**.
- In GitHub: ensured the **Cloudflare Workers and Pages** GitHub App had access to the **newchums** repo (we had to switch from “All repositories” to “Only select repositories” and explicitly include `RSS705/newchums`).

2. **Created the Pages project from the repo**

- Selected repository: `RSS705/newchums`.
- Confirmed the Pages project name: `newchums`.
- Set **Production branch** to `main`.

3. **Configured build settings for Next.js (Cloudflare)**

- **Root directory:** `web`
- **Framework preset:** `Next.js` (not “Next.js (HTML export)”)
- Pages auto-set these (and we kept them):
  - **Build command:** `npx @cloudflare/next-on-pages@1`
  - **Build output directory:** `/vercel/output/static`
- Added frontend environment variable in Pages:
  - `NEXT_PUBLIC_API_BASE_URL` = `https://newchums-api.robsmith775.workers.dev`

4. **Fixed the Node.js compatibility error**

- The first deploy showed a “Node.js Compatibility Error” because `nodejs_compat` wasn’t enabled.
- In Cloudflare Pages → Project → **Settings → Compatibility flags**, enabled:
  - `nodejs_compat` for **Production**
  - `nodejs_compat` for **Preview**
- Re-deployed and confirmed the default Next.js page loaded on `newchums.pages.dev`.

5. **Connected the custom domain**

- In Cloudflare Pages → Project → **Custom domains**, added both:
  - `www.newchums.com`
  - `newchums.com`
- Waited for DNS + SSL to go green (propagation delay is normal).
- Confirmed `newchums.com` resolves successfully (and can land on `www.newchums.com` as the canonical host).

6. **Tested auto-deploy**

- Made a small change locally, then pushed to GitHub.
- Verified in Cloudflare Pages → **Deployments** that a new build triggered automatically.
- Confirmed the change appeared on the live site.

### Done when

- `https://newchums.com` and `https://www.newchums.com` both load the site.
- Cloudflare Pages shows **Automatic deployments enabled** and new commits on `main` produce a new deployment.
- `nodejs_compat` is enabled for both Production and Preview.

## Chunk 8: MUI Theme Configuration

**Goal:** Set up your custom MUI theme with NewChums colors and validate it renders correctly in Next.js.

- [ ] Create theme configuration file
- [ ] Define color palette (coral primary, teal secondary)
- [ ] Configure typography settings
- [ ] Configure component overrides (buttons, cards, inputs)
- [ ] Wrap app in ThemeProvider
- [ ] Create a test page with MUI components to verify theme

**Done when:** MUI components render with your custom colors and styling.

### Chunk 8: MUI Theme Configuration (What we did)

1. Verified the required packages were installed in `web/`:
   - `@mui/material`, `@mui/icons-material`
   - `@emotion/react`, `@emotion/styled`

2. Created the NewChums theme file:
   - `web/src/theme/theme.ts`
   - Defined the base palette (coral primary, teal secondary), background, text, and divider colors.
   - Set baseline typography and shape (border radius).
   - Added initial component overrides (Buttons, Cards, Inputs) to establish a consistent “NewChums feel.”

3. Wired the theme into the Next.js App Router:
   - Added a theme/provider wrapper (ThemeRegistry / provider layer) and wrapped `children` in `src/app/layout.tsx`.
   - Kept the existing `next/font` setup (Geist) and metadata intact.

4. Added a visual verification page:
   - Created `web/src/app/theme-test/page.tsx`
   - Rendered representative MUI components (buttons, chips, card, textfield) so theme changes are obvious.

5. Addressed the MUI + Emotion + Next.js hydration warning:
   - Initial load showed a “Hydration failed…” warning due to server/client style injection mismatch.
   - Updated the theme/provider layer to use an App Router–compatible Emotion SSR integration so server‑inserted styles match the client during hydration.

### Why this matters (long-term)

- A single theme file (`theme.ts`) becomes the source of truth for colors, typography, spacing feel, and component defaults.
- Wrapping the app at the layout level ensures every screen inherits the same design tokens and overrides.
- Fixing hydration now prevents subtle styling bugs later as the UI grows (Auth screens, event cards, forms, dialogs, etc.).

---

## Chunk 9: Authentication Setup

**Goal:** Implement user signup and login.

- [ ] Configure Auth.js with your app
- [ ] Set up email/password provider
- [ ] Set up Google OAuth provider
- [ ] Create signup page
- [ ] Create login page
- [ ] Create password reset flow
- [ ] Test authentication end-to-end

**Done when:** Users can sign up, log in, and log out using email or Google.

### Chunk 9: Authentication Setup (What we did)

1. **Confirmed required env vars exist locally (`web/.env.local`)**
   - `AUTH_SECRET` (local secret used to sign/encrypt session tokens).
   - `AUTH_URL` for local dev (`http://localhost:3000`).
   - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` for Google OAuth.
   - `DATABASE_URL` for Neon (pooled connection string).

2. **Configured Google OAuth (Google Cloud Console)**
   - Completed the OAuth consent screen “App information”.
   - Created an OAuth Client ID.
   - Added redirect URIs for Auth.js:
     - `https://www.newchums.com/api/auth/callback/google`
     - `https://newchums.com/api/auth/callback/google`
     - (Local dev redirect URI as needed)

3. **Wired Auth.js (Auth.js v5 / Next.js App Router)**
   - Implemented `src/auth.ts` using `NextAuth()`:
     - **Google provider** for OAuth sign-in.
     - **Credentials provider** (email/password) that validates against `users.password_hash`.
   - Created the App Router handler at:
     - `src/app/api/auth/[...nextauth]/route.ts` exporting `handlers` (GET/POST).

   Notes:
   - For TypeScript correctness, `authorize(credentials)` was hardened with runtime type checks so `email/password` are treated as strings before calling string methods.

4. **Implemented database-backed Credentials auth**
   - Ensured Neon schema includes a `users` table with:
     - `email` (unique), `name`, `password_hash` (nullable for OAuth-only users).
   - Added `@types/bcryptjs` so `npm run build` passes TypeScript checks.

5. **Built user-facing auth pages**
   - `src/app/signup` — calls `POST /api/auth/signup` to create a user (hashes password).
   - `src/app/login` — supports:
     - Credentials sign-in via `next-auth/react` `signIn("credentials", ...)`
     - Google sign-in via `signIn("google", ...)`
   - `src/app/me` — simple authenticated session view used for verification.
   - `src/app/protected` — demonstrates route protection/redirect.

6. **Password reset flow (database-backed)**
   - Added a `password_reset_tokens` table (token hash + expiry + used_at) and helper utilities.
   - Implemented API routes:
     - `POST /api/auth/password-reset/request` (creates token, computes reset URL)
     - `POST /api/auth/password-reset/confirm` (validates token, sets new password, marks token used)
   - `src/app/forgot-password` and `src/app/reset-password` pages complete the UI flow.

   Security note:
   - Reset request returns a generic success response (avoids account enumeration).
   - Reset URL is shown in **development only**; in production mode it does not return a reset URL (email delivery will be handled in the Email chunk).

7. **Resolved Next.js 16 production-build issues discovered during verification**
   - Updated routes using `headers()` to avoid async misuse by deriving origin from `new URL(request.url).origin`.
   - Fixed Neon `sql` typing issues by removing generics from tagged-template calls and casting results where needed.
   - Wrapped pages that use `useSearchParams()` (`/login`, `/reset-password`) in `<Suspense>` by splitting them into:
     - a server `page.tsx` wrapper
     - a client component (`LoginClient`, `ResetPasswordClient`)

8. **End-to-end verification (dev + production-mode)**
   - Dev mode: `npm run dev` in `web/` verified signup/login/logout + Google OAuth + password reset.
   - Production-mode verification:
     - `npm run build`
     - `npm run start`
   - Confirmed the same auth flows work, and that password reset does **not** expose reset URLs in production-mode output.

### Chunk 9 — Done When (Verification checklist)

- [ ] Credentials sign-up works (`/signup`) and creates a row in `users`.
- [ ] Credentials login works (`/login`) and redirects to the intended page.
- [ ] Google login works and creates/links a user.
- [ ] Logout returns user to `/login` (and protected pages redirect when logged out).
- [ ] Password reset request + confirm flow works end-to-end.
- [ ] `npm run build` succeeds, and `npm run start` can serve the app in production mode.

---

---

## Chunk 10: Database Integration

**Goal:** Connect your API to the database.

- [ ] Install PostgreSQL client library
- [ ] Configure database connection in API
- [ ] Create initial schema (run SQL from technical spec)
- [ ] Test basic CRUD operations
- [ ] Verify PostGIS is working with a simple geo query

**Done when:** Your API can read and write to the database.

### Chunk 10 recap: what we actually did

1. **Validated the API local runtime is Wrangler (not Node/Nodemon)**
   - Confirmed `api/package.json` uses `wrangler dev --local` for `npm run dev`.
   - Avoided the `index.js` / nodemon entry mismatch by running Workers locally through Wrangler.

2. **Installed and used the Neon serverless Postgres client in the API**
   - Dependency: `@neondatabase/serverless`.
   - Added a small DB helper (e.g., `src/db.ts`) that builds a Neon `sql` client from `env.DATABASE_URL`.

3. **Connected `DATABASE_URL` correctly for local development**
   - Created/used `api/.dev.vars` with:
     - `DATABASE_URL=postgresql://...`
   - Confirmed Wrangler loads it (Wrangler prints “Using vars defined in .dev.vars”).
   - Note: `api/.dev.vars` should not be committed to Git.

4. **Added DB verification routes in the API**
   - `GET /db/ping`
     - Runs `SELECT NOW()` and returns `{ ok: true, now: ... }`.
   - `GET /db/postgis`
     - Runs a simple PostGIS query (distance between two points) and returns `{ ok: true, meters: ... }`.

5. **Added DEV-only CRUD routes to prove API ↔ DB read/write**
   - Base path: `/dev/users`
   - `POST /dev/users` inserts a user row (requires `email`, optional `name`) and returns the inserted row.
   - `GET /dev/users/:id` reads back the row.
   - `PATCH /dev/users/:id` updates allowed fields (e.g., `name`) and returns the updated row.
   - `DELETE /dev/users/:id` deletes the row and returns `{ ok: true }`.

6. **Resolved schema mismatch discovered during CRUD**
   - The API initially tried to insert a non-existent column (`avatar_preset`).
   - Updated the dev CRUD SQL to match the actual Neon `users` table columns.

7. **Verified end-to-end with curl + Neon**
   - Started local API:
     - `cd api && npm run dev` (Wrangler local on `http://127.0.0.1:8787`)
   - Verified DB connectivity:
     - `curl -i http://127.0.0.1:8787/db/ping` → `200`
     - `curl -i http://127.0.0.1:8787/db/postgis` → `200`
   - Ran full CRUD:
     - POST created a user (captured returned `id`)
     - GET returned the same user
     - PATCH updated the name
     - Neon SQL editor confirmed the row update
     - DELETE removed the row
     - Neon SQL editor confirmed 0 rows

### Chunk 10 — Done When (Verification checklist)

- [ ] `npm run dev` in `api/` starts Wrangler locally on `127.0.0.1:8787`
- [ ] `GET /db/ping` returns 200 with a timestamp
- [ ] `GET /db/postgis` returns 200 with a meters value
- [ ] `POST /dev/users` creates a row (returns an `id`)
- [ ] `GET /dev/users/:id` returns the row
- [ ] `PATCH /dev/users/:id` updates the row
- [ ] Neon SQL editor confirms the row exists + updates
- [ ] `DELETE /dev/users/:id` deletes the row
- [ ] Neon SQL editor confirms the row is removed

---

## Chunk 11: Email Setup

**Goal:** Configure transactional email sending.

- [ ] Configure Postmark in your API
- [ ] Create email templates:
  - Email verification
  - Password reset
  - RSVP confirmation
- [ ] Test sending emails
- [ ] Verify emails are delivered (check spam folder too)

**Done when:** Your app can send emails that arrive in your inbox.

### Chunk 11 recap: what we actually did

1. **Created/confirmed Postmark account and server**

- Created a **Live** server in Postmark for NewChums.

2. **Authenticated the sending domain (deliverability)**

- In Postmark, started domain authentication for `ourmodule.com`.
- Added the required DNS records in Cloudflare DNS:
  - **DKIM**: TXT record for the provided `*_domainkey` hostname with the long `k=rsa; p=...` value.
  - **Return-Path**: CNAME record `pm-bounces` → `pm.mtasv.net`.
- Verified both records in Postmark (status became Active).

Note: For email DNS records, Cloudflare proxying should be **DNS only** (grey cloud), not proxied.

3. **Created Postmark templates**

- Created 3 templates and recorded their IDs:
  - Email verification
  - Password reset
  - RSVP confirmation

4. **Wired Postmark into the Workers API**

- Stored the Postmark server token as a Worker secret:
  - `npx wrangler secret put POSTMARK_SERVER_TOKEN`
- Added non-secret email config to `wrangler.toml` under `[vars]`:
  - `EMAIL_FROM` (example: `NewChums <no-reply@ourmodule.com>`)
  - `WEB_BASE_URL` (local `http://localhost:3000`, production `https://newchums.com`)
  - `POSTMARK_TEMPLATE_VERIFY`, `POSTMARK_TEMPLATE_RESET`, `POSTMARK_TEMPLATE_RSVP` (template IDs)

5. **Tested locally**

- Ran `cd api && npm run dev` (Wrangler local).
- Sent test requests with `curl` to:
  - `/email/verification`
  - `/email/password-reset`
  - `/email/rsvp-confirmation`
- Confirmed Postmark Activity shows the messages.

6. **Deployed and tested in production**

- Updated `WEB_BASE_URL` for production.
- Deployed the Worker and confirmed the production Worker URL:
  - `https://newchums-api.robsmith775.workers.dev`
- Re-ran the same 3 tests against the production URL.
- Verified each email arrived in the `@ourmodule.com` inbox and appeared as sent/delivered in Postmark Activity.

### Why this matters (for the app)

- Enables reliable **transactional email** delivery for key user flows.
- Establishes the base email plumbing needed for:
  - Account verification
  - Password reset
  - RSVP confirmations (and later: reminders, waitlist promotion notices, digests)

### Chunk 11 — Done When (Verification checklist)

- [ ] Local: posting to each `/email/*` endpoint returns `{ ok: true }` and Postmark Activity shows the send.
- [ ] Production: posting to each `/email/*` endpoint on the Workers URL returns `{ ok: true }`.
- [ ] Emails arrive in the destination inbox (and you checked spam).

---

## Chunk 12: Error Tracking & Logging

**Chunk 12: Error Tracking & Logging**

- Goal:
  Set up production observability across frontend and API using Sentry, Axiom, and Plausible.
- Changes made:
  Added Sentry for web (`/sentry-test`) and API (`/__sentry-test`), added API request logging and `GET /__log-test` for Axiom, and added Plausible script loading in `web/src/app/layout.tsx` (production only).
- Env vars / secrets added or changed:
  `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_DSN`, `AXIOM_TOKEN`, `AXIOM_DATASET`, `NEXT_PUBLIC_PLAUSIBLE_DOMAIN`, and Pages env coverage for `NEXT_PUBLIC_API_BASE_URL` and `DATABASE_URL`.
- Deploy notes (Pages vs Workers):
  Web changes deploy through Cloudflare Pages after Git push; API changes deploy via Wrangler (`npx wrangler deploy`) and require Workers secrets/vars set in Cloudflare.
- Verification steps:
  Trigger `/sentry-test` and `GET /__sentry-test` and confirm Sentry events, call `GET /__log-test` and verify Axiom dataset entries, and verify Plausible script/event on `https://newchums.com`.
- Troubleshooting notes:
  Pages build can fail if `DATABASE_URL` is not defined at build time.
  Pages dynamic/auth routes may require `export const runtime = "edge";`.
  Plausible site domain must match the actual production domain (`newchums.com`).
  Detailed troubleshooting notes are archived in docs/chunks/Chunk Log.md (Chunk 12).

---

## Chunk 13: Setup Cleanup Checklist

**Chunk 13: Setup Cleanup Checklist**

- Goal:
  Lock down test-only surfaces for production, add lightweight health checks, reduce env drift (Preview vs Production), and make diffs predictable.
- Changes made:
  - Web `/sentry-test` now returns `404` in production (`notFound()`), while still working locally/non-prod for Sentry validation.
  - API internal test routes are centralized and guarded via `api/src/internalAccess.ts`:
    - `GET /__sentry-test`
    - `GET /__log-test`
    - `GET /health/db`
  - Added `GET /health` (no DB) and `GET /health/db` (DB ping + latency).
  - Added `scripts/check-env.mjs` to validate required env keys exist locally (does not print values).
  - Normalized line endings via `.gitattributes` for stable diffs across Windows/macOS/Linux.
  - Updated web Sentry build config to gracefully skip source-map upload when release credentials are absent (still captures errors).

- Security rotations (operational, not committed):
  - Rotated any exposed secrets (Google OAuth, Neon, Postmark, Sentry/Axiom as applicable).
  - Updated values in:
    - Cloudflare Pages env vars/secrets (Preview + Production)
    - Cloudflare Workers secrets/vars
    - Local `web/.env.local` and `api/.dev.vars`

- Env vars / secrets added or changed:
  - Workers var: `APP_ENV` (`development|preview|production`)
  - Workers secret: `INTERNAL_TEST_TOKEN` (required to access internal test routes in production via `x-internal-token`)
  - Optional Pages secrets for Sentry releases/source maps: `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`

- Deploy notes (Pages vs Workers):
  - Web deploys automatically via Cloudflare Pages on push to `main`.
  - API deploys only via `npx wrangler deploy`.
  - Pages Preview and Production maintain separate env-var sets (verify both).

- Verification steps:
  1. Local env sanity:
     - `node scripts/check-env.mjs`
  2. Local API (Wrangler):
     - `cd api && npm run dev`
     - From **PowerShell**, prefer `curl.exe` (PowerShell aliases `curl` to `Invoke-WebRequest`):
       - `curl.exe -i http://127.0.0.1:8787/health`
       - `curl.exe -i http://127.0.0.1:8787/health/db`
       - `curl.exe -i http://127.0.0.1:8787/__log-test`
       - `curl.exe -i http://127.0.0.1:8787/__sentry-test` (expected `500` because it intentionally throws)
  3. Production API:
     - `curl -i https://<your-worker>.workers.dev/health` → `200`
     - `curl -i https://<your-worker>.workers.dev/__log-test` → `404` (should be hidden in prod)
     - `curl -i https://<your-worker>.workers.dev/__sentry-test` → `404`
     - `curl -i https://<your-worker>.workers.dev/health/db` → `404`
     - Optional (internal access): repeat the above internal routes with header `x-internal-token: <INTERNAL_TEST_TOKEN>` and confirm they succeed
  4. Production web:
     - Visit `https://newchums.com/sentry-test` → `404`

- Troubleshooting notes:
  Detailed command transcripts and edge cases are archived in `docs/chunks/Chunk Log.md` under Chunk 13.

---

## Chunk 14: App UI Shell + Design System Lock-In

**Goal:** Establish a stable UI foundation (layout + navigation + theme tokens + reusable components) for all upcoming pages.

### What we added/changed (summary)

- Implemented an **App Shell** (single source of truth) with:
  - Global layout wrapper for authenticated app routes.
  - Shared navigation config used by both desktop and mobile nav.
  - A top-level **Logout** control in the shell so you can reliably end sessions during testing.

- Locked in the **MUI theme tokens + component defaults**:
  - Centralized theme creation (palette/typography/shape/spacing).
  - App Router–compatible Emotion integration (ThemeRegistry) so hydration is stable.
  - Consistent component defaults/overrides for buttons, cards, inputs, dialogs, etc.

- Created a small **internal UI component library** (reusable primitives):
  - Button, Card, TextField, Dialog, Toast/Snackbar provider, and a stub-page wrapper.

- Added **route stubs** for upcoming pages (all reachable via navigation):
  - Home (`/home`)
  - Events list (`/events`)
  - Event detail (`/events/[id]`)
  - Create event (`/events/create`)
  - Profile (`/profile`)
  - Settings (`/settings`)
  - UI demo (`/ui`) for verifying components/theme quickly

- Implemented a clean split between **public** and **authenticated** routes using route groups:
  - Public: `/(public)` (login/signup/forgot/reset)
  - App: `/(app)` (home/events/profile/settings/ui)
  - Unauthenticated access to app routes redirects to `/login?next=<path>`.

### Important behavior to know

- If you navigate directly to a protected route while logged out (ex: `/settings`), you should land on:
  - `/login?next=%2Fsettings`
- After signing in, you should return to the original path (the `next` value), not get forced to `/home`.

### What we verified locally

From `web/`:

```bash
npm run dev
```

Then validate in the browser:

- `http://localhost:3000/ui` (requires auth; UI demo shows theme + components)
- `http://localhost:3000/settings` (requires auth; redirects to login with `next`)
- `http://localhost:3000/events` and `http://localhost:3000/profile` render stub pages and share the same shell/nav.

Quality gates:

```bash
npm run lint
npm run build
```

### Cloudflare deployment notes (Chunk 14)

- Cloudflare Pages build/run for Next.js on Pages runs server routes on the **Edge runtime**.
- If you see Cloudflare build failures referencing `/_middleware` or edge runtime, ensure your route/runtime expectations align with the Pages adapter requirements.
- **Workers plan size limit:** deploying the Pages Function (the Worker that runs your Next app) can exceed the Free plan’s 3 MiB gzip limit.
  - If you hit `Worker exceeded the size limit of 3 MiB`, upgrading Workers to Paid (10 MiB) resolves it.

**Done when:** You can navigate across all route stubs, theme is consistent everywhere, components are reusable, and Pages deploy succeeds from `main`.

---

## Chunk 15: Interests + Location Preferences (Profile Core)

**Goal:** Logged-in users can save interests, travel radius, home location, and email preferences; values persist after refresh.

### What we added

- **DB (Neon):** Run `docs/chunks/db/015_profile_core.sql` then `015_seed_interests.sql`. Creates `interests`, `user_interests`, `user_profile` with PostGIS home_location and email prefs.
- **API (Next route handlers):**
  - `GET /api/interests` — returns all interests (no auth)
  - `GET /api/profile` — returns user profile + interest slugs (auth required)
  - `PUT /api/profile` — partial upsert (auth required); validates lat/lng, travel_radius_km 1–200, interest slugs.
- **UI:**
  - `/profile` — city, lat/lng, travel radius slider (1–200 km), interests by category (chips), Save with toast
  - `/settings` — Email preferences: toggles for chat digest and new events; persist via PUT /api/profile

### Verification steps

1. Apply DB migrations in Neon SQL Editor (015_profile_core.sql, then 015_seed_interests.sql).
2. `cd web && npm run dev`; log in; visit `/profile`; save interests + radius + location; refresh and confirm persisted.
3. Visit `/settings`; toggle email prefs; refresh and confirm persisted.
4. `npm run lint` and `npm run build` pass.

---

## Verification Checklist

After completing all chunks, verify:

- [ ] `npm run dev` starts your frontend locally
- [ ] `npx wrangler dev` starts your API locally
- [ ] Pushing to GitHub deploys frontend to newchums.com
- [ ] `npx wrangler deploy` updates your live API
- [ ] Users can sign up and log in
- [ ] Database reads and writes work
- [ ] Emails send successfully
- [ ] Errors appear in Sentry
- [ ] Logs appear in Axiom

---

## Notes

- Complete chunks in order; later chunks depend on earlier ones
- If you get stuck on a chunk, note where and ask for help on that specific step
- Environment variables are sensitive—never commit them to GitHub
- Test each chunk before moving on; don't accumulate problems

---

## Time Estimate

| Chunk                        | Estimated Time |
| ---------------------------- | -------------- |
| 1. Local Development Tools   | 30 min         |
| 2. Accounts & API Keys       | 45 min         |
| 3. Domain & DNS              | 20 min + wait  |
| 4. Database Setup            | 30 min         |
| 5. Project Scaffolding       | 45 min         |
| 6. Cloudflare Workers Setup  | 45 min         |
| 7. Cloudflare Pages Setup    | 30 min         |
| 8. MUI Theme Configuration   | 30 min         |
| 9. Authentication Setup      | 60-90 min      |
| 10. Database Integration     | 45 min         |
| 11. Email Setup              | 30 min         |
| 12. Error Tracking & Logging | 30 min         |
| 13. Setup Cleanup Checklist  | 20-30 min      |

**Total:** ~8-10 hours (can be spread across multiple days)

This covers Week 5 of your Phase 1 plan.

---

## End of Session Checklist (use every chunk)

### 1) Stop local processes

- Stop `web` dev server (Ctrl+C)
- Stop `api` Wrangler dev server (press `x` in the Wrangler UI)

### 2) Sanity check changes (no secrets)

From repo root:

- `git status`
- `git diff`
- Confirm no tokens/connection strings are present in tracked files.
- If a secret was exposed, rotate it and update env vars/secrets (never commit secrets).

### 3) Local verification

**Web**

- `cd web`
- `npm run lint`
- `npm run build`
- Optional smoke: `npm run start` and test key routes

**API**

- `cd api`
- `npm run dev`
- In another terminal:
  - `curl.exe -i http://127.0.0.1:8787/health`
  - (Any other endpoints touched this chunk)
- Stop API dev (`x`) when done

### 4) Deploy to PROD (important mental model)

- Web deploys to PROD automatically on **push to `main`** via Cloudflare Pages.
- API does **not** deploy on push — it deploys only via Wrangler:
  - `cd api && npx wrangler deploy`

### 5) PROD verification

**API**

- `curl -i https://<api-worker-url>/health`
- Verify any endpoints that should be hidden/guarded behave correctly in production

**Web**

- Open `https://newchums.com/` and any routes changed this chunk
- Confirm any test-only routes/pages are blocked in production

### 6) Commit + push (after deploy + verification)

From repo root:

- `git add .`
- `git commit -m "Chunk XX: <summary>"`
- `git push`

### 7) Env parity quick-check (dashboard)

**Cloudflare Pages (Preview + Production)**

- Confirm required vars exist (and were updated if rotated)

**Cloudflare Workers**

- Confirm required vars/secrets exist (and were updated if rotated)

### 8) Docs update (only when everything is green)

- Update `docs/Development Setup Guide.md` (Current State + short chunk summary)
- Put verbose troubleshooting in `docs/chunks/Chunk Log.md`
- Update `docs/Technical Specs.md` / `docs/System Map.md` only if decisions/architecture changed

### 9) Session close snapshot

- `git status`
- `git log -1 --oneline`
- Add a 3–6 line “Next time” note (what shipped + what’s next + any follow-ups)
