# Technical Specs

**Last Updated:** February 19, 2026\
**Version:** 1.10

------------------------------------------------------------------------

## Architecture Overview

### Frontend

-   Next.js (App Router)
-   React 18
-   MUI v5
-   Auth.js
-   Cloudflare Pages deployment

### Backend

-   Cloudflare Workers (Wrangler)
-   Hono
-   Neon PostgreSQL (PostGIS)

------------------------------------------------------------------------

## Landing Layout Stabilization

-   Single shared MUI Container defined in LandingLayout.
-   Header, Hero, Footer contain no nested Containers.
-   Toolbar uses disableGutters.
-   Alignment verified via DevTools bounding box checks.

------------------------------------------------------------------------

## Deployment

GitHub → Cloudflare Pages\
Wrangler → Cloudflare Workers\
Single PROD workflow.

------------------------------------------------------------------------
