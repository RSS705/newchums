This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Plus Jakarta Sans](https://fonts.google.com/specimen/Plus+Jakarta+Sans).

## Deploy to Cloudflare Workers (OpenNext)

The app is deployed to Cloudflare Workers via [OpenNext](https://opennext.js.org/cloudflare). Run all commands from the `web/` directory. Uses local Wrangler from `node_modules` (no global install required).

| Command | Description |
|---------|-------------|
| `npm run build:worker` | Build the OpenNext Worker output (`.open-next/`) |
| `npm run deploy` | Build and deploy to `newchums-web-dev` |
| `npm run deploy:dev` | Alias for `npm run deploy` |
| `npm run deploy:prod` | Disabled (no-op; dev-only worker) |
| `npm run clean` | Remove `.open-next`, `.next`, `.wrangler` |
| `npm run clean:rebuild` | Clean + build worker |
| `npm run deploy:dev:clean` | Clean + deploy |

Requires [Wrangler](https://developers.cloudflare.com/workers/wrangler/) to be logged in (`wrangler login`) and environment variables (e.g. `DATABASE_URL`, `GOOGLE_CLIENT_ID`, `AUTH_SECRET`) set as [Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/) or in `wrangler.toml` vars.

On WSL: run from WSL (e.g. `cd /home/rob/src/NewChums/web`) to avoid Windows toolchain conflicts.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
