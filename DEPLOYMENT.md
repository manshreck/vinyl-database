# Deployment

Notes for deploying this app to `records.manshreck.com`. Nothing here has been
executed yet — this is the plan.

## Two architectural constraints that shape the choices

1. **Tenant databases are provisioned dynamically.** `lib/provisionTenant.ts`
   runs `CREATE DATABASE "..."` against the Postgres server itself at signup
   time (`createTenantDatabase`). The database provider must give the app a
   role with `CREATEDB` on a shared server/cluster. A provider that hands you
   exactly one fixed database per project (e.g. Supabase's default model)
   won't work here.

2. **This app assumes a long-running Node process, not serverless.**
   `lib/prisma.ts` and `lib/controlDb.ts` cache Postgres connection pools on
   `globalThis` across requests, and `lib/provisionTenant.ts` loads
   `prisma/tenant-schema.sql` via `readFileSync(process.cwd(), ...)` at
   runtime rather than as a bundled import. Both patterns are built for a
   process that stays warm and keeps its filesystem — they fight
   serverless platforms like Vercel (cold starts reset pools, and
   file-tracing can silently drop a file that's only reached via
   `readFileSync`, not `import`). Prefer a persistent host over serverless.

## Steps

1. **Pick a host that runs `next start` as a long-lived process** — Render,
   Railway, Fly.io, or a VPS with Docker/systemd + a reverse proxy
   (Caddy/nginx). Any of these gives free TLS for a custom domain.

2. **Pick a Postgres provider with a `CREATEDB`-capable role on one server**
   — Render Postgres, Neon, DigitalOcean Managed Postgres, AWS RDS, or
   self-hosted Postgres on the same box. Confirm the connection role can
   `CREATE DATABASE` / `DROP DATABASE` before committing — that's the one
   non-negotiable requirement.

3. **DNS**: in the DNS provider for `manshreck.com`, add a `CNAME` (or the
   host's specific `A`/`ALIAS` record) for the `records` subdomain pointing
   at whatever target the hosting platform gives you, then add
   `records.manshreck.com` as a custom domain in that platform's dashboard.

4. **Set environment variables on the host**:
   - `DATABASE_URL` — connection template (admin/`CREATEDB` role) pointed at
     the Postgres server; only the database name in the path differs per
     tenant connection.
   - `CONTROL_DATABASE_URL` — the shared control database (can live on the
     same server).
   - `DISCOGS_TOKEN` — shared fallback Discogs API token.
   - `ADMIN_PASSWORD` — must be a real value once deployed beyond localhost
     (see README.md).

5. **Build/deploy**:
   - `npm install`
   - confirm `prisma generate` runs (check deploy logs — Prisma 7 usually
     does this on install, but verify)
   - `npm run build`
   - `npm run start`
   - On first boot, `lib/controlDb.ts`'s bootstrap SQL creates the `users`,
     `sessions`, and `admin_sessions` tables automatically against
     `CONTROL_DATABASE_URL`.

6. **Smoke test**: register a fresh account through the live URL and confirm
   a tenant database actually gets created. This exercises the `CREATEDB`
   permission and the `tenant-schema.sql` file-read end to end — the two
   riskiest steps above.
