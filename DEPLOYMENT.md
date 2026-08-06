# Deployment

Notes for deploying this app to `records.manshreck.com`. Nothing here has been
executed yet — this is the plan.

## One architectural constraint that shapes the choices

**This app assumes a long-running Node process, not serverless.** `lib/prisma.ts`
and `lib/controlDb.ts` cache Postgres connection pools on `globalThis` across
requests, and `lib/provisionTenant.ts` loads `prisma/tenant-schema.sql` via
`readFileSync(process.cwd(), ...)` at runtime rather than as a bundled import.
Both patterns are built for a process that stays warm and keeps its filesystem —
they fight serverless platforms like Vercel (cold starts reset pools, and
file-tracing can silently drop a file that's only reached via `readFileSync`, not
`import`). Prefer a persistent host over serverless.

> **This used to be two constraints.** The other was that tenants were
> provisioned with `CREATE DATABASE`, which needs a `CREATEDB` role on a shared
> server — something managed and free-tier Postgres essentially never grants, and
> which ruled out most affordable hosting. The app now provisions each tenant a
> *schema* inside one database (`CREATE SCHEMA`), needing only `CREATE` on that
> database. Neon, Supabase, Render Postgres and every other managed tier are now
> viable. See `DEVELOPER_GUIDE.md` §10.

## Steps

1. **Pick a host that runs `next start` as a long-lived process** — Render,
   Railway, Fly.io, or a VPS with Docker/systemd + a reverse proxy
   (Caddy/nginx). Any of these gives free TLS for a custom domain.

2. **Pick any Postgres provider.** Neon, Supabase, Render Postgres, Fly
   Postgres, DigitalOcean, RDS, or self-hosted on the same box — one database is
   all that's needed, and the role needs only `CREATE` on it (to add a schema per
   signup) plus ordinary read/write. No `CREATEDB`, no superuser, no
   server-level access. Free tiers are fine to start.

   Two things worth checking on a free tier:
   - **Connection limits.** Each active tenant holds a small pool (`max: 5`,
     evicted after 30 minutes idle). A ~60-connection cap is ample at this
     scale; if it ever isn't, put a pooler (pgbouncer, or the provider's own)
     in front rather than reworking the app.
   - **Whether the instance sleeps.** Some free tiers idle out; the first
     request after that pays a wake-up delay.

3. **DNS**: in the DNS provider for `manshreck.com`, add a `CNAME` (or the
   host's specific `A`/`ALIAS` record) for the `records` subdomain pointing
   at whatever target the hosting platform gives you, then add
   `records.manshreck.com` as a custom domain in that platform's dashboard.

4. **Create the database** (once, by hand — the app creates schemas, not
   databases):

   ```bash
   createdb vinyl    # or whatever the provider's console calls it
   ```

5. **Set environment variables on the host**:
   - `DATABASE_URL` — the full connection string for that one database.
     Everything lives inside it: a `control` schema for accounts and sessions,
     and one `vinyl_user_<hex>` schema per account.
   - `DISCOGS_TOKEN` — optional shared fallback Discogs API token.
   - `ADMIN_PASSWORD` — must be a real value once deployed beyond localhost
     (see README.md).

   There is no longer a `CONTROL_DATABASE_URL`; the control plane is a schema in
   the same database.

6. **Build/deploy**:
   - `npm install`
   - confirm `prisma generate` runs (check deploy logs — Prisma 7 usually
     does this on install, but verify)
   - `npm run build`
   - `npm run start`
   - On first boot, `lib/controlDb.ts` creates the `control` schema and its
     `users`, `sessions` and `admin_sessions` tables automatically.

7. **Smoke test**: register a fresh account through the live URL and confirm a
   tenant schema actually gets created. This exercises the `CREATE` privilege
   and the `tenant-schema.sql` file-read end to end — the two riskiest steps
   above.

8. **Take a backup immediately**, from `/admin/backup`, before there is anything
   to lose. One file rebuilds the whole system — control plane and every tenant
   schema — into an empty database. Store it like a password: it contains every
   account's password hash and Discogs token.

## Migrating existing data

If you are moving a local database-per-tenant installation to a host, run
`scripts/migrate-to-single-database.sh` locally first to produce the single
database, verify it (the script compares every table by content fingerprint),
then dump *that* and restore it at the provider. The script never modifies or
drops the originals, so a failed attempt costs nothing.

## Backups

Three separate things, easily conflated:

| | Who | Covers |
|---|---|---|
| Provider snapshots | the host | everything, on their schedule — the primary line of defence |
| `/admin/backup` | admin | everything, on demand, restorable with `psql -f` |
| `/account/export` | any user | that one account's collection |

The in-app whole-system backup does not replace provider snapshots or a periodic
`pg_dump` — it adds an option needing no tooling, and one whose restore path is
the same `psql -f` used everywhere else. Take one after any migration, and
occasionally thereafter.
