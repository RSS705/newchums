# UI survey harness

Reusable version of the 3 Aug 2026 full-product UI review. It builds a
throwaway database seeded with a deliberately hostile state matrix, points
both dev servers at it, and captures every route in `routes.json` at 320,
390, 768 and 1280 with two automated detectors per capture: document-level
horizontal overflow and uncaught page errors.

Both bugs the original survey found lived at the intersection of **long
content** and the **narrowest width**, after each surface had been signed
off with typical data at 390. That is what the fixtures exist to prevent:
maximal display names ("Maximilian Featherstonehaugh-Wellesley",
"@konstantinospapadop"), a long title, a long location, a long DM, every
plan lifecycle state (published, draft, past, cancelled mid-confirmation),
a hobby-less plan, an open confirmation window with mixed
confirmed/pending/declined chips, zero/one/twelve attendees, and an
invited-but-unresponded viewer.

## Run it

```bash
cd web
npm run ui-survey
```

That is the whole loop: build DB, boot servers, mint role cookies, sweep,
tear everything down (env files are backed up and restored on any exit,
including failures). Exit code 0 means every capture was clean; FLAG lines
and exit 2 mean something overflowed, errored, or failed to load.
Screenshots land in `/tmp/ui-survey/<time>/shots` for eyeballing; the
detectors only catch the objective failures, they do not replace looking.

Variants:

```bash
npm run ui-survey -- --keep        # leave DB + servers up to poke manually
npm run ui-survey -- --sweep-only  # servers already up: just mint + sweep
node tools/ui-survey/sweep.mjs --only plan-confirm-host,create ...  # subset
```

One-time setup: `npx playwright install chromium` (playwright itself is a
devDependency). Requires `psql` on PATH and `api/.dev.vars` with the usual
`DATABASE_URL`.

## Pieces

| File | What |
|---|---|
| `build-db.sh` | Fresh DB on the same instance, `newchums` schema + postgis, `legacy-ddl.sql`, the full `web/sql` chain, then `seed.sql`. |
| `legacy-ddl.sql` | The three pre-chain tables, snapshotted from prod catalogs. Regenerate with `generate-legacy-ddl.sh` if their live shape changes. |
| `seed.sql` | The state matrix. Header comments list the constraint traps (rsvp status values, invite single-identity, `username_norm`, lat/lng). |
| `mint-cookies.mjs` | Auth.js session cookies for the seeded roles (host, att1, invitee, fresh, admin, onboard). Reads `AUTH_SECRET` from `web/.env.local` at runtime; nothing secret is stored here. |
| `routes.json` | The capture list: route, role, optional widths/settle/fullPage overrides. |
| `sweep.mjs` | Capture + detectors. `--only name1,name2` for quick reruns. |
| `run.sh` | Orchestration and teardown. |

## Extending

- **New surface**: add a line to `routes.json`. If it needs data, add it to
  `seed.sql` with a fixed UUID in the existing id ranges and a comment.
- **New state**: extend `seed.sql`. Prefer the worst realistic content
  (longest names, widest chips) — typical data has never caught anything.
- **New role**: add a user row to `seed.sql` and the id to
  `mint-cookies.mjs`.
- **New detector**: `sweep.mjs`'s `page.evaluate` block is the place;
  anything measurable beats anything eyeballed.

The sweep only asserts objective breakage. Layout judgement (orphaned
elements, clipped text inside a fixed box, contrast) still needs a human
over the screenshots; see docs/UI_Patterns.md for the standard to measure
against, and AGENTS.md ("UI verification") for when running this is
expected.
