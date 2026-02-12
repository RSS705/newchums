# NewChums Agent Instructions (AGENTS.md)

This repo is being built for the long term.
Prefer maintainable, production-grade approaches over quick hacks.

## Source-of-truth docs

Canonical project docs (these are uploaded at the start of new chats):

- docs/Technical Specs.md
- docs/System Map.md
- docs/Development Setup Guide.md
- (Optional) docs/chunks/Chunk Log.md (archive for deep troubleshooting)

## Doc responsibilities

### docs/Technical Specs.md

Purpose: decisions, invariants, conventions.
Update only when a decision changes or a new app-wide requirement is introduced.
Do not paste step-by-step logs here.

### docs/System Map.md

Purpose: high-level architecture and major flows.
Update only when components/flows/deployment boundaries change materially.

### docs/Development Setup Guide.md

Purpose:

1. A "Current State" section at the very top (must always be accurate).
2. Short chunk summaries using the template below.
   Avoid transcripts. Keep chunk summaries repeatable and concise.

### docs/chunks/Chunk Log.md

Purpose: detailed troubleshooting notes and long command transcripts.
If a chunk has lots of twists, store detail here and reference it from the Setup Guide.

## Long-term engineering principles (always apply)

- Minimize tech debt; prefer clean, stable patterns.
- Avoid brittle build-time behavior (e.g., module-level DB init that breaks builds).
- Keep environment variable usage explicit and consistent across local/preview/prod.
- Keep observability safe: do not log secrets, tokens, reset links, or auth headers.

## Workflow expectations (critical)

Do not output code patches directly; always provide a Codex prompt for code changes.
If the user asks for code, respond with a Codex prompt plus verification steps, not inline patches.

For any proposed change:

1. Provide a Codex prompt that implements the change (minimal diff, maintainable).
2. Provide verification steps I can run immediately after each stage:
   - exact commands (e.g., npm run lint, npm run build, curl calls)
   - what success looks like
3. Prefer incremental validation over big leaps (verify as we go).

## Chunk closeout template (Development Setup Guide)

**Chunk X: <Name>**

- Goal:
- Changes made:
- Env vars / secrets added or changed:
- Deploy notes (web/pages vs api/workers):
- Verification steps:
- Troubleshooting notes (only if new/important):

## Deployment model reminders

- Web (Cloudflare Pages): deploys automatically after pushing to GitHub.
- API (Cloudflare Workers): deploys via `wrangler deploy` (unless CI is later added).

## Security reminders

- Never commit secrets.
- Use Cloudflare Pages "Secrets" for sensitive values; use Workers secrets via wrangler.
- If any secret appears in chat/logs/screenshots, assume compromised and rotate.
