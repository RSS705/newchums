# NewChums API

## Local DB Setup

Set the Neon connection string as a Wrangler secret:

```bash
npx wrangler secret put DATABASE_URL
```

Use the Neon pooled connection string with `sslmode=require`.

Sanity checks:

```bash
curl -i http://127.0.0.1:8787/db/ping
curl -i http://127.0.0.1:8787/db/postgis
```

## Dependency audit

`npm audit` currently reports two findings that are intentionally deferred because the only fixes available are `--force` upgrades that would cross a major boundary:

- **`cookie <0.7.0` (low)** via `@auth/core@0.34.3 → cookie@0.6.0`. Advisory GHSA-pxg6-pf52-xh8x: `cookie` accepts names/paths/domains containing out-of-bounds characters. The API only imports `@auth/core/jwt`'s `decode` for verifying NextAuth session JWTs (see `src/auth.ts`), it does not call any cookie-serialization paths in `@auth/core`, so this code is unreachable here. Fix would bump `@auth/core` to `0.41.x`, a major-version jump that changes adapter and provider APIs and is a NextAuth migration, not a cleanup.
- **`esbuild <=0.24.2` (moderate)** via `vitest@2.1.9 → vite@5 → esbuild@0.21.5`. Advisory GHSA-67mh-4wv8-2f99: any site can hit the esbuild dev server and read responses. Wrangler 4.86 already pulls `esbuild@0.27.3`, so production builds are not affected. The vulnerable copy only runs while `vitest` is up locally. Fix would bump Vitest to `4.x`, a major upgrade that should be done as its own pass.

Both items should be revisited together with the next planned NextAuth and Vitest upgrades.
