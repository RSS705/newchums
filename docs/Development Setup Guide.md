# NewChums Development Environment Setup

## Overview

**Last Updated:** February 10, 2026

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

---

## Chunk 12: Error Tracking & Logging

**Goal:** Set up monitoring for production issues.

- [ ] Configure Sentry in frontend
- [ ] Configure Sentry in API
- [ ] Test error capture (trigger a deliberate error)
- [ ] Configure Axiom for logging
- [ ] Verify logs appear in Axiom dashboard
- [ ] Add Plausible analytics script to frontend

**Done when:** Errors and logs appear in their respective dashboards.

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

**Total:** ~8-10 hours (can be spread across multiple days)

This covers Week 5 of your Phase 1 plan.
