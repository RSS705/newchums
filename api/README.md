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
