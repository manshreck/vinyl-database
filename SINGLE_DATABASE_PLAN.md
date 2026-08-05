# Plan: database-per-tenant → schema-per-tenant

Status: **plan only — nothing here has been executed.** The existing databases
(`vinyl_control`, `vinyl_user_*`) are untouched and stay that way until the cutover
step, and even then are kept, not dropped.

## 1. The decision, and its critique

The move: keep one tenant = one namespace, but make that namespace a Postgres
*schema* inside a single database rather than a database of its own. Provisioning
becomes `CREATE SCHEMA`, which needs no privilege beyond `CREATE` on the database —
something every managed free tier grants — instead of `CREATEDB`, which effectively
none do.

### Why the reasoning holds

- **The hosting constraint is real and terminal.** DEPLOYMENT.md already names it:
  the current design requires a `CREATEDB`-capable role on a shared server, which
  rules out every free tier and most cheap managed tiers. There is no configuration
  that fixes this; only the model change does.
- **The ownership story never came from the physical layout.** Users experience
  ownership through the export: a plain `.sql` file that restores into any Postgres
  without this app, and a CSV that opens in a spreadsheet. Both are application-level
  features and both survive this change byte-for-byte (see §3.5 — the export file
  still targets `public`, exactly as a user restoring at home wants). No user can
  observe whether their rows live in a database or a schema.
- **The structural properties the code depends on all carry over**: per-tenant
  namespace, per-tenant provision/drop, per-tenant export, zero `tenant_id` columns,
  and — verified below — the per-tenant Prisma client shape survives with a
  two-line change.

### What is genuinely lost (accepted, with eyes open)

1. **Blast radius.** One database means shared fate: a bad migration, a fat-fingered
   `DROP`, or restoring a server-level backup affects every tenant at once. Backup
   granularity becomes schema-level surgery (`pg_dump --schema=…` still works, and
   the in-app export covers the per-tenant case). Mitigated by the admin
   whole-system backup (§3.8), which the single-DB model makes a one-connection
   operation — under the current model the same feature would need a connection per
   tenant database plus discovery of which databases exist.
2. **Security isolation narrows.** Today, crossing tenants requires opening a new
   connection; after, a single injected query could name another tenant's schema.
   The delta is smaller than it looks — the same credentials already reach every
   tenant database — but it is real. Mitigations that already exist: all queries go
   through Prisma's parameterized layer; the one raw-SQL page uses `Prisma.sql`
   templates; schema names are self-generated hex validated against
   `DATABASE_NAME_PATTERN` before ever being interpolated into DDL or
   `search_path`. That guard carries over verbatim and remains the injection
   boundary.
3. **Resource isolation** (noisy neighbor, per-DB stats/limits): irrelevant at this
   scale, and `lib/adminStats.ts` never used per-DB facilities anyway — it counts
   rows over a connection.

### Alternatives considered and rejected

- **Row-level tenancy (`tenant_id` column):** friendliest to hosting and pooling,
  but rewrites every table, every query, every test, and every fixture; weakens the
  per-tenant export/provision/drop story that is this app's point. Enormous diff for
  a worse fit.
- **Self-hosted VPS to keep multi-DB:** trades a bounded code change for an
  unbounded ops burden (backups, upgrades, patching). Rejected.
- **RLS:** row-tenancy's machinery plus policy management on top. Rejected.

**Verdict: agree with the move.** The reasoning survives critique because the thing
it protects (user-facing ownership) was never coupled to the thing it changes
(physical layout).

## 2. Verified findings (probed 2026-08-05, this machine, Prisma 7 / adapter-pg / PG 16)

These were tested against scratch databases, not assumed:

1. **`new PrismaPg(poolConfig, { schema: 'tenant_x' })` routes every generated query
   to that schema.** Verified with distinguishable rows in `public` vs `tenant_a`:
   the client read the tenant's row.
2. **`$queryRaw` does NOT follow the `schema` option.** Unqualified raw SQL silently
   read `public` — the wrong-tenant read, the worst failure mode this app could
   have, and `app/search/page.tsx` is built on `$queryRaw`. Fix, also verified:
   additionally set `options: '-c search_path=tenant_x'` on the pool config; raw
   SQL then resolves to the tenant schema. **The plan uses both together** — the
   compiler option covers generated SQL, the connection `search_path` covers raw
   SQL, and each is harmless redundancy for the other's half.
3. **The full tenant schema works inside a schema.** `prisma/tenant-schema.sql`
   applied under `SET search_path TO tenant_a` creates everything in the tenant
   schema (its `CREATE SCHEMA IF NOT EXISTS "public"` line is a harmless no-op).
   Through the real Prisma models: enum reads (`NM`/`VG+` mapping), enum writes,
   enum `where:` filters, FK include chains, and SERIAL sequences all behave.
   **`tenant-schema.sql` needs no changes**, which also means the export that
   embeds it is unaffected.

## 3. Target architecture

One database (proposed name: **`vinyl`**) containing:

| Schema | Contents |
|---|---|
| `control` | `users`, `sessions`, `admin_sessions` (today's `vinyl_control`) |
| `vinyl_user_<hex12>` | one per tenant — **same names as today's databases**, so every `users.database_name` value remains valid unchanged |
| `public` | deliberately empty; documented as such |

Environment: `DATABASE_URL` becomes the full URL of the one database (no longer a
template whose path gets swapped). `CONTROL_DATABASE_URL` is retired; the control
pool derives from `DATABASE_URL` plus `search_path=control`.

Connection budget: unchanged shape — per-tenant cached pools capped at `max: 5`
with 30-minute idle eviction — but now all against one database. Fine within free-tier
connection limits (~60–100) at this scale; a pooler (pgbouncer/Neon pooler) is the
lever if that ever changes.

### 3.1 `lib/dbUrls.ts`

The template-swap (`withDatabaseName`) disappears. Exports become: the single
connection string, and a helper producing tenant pool config —
`{ connectionString, options: '-c search_path=<schema>' }` — plus the adapter's
`{ schema }`. The name-validation regex moves here or stays in provisionTenant, but
**must be applied before any interpolation into `options` or DDL**, exactly as it
is today for `CREATE DATABASE`.

### 3.2 `lib/prisma.ts`

Cache keyed by schema name instead of database name (same map, same eviction, same
`max: 5`). The client construction becomes:

```ts
new PrismaPg(
  { connectionString: singleDbUrl(), max: TENANT_POOL_MAX, options: `-c search_path=${schema}` },
  { schema }
)
```

The "request handling only" contract documented in AGENTS.md / DEVELOPER_GUIDE §4
is unchanged.

### 3.3 `lib/provisionTenant.ts`

- `createTenantDatabase` → `createTenantSchema`: `CREATE SCHEMA "<name>"`, then
  apply `tenant-schema.sql` and seed reference data over a connection whose
  `search_path` is the new schema. No more admin/maintenance connection — one
  ordinary connection does everything, which also removes a failure mode
  (the old two-connection dance).
- `dropTenantDatabase` → `dropTenantSchema`: `DROP SCHEMA "<name>" CASCADE`.
- `DATABASE_NAME_PATTERN` guard: carried over verbatim on both paths.
- Name generation unchanged (`vinyl_user_` + 12 hex chars is a valid schema name).

### 3.4 `lib/controlDb.ts`

Pool gains `options: '-c search_path=control'`; bootstrap gains a leading
`CREATE SCHEMA IF NOT EXISTS control;`. The unqualified `CREATE TABLE IF NOT
EXISTS` statements then land in `control` via search_path. Everything else —
queries, types, the globalThis caching — is untouched.

### 3.5 Exports — the part that must not regress

- `lib/exportTenant.ts`: the reading connection gains the tenant `search_path`
  (so `SELECT * FROM artists` and `pg_get_serial_sequence('artists', …)` resolve
  correctly), and the `information_schema.tables` filter changes from
  `table_schema = 'public'` to the tenant schema — this also keeps the
  unknown-table tripwire scoped to the tenant's own tables rather than every
  schema in the database.
- **The emitted file does not change.** It still embeds `tenant-schema.sql`
  targeting `public` and unqualified INSERTs — precisely right for a user
  restoring into their own empty database. The portability story is proven
  unchanged when the round-trip test passes post-conversion.
- `lib/exportCollectionCsv.ts`: reading connection gains `search_path`. Nothing
  else.

### 3.6 Callers and cleanup paths

- `app/actions/deleteAccount.ts` and `e2e/global-teardown.ts`: follow the
  provisionTenant renames; ordering rationale in their comments still holds
  (drop tenant data first, control row second).
- `lib/adminStats.ts`: `countPressings` takes the schema via the same pool-config
  helper.
- `app/admin/page.tsx`: verify nothing displays "database" semantics that are now
  schema semantics.

### 3.7 Test support

`test-support/db/scratchDatabase.ts` becomes scratch-*schema* helpers: same
`vinyl_test_<hex>` naming and identifiability guarantees, but `CREATE SCHEMA` in
the dev database instead of `CREATE DATABASE` on the server. Seam/system tests
(provisionTenant, controlDb, registration, both exports) follow the helpers; their
assertions are about behavior, not layout, and should survive nearly unchanged.
The tests then mirror production reality again — scratch *databases* would be
testing a model the app no longer uses.

### 3.8 Admin whole-system backup (blast-radius mitigation)

A new admin-only download, alongside the existing per-tenant export, producing one
self-contained `.sql` that rebuilds the **entire** database — control schema plus
every tenant schema — into an empty target with `psql -f`. This is the in-app
answer to §1's blast-radius concern: even if the hosted database is lost or
corrupted wholesale, a recent backup file rebuilds all of it.

**Honest framing first:** this complements, not replaces, the primary lines of
defense. The hosting provider's own backups (all managed tiers have them) and an
occasional `pg_dump` run from the admin's own machine against the remote database
remain the authoritative options — the latter needs zero app code at all. The
in-app backup adds a no-tooling-required option and a file whose restore path is
identical to the per-tenant export users already have.

Mechanics — mostly reuse of `lib/exportTenant.ts`:

- **Emission mode differs from the per-tenant export, deliberately.** The
  per-tenant export targets `public` because its consumer is a user restoring into
  their own database; that does not change. The admin backup instead *preserves*
  schema names: each tenant section is wrapped in
  `CREATE SCHEMA "vinyl_user_xxx"; SET search_path TO "vinyl_user_xxx";` followed
  by the same schema DDL and INSERTs the exporter already generates, plus the same
  `setval` sequence fixes. `buildTenantSqlExport` gains a target-schema parameter;
  the existing behavior is the `public` case.
- **Tenant discovery from `control.users`**, not from `pg_namespace` — the users
  table is the source of truth for which schemas are live tenants, and a schema
  present in the database but absent from `users` is exactly the kind of anomaly
  that should fail the backup loudly (same philosophy as the unknown-table
  tripwire, one level up). The per-schema unknown-table tripwire runs for each
  tenant as it already does.
- **Control schema: users data is included; sessions and admin_sessions are
  deliberately not.** Password hashes and Discogs tokens must survive a restore or
  the accounts don't. Sessions are the opposite: restoring them would resurrect
  every login token as of backup time, so a stolen backup file plus a restore
  becomes session hijacking. Emit the control DDL (the three `CREATE TABLE`s —
  extracted from `controlDb.ts`'s `BOOTSTRAP_SQL` so there is one source of
  truth), INSERTs for `users` only, and a comment in the file stating the
  omission is intentional; first boot's bootstrap tolerates the empty tables.
- **The file is a secret and says so.** It contains every user's password hash and
  Discogs token. The file header states this; the admin page says it next to the
  button ("store this like a password"). Filename:
  `vinyl-full-backup-<date>.sql`.
- **Delivery**: `GET /admin/backup`, gated by the existing admin session exactly as
  the admin dashboard is, `Cache-Control: no-store`, attachment disposition — the
  same shape as `/account/export`. A button on the admin dashboard with a line
  stating what the file contains and the restore command.
- **Verification**: a system test mirroring the existing export round-trip — seed
  two scratch tenant schemas plus a control schema, build the backup, restore into
  an empty scratch database, fingerprint-compare both tenants and the `users`
  table, and assert the sessions tables exist but are empty.

Deliberately out of scope for now: scheduling/automation (a cron hitting the
route, or provider-side scheduled dumps, can come later), incremental backups, and
any restore-*from within the app* path — restore is `psql -f` into a fresh
database, documented, not a button.

### 3.9 Documentation

- `DEPLOYMENT.md` (lives on the `release` branch): constraint #1 — the
  `CREATEDB` requirement — dissolves, which un-rules-out Neon/Supabase/Render
  free tiers. The long-running-process constraint (pool caching, `readFileSync`)
  remains and still argues for a persistent host.
- `README.md`, `.env.example`: `DATABASE_URL` semantics, `CONTROL_DATABASE_URL`
  removal.
- `DEVELOPER_GUIDE.md` §4 and §10, `TESTING.md` §1.2: schema-per-tenant wording.
- `users.database_name`: **keep the column name for now** (it holds the same
  values; renaming ripples through controlDb, session, admin, and tests for zero
  behavior change). Optional follow-up rename to `tenant_schema` if it grates.

## 4. Data migration runbook (local, non-destructive)

Principles: originals untouched throughout; build alongside; verify with content
fingerprints before cutover; originals retired manually much later, never by
script.

1. **Snapshot everything first**: `pg_dump` of `vinyl_control` and each
   `vinyl_user_*` to dated files. Belt and braces on top of keeping the live
   originals.
2. `createdb vinyl`
3. **Per tenant, the rename dance** (sidesteps pg_dump 16's hard-qualified
   `public.` references — no sed, no fragile rewriting):
   ```
   pg_dump -d vinyl_user_xxx | psql -d vinyl -v ON_ERROR_STOP=1
   psql -d vinyl -c 'ALTER SCHEMA public RENAME TO vinyl_user_xxx; CREATE SCHEMA public;'
   ```
   Tables, enum type, sequences, and constraints all travel with the schema
   rename. Repeat per tenant, one at a time, verifying (step 5) between.
4. **Control plane, same dance**: dump `vinyl_control`, restore into `vinyl`'s
   `public`, rename to `control`, recreate `public`.
5. **Verify before cutover** — per table, per tenant, the md5 fingerprint
   comparison already used twice in this project's history:
   `SELECT md5(coalesce(string_agg(x::text,'|' ORDER BY x::text),'')) FROM <t> x`
   run against the original database and the new schema must match exactly.
   Row counts alone are not sufficient (this technique previously caught silent
   timestamp truncation that counts missed).
6. **Cutover** = new code + new `.env` together (this is the breaking change; old
   code cannot run against the new layout, new code cannot run against the old).
7. **Soak**, with the old databases intact as instant rollback: revert `.env` and
   code, and everything is as before. Drop the old databases manually, weeks
   later, only after exports from the new layout have been taken and restored
   successfully.

## 5. Sequencing and verification

Work on a branch (`single-database`); `main` stays deployable against the old
layout until the branch merges with migration done.

Order within the branch, so each step is compilable and testable:
1. `dbUrls` → `prisma.ts` → `provisionTenant` (+ its seam test via new scratch
   helpers) — the core.
2. `controlDb` (+ seam test), `adminStats`.
3. Exports (+ both system tests). The round-trip test restoring into an empty
   scratch target is the proof the ownership story survived.
4. Admin whole-system backup (§3.8) — after the exports, since it reuses their
   machinery, and before cutover, so the very first backup of the migrated
   database can be taken the moment the migration completes.
5. `deleteAccount`, e2e teardown, remaining callers.
6. Docs.
7. Local data migration (§4), then the full gauntlet **against migrated data**:

| Check | Proves |
|---|---|
| `npm test` (402) | nothing above the data layer noticed |
| `npm run test:integration` | provision/drop/export against real schemas |
| `npm run test:contract` | Discogs fixtures still honest |
| `npm run test:e2e` | registration→setup→add→export journeys, incl. schema create/drop per test account |
| md5 fingerprints (§4.5) | migrated data identical to originals |
| In-app `.sql` export → restore into empty DB → fingerprints | portability unchanged post-migration |
| Admin backup → restore into empty DB → fingerprints (all tenants + users; sessions empty) | whole-system recovery works before it's ever needed |
| Take and archive one real admin backup immediately after cutover | day-zero recovery point for the new layout |
| Browser smoke: collection page counts (106/91), duplicate-pressing dialog, wishlist dialog, Discogs prefill, account page | the session's accumulated features all still work |

## 6. Open decisions (small, none blocking the plan's shape)

1. **Single database name** — `vinyl` proposed.
2. **Control schema name** — `control` proposed over reusing `public`; an empty
   `public` is self-documenting, a control-plane-in-`public` invites confusion
   with tenant schemas.
3. **`users.database_name` column** — keep name (recommended) vs rename now.
4. **`public` hardening** — optionally `REVOKE CREATE ON SCHEMA public` once
   empty; cosmetic at this scale.
5. **Admin backup: include users' Discogs tokens?** Recommended yes — without
   them a restore leaves every account's Discogs integration silently broken, the
   file already contains password hashes so its handling requirements don't
   change, and tokens are individually revocable if a backup file is ever
   exposed. The alternative (redact tokens, users re-enter after restore) is
   defensible if the sensitivity outweighs the restore friction. Sessions are
   not an open question: excluded, per §3.8.
