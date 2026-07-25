# Testing Plan

This plan turns the layer-by-layer gap analysis (unit / component / seam integration /
system integration / end-to-end) into concrete work: what test doubles to build, what
tests to add, where they live, and how they run and stay healthy over time. It assumes
the house taxonomy from *Software Engineering at Google* ch. 11–14 — five layers,
target mix ≈80% unit+component / 15% seam / 5% system+e2e — and the test-doubles
preference ladder (real > **proxy** > fake > stub > interaction test). "Proxy" here
means a disposable, isolated instance of the *actual* real implementation — a scratch
database — as distinct from a fake, which is a separate reimplementation. See
swe-test-doubles for the full definition; §1 below is where the distinction matters
most.

**Starting state:** 166 tests, 25 files, all layer 1 (unit) or layer 2 (component). Zero
seam, system, or end-to-end tests. Full findings are in the conversation that preceded
this plan; this document doesn't repeat the inventory, only the resulting work.

**Final state (all five phases done — see §6):** all five pyramid layers populated —
unit/component (§2.1), a fake + proxy test-double infrastructure with two contract
tests (§2.2), three seam integration tests (§2.3), one system integration test (§2.4),
and seven Playwright end-to-end journeys (§2.5) — all green against real local
Postgres and, where relevant, the real Discogs API.

---

## 1. Test-double strategy: proxies, fakes, and where each belongs

Before listing tests, one design decision matters more than any individual test: **the
database and Discogs need different doubling strategies, not the same one.** In short:
the database gets a **proxy** (a real, disposable instance — not a reimplementation);
Discogs gets a **fake** (it's an external, rate-limited third party — there's no way to
run a private instance of it to proxy).

### 1.1 Discogs → fake (MSW), backed by a contract test

Discogs is external, rate-limited (60 req/min, shared across the whole app on one
token), and not ours to run in a test loop. This is exactly the case the test-doubles
skill describes for "real one is slow/nondeterministic/external, many tests need one":
build a fake, back it with a contract test.

- **Fake**: an [MSW](https://mswjs.io/) (Mock Service Worker) handler set standing in
  for `api.discogs.com`, fixtures captured from real responses (`/database/search`,
  `/releases/:id`, `/masters/:id`).
- **Contract test**: the *same* fixtures, replayed against the real Discogs API on a
  schedule (not on every run), diffing response *shape* — field presence/types, not
  exact content — to catch Discogs changing its contract out from under
  `discogsMapping.ts`. This is the direct fix for the seam gap named in the review:
  nothing today would notice if Discogs' JSON shape drifted.
- **Owner**: whoever last touched `lib/discogs.ts` or `lib/discogsMapping.ts` updates
  the fixtures in the same change.

### 1.2 Database → a **proxy** for seam/system tests; a fake only for unit tests

This is the one place to push back on the "fakes for both" framing. Per the
test-doubles skill's preference ladder, rung 2 — proxy — beats rung 3 — fake —
whenever a disposable instance of the real thing is affordable to construct, and a
scratch PostgreSQL database is exactly that: Postgres is already a project
prerequisite, creating and dropping a database takes milliseconds, and there's no
shared state to make it nondeterministic. A fake would be strictly worse for the
seam/system layer, for a specific reason: **the exact things we need to verify — that
`prisma/schema.prisma` and `prisma/tenant-schema.sql` haven't drifted, that
`provisionTenant.ts`'s raw DDL and dynamic `CREATE DATABASE "${name}"` actually work,
that the database-name regex actually rejects bad input — are all real-Postgres
behaviors that a fake would have to reimplement from our own assumptions.** A fake
can't test an assumption it was built from; a proxy, being the real thing, doesn't
have that problem in the first place.

This app also happens to make tenant-database proxies unusually cheap and safe: the
production architecture already treats "one disposable database per user" as normal
(§10 of `DEVELOPER_GUIDE.md`), so creating and destroying a scratch tenant database for
a test isn't extra risk bolted on top — it's the same operation the app performs on
every real registration. The **control database is a shallower fit conceptually**
(there's exactly one of it in production, not one-per-something), but mechanically it's
no harder to proxy: apply `controlDb.ts`'s own bootstrap SQL to a throwaway database, the
same way `seam/provisionTenant.seam.test.ts` does for a tenant database. §2.3 treats
both the same way for exactly this reason.

So:

- **Seam and system integration tests use a real, per-test proxy database**
  (`test-support/db/scratchDatabase.ts`, §3 below) — not a fake.
- **A fake tenant-Prisma client is still worth building** (`test-support/fakes/fakePrismaClient.ts`),
  but for a different purpose: consolidating the 13 near-identical ad hoc `jest.fn()`
  mocks currently duplicated across `__tests__/actions/*.test.ts` into one
  owner-maintained, in-memory implementation of the handful of Prisma calls the app
  actually makes (`create`/`update`/`delete`/`findMany`/`findUnique`/`$transaction`
  on `pressing`, `release`, `artist`, `wishlistItem`, plus `format.findMany` /
  `genre.findMany`). This raises the *unit* layer's fidelity (a real in-memory
  create-then-read, instead of a stub that returns whatever was hardcoded) without
  claiming to close the seam gap.
- **The fake is contract-tested against the real thing** via
  `__tests__/contract/fakePrismaClient.contract.test.ts`: the same small script of
  operations (create a release with artists, add a pressing, update it, delete it) run
  against both the fake and a real scratch-DB-backed Prisma client, asserting they
  agree. This only runs under `test:integration` (it needs the real DB for the
  comparison), but it's what keeps the fake honest as the schema evolves.

---

## 2. New tests, by layer

### 2.1 Layer 1–2 gap-filling (no new infrastructure — do first) — ✅ done

These don't need fakes or scratch databases; they're the cheapest fixes and should
land before any of the infrastructure work in §1.

**Unit:**
- `lib/dbUrls.test.ts` — `adminConnectionString` / `tenantConnectionString` derive the
  right path from `DATABASE_URL`; pure function, no doubles needed.
- `lib/releaseIntake.test.ts` — `resolveReleaseId` tested **directly** rather than only
  incidentally through `createPressing`/`createWishlistItem`'s tests (it has
  independent callers, so per the unit-testing skill it earns its own tests). Includes
  the case the Enter-key crash fix depends on: `newReleaseTitle`/`newArtistName`
  absent from `FormData` entirely, not just blank.
- `lib/session.test.ts` / `lib/adminSession.test.ts` — added one **component-style**
  test per file chaining `createSessionCookie` → `getSession` (and the admin
  equivalent) through the *same* mock cookie-store state, so the lifecycle round-trip
  (token written by create is the token read by get) is actually verified once, not
  just each operation in isolation.

**Component:**
- `components/WishlistForm.test.tsx` — mirrors `PressingsForm.test.tsx`, including the
  Enter-key-in-search-box regression test (the fix was applied to both files; only one
  had a regression test before this).
- `components/EditPressingForm.test.tsx` — the cover-image retrieve flow (placeholder
  → fetch → image or error) and the two-click delete-confirmation flow. **Correction
  to this plan's original text**: the pale-red "not auto-populated" highlight state
  and the purchase-price-mirrors-into-current-value behavior actually live in
  `PressingsForm.tsx` (the *create* form), not `EditPressingForm.tsx` (the *edit*
  form) — this plan conflated the two when first written. Those tests were added to
  the existing `PressingsForm.test.tsx` instead, where the behavior actually is.
- `components/SearchForm.test.tsx` — regex/wildcard placeholder toggle, and the
  "Search Discogs" button building its query from whatever's in the title/artist/year
  fields.

**Result:** 205 tests across 30 files (up from 166/25), `tsc` and `next build` clean.

### 2.2 Test-double infrastructure (§1 above) — ✅ done

- `test-support/fakes/fakePrismaClient.ts` — covers the exact operations surveyed from
  every real call site in `app/`/`lib/` (not a general Prisma reimplementation): CRUD
  on `artist`/`release`/`pressing`/`wishlistItem`, `format`/`genre` lookups,
  `releaseGenre.deleteMany`/`createMany`, `$transaction` (best-effort snapshot/restore
  atomicity), and the specific `where`/`include`/`orderBy` shapes actually used.
  Anything outside that surface throws immediately rather than guessing — including a
  guard that fails fast on `artists: true`/`genres: true` (bare boolean), a shape the
  app never uses and which real Prisma treats differently than the nested
  `{ include: { artist: true }, orderBy }` form every call site actually uses. That
  guard exists *because* the fake's own contract test caught the fake silently
  ignoring the distinction on the first run — see below.
- `test-support/fakes/discogsServer.ts` + `test-support/fakes/fixtures/*.json` — MSW
  handlers over real captured responses (`search-kind-of-blue.json`,
  `release-2825456.json`, `master-5460.json`); unrecognized ids 404 rather than
  silently returning nothing.
- `test-support/db/scratchDatabase.ts` — `createScratchDatabase()`/`dropScratchDatabase()`/
  `applyTenantSchema()`/`withScratchTenantDatabase()` (a real generated `PrismaClient`
  via the exact same adapter construction `lib/prisma.ts` uses in production, pointed
  at a scratch DB). Names get a `vinyl_test_` prefix, validated by a regex before any
  create/drop, so a crashed run's leftovers are identifiable and nothing but a scratch
  database can ever be dropped. Smoke-tested directly against local Postgres
  (create → apply schema → real Prisma query → drop → confirmed gone).
- `jest.integration.config.ts` + `npm run test:integration` / `npm run test:contract` —
  see §4.
- **Both contract tests pass**: `test:contract` (Discogs, live network) and the
  `fakePrismaClient` contract test (live local Postgres, via `test:integration`).

### 2.3 Seam integration tests (layer 3) — ✅ done

Each test names exactly two real components and the one boundary between them, per
the seam-testing skill.

| Test | Boundary | Covers |
|---|---|---|
| `seam/provisionTenant.seam.test.ts` | `provisionTenant.ts` ↔ real Postgres | `createTenantDatabase` produces a DB with the expected tables and seeded formats/genres; the name regex rejects invalid input without touching Postgres; `dropTenantDatabase` removes it; a seeding failure (forced via a targeted `Client.prototype.query` spy on the `INSERT INTO genres` call — a legitimate narrow stub for a hard-to-trigger error path, per swe-test-doubles) triggers the internal rollback, confirmed by checking `pg_database` directly |
| `seam/controlDb.seam.test.ts` | `controlDb.ts` ↔ real Postgres | bootstrap SQL is idempotent when re-applied to an already-provisioned database; `createUser`/`findUserByEmail` round-trip; the unique-email constraint surfaces a real Postgres error; session and admin-session create/find/delete round-trip. Each test gets its own scratch database and a fresh module load (`controlDb.ts` memoizes its `Pool` on `globalThis` to survive Next.js dev-mode hot reload, so the test file resets both the module registry and that `globalThis` cache between loads — see the file's doc comment) |
| `seam/tenantPrisma.seam.test.ts` | generated Prisma Client ↔ a DB built from `tenant-schema.sql` | a release/artist/pressing created through the *real* generated client is read back unchanged — the schema-drift gap: `schema.prisma` and `tenant-schema.sql` are maintained by hand and nothing else notices if they disagree. Deliberately narrower than `fakePrismaClient.contract.test.ts` (which exercises the same path as one half of a larger fake-vs-real comparison) — split out so the drift gap keeps its own owner even if the fake is ever removed |
| ~~`contract/discogs.contract.test.ts`~~ | our fixtures ↔ real Discogs API | ✅ done — see §2.2 |
| ~~`contract/fakePrismaClient.contract.test.ts`~~ | fake Prisma client ↔ real Prisma client | ✅ done — see §2.2 |

**Result**: 10 new seam tests, all green against real local Postgres via
`npm run test:integration`. Fixed a bug caught during this work, not before it: the
first version of `controlDb.seam.test.ts` called `pool.end()` on an already-ended pool
across test boundaries because `afterEach` closed the cached pool but never cleared
the `globalThis` reference — the next test's setup then tried to end it again. Fixed
by consolidating close-and-clear into one `resetControlDbGlobals()` helper used by
both `loadControlDb()` and `afterEach`. Also caught and fixed a pre-existing gap
unrelated to Phase 3: `PressingsForm.tsx`/`WishlistForm.tsx` had picked up a real
`useRouter()` call (for the "Search for Release on Discogs" feature) with no
component-test coverage for it and no `next/navigation` mock, silently breaking
`npm test` — fixed by adding the same `useRouter` mock `SearchForm.test.tsx` already
used, plus new tests for the Discogs-search-box behavior.

### 2.4 System integration test (layer 4) — ✅ done

One test, justified by two named gaps at once (Configuration, and emergent behavior of
assembly — see the system-integration skill's gap list):

- `system/registration.system.test.ts` — `registerUser` action + real `controlDb` +
  real `provisionTenant` + a real scratch control database *and* a real tenant
  database. Success path: a user row and a working tenant database both exist
  afterward, queryable for real through the real generated Prisma Client. Failure
  path: force `createTenantDatabase` to fail and assert the user row is genuinely gone
  from the real (scratch) control DB — not just that `deleteUser` was called (which
  `registerUser.test.ts` already covers at the unit level with a mock; this test
  proves the mock's assumption was correct).

This is deliberately the *only* layer-4 test in the initial plan. Everything else
smaller reduces to a chain of the seam tests above.

**Result**: `registerUser.ts`, `controlDb.ts`, and `provisionTenant.ts` are all
reloaded fresh together (`jest.resetModules()`) against a scratch control database, so
`registerUser.ts`'s own internal `import` of `controlDb.ts` resolves to the same
instance the test asserts against — the same technique `controlDb.seam.test.ts` uses
for itself, now shared via `test-support/db/controlDbGlobals.ts`. The failure path
couldn't use `jest.spyOn` on `createTenantDatabase` directly: this codebase's SWC
compilation makes named exports non-configurable, so spying threw "Cannot redefine
property." Forcing a real connection failure instead — pointing `DATABASE_URL` at an
unreachable address for just that one call, leaving `CONTROL_DATABASE_URL` untouched —
turned out to be both the workaround and arguably the more faithful test, since it's a
genuine Postgres-unavailable failure rather than a synthetic one. Both tests pass
against real Postgres, and cleanup leaves nothing behind (verified: no leftover
`vinyl_test_*` databases, no leftover rows in the real `vinyl_control`, since this
test's control-db operations never touch it — they're fully redirected to the scratch
database for the test's duration).

### 2.5 End-to-end tests (layer 5) — ✅ done

Built ahead of §2.4 (layer 4, still pending) at explicit request. Added Playwright
(`@playwright/test` + the Chromium binary) — nothing else in the repo ran a browser
before this. Seven journeys, each its own spec file, per the e2e skill's anchor rule —
broader than this plan's original three, covering every top-level user-facing flow
rather than just the highest-cost subset:

| Spec | Journey |
|---|---|
| `e2e/create-account.spec.ts` | Register → land in a working, empty collection |
| `e2e/view-collection.spec.ts` | Open the collection → see an existing pressing's details |
| `e2e/add-record.spec.ts` | Blank "Add a record" form → manually create a release + pressing → see it listed |
| `e2e/edit-record.spec.ts` | Edit an existing pressing → change reflected on the collection list |
| `e2e/add-to-wishlist.spec.ts` | Blank "Add to wishlist" form → manually create a release + wishlist item → see it listed |
| `e2e/view-wishlist.spec.ts` | Open the wishlist → see an existing item, with its "Add to Collection" link |
| `e2e/discogs-search-prefill.spec.ts` | Search Discogs → pick a result → Add to Collection → title/year/artist/cover image arrive prefilled |

Design decisions (see `DEVELOPER_GUIDE.md` §8.7 for the fuller version):

- **Each test registers its own throwaway account** (`e2e/support/testUser.ts`) rather
  than sharing one fixture user — costs a real tenant-database provision per test, but
  buys full isolation and avoids any cross-spec ordering.
- **Fixture data seeds directly through Prisma** (`e2e/support/db.ts`) for the three
  view/edit journeys, so they don't silently re-test the add flow that already has its
  own dedicated spec.
- **Cleanup by email domain**: every test account uses `@vinyl-test.local`;
  `e2e/global-teardown.ts` finds and drops all of them (tenant database + control-db
  row) after the run, re-scanning rather than tracking accounts created during the
  run, so it's self-healing across a crashed prior run too.
- **Serial execution** (`workers: 1`) — these share one Postgres instance and one
  rate-limited Discogs token; parallelizing would only buy flake.

Only `discogs-search-prefill.spec.ts` hits real Discogs; the rest hit a real local
Postgres via real tenant databases the tests provision and tear down themselves. All
seven passed against real Postgres and the real Discogs API on the first run, and
again on a clean re-run with zero leftover accounts or databases — see §4 for how this
layer is kept from blocking normal development.

---

## 3. Directory layout

```
test-support/                       # ✅ built
  fakes/
    fakePrismaClient.ts
    discogsServer.ts
    fixtures/
      search-kind-of-blue.json
      release-2825456.json
      master-5460.json
  db/
    scratchDatabase.ts

__tests__/
  actions/        # unchanged — layer 1
  api/            # unchanged — layer 1
  components/     # unchanged + new files — layer 2
  lib/            # unchanged + new files — layer 1
  seam/           # ✅ built — layer 3
  system/         # ✅ built — layer 4
  contract/       # ✅ built — fake-vs-real checks (run alongside layer 3)

e2e/                                 # ✅ built — layer 5, outside Jest entirely
  support/
    testUser.ts
    db.ts
  global-teardown.ts
  *.spec.ts

playwright.config.ts                 # ✅ built — repo root, alongside jest.config.ts
```

`test-support/` is deliberately not under `__tests__/` — it's shared infrastructure,
not itself a test, and keeping it out of `__tests__/**` means it can never be
accidentally picked up by `testMatch`.

---

## 4. Execution model

Two Jest configs, plus Playwright as a separate tool:

| Command | Config | Layers | Needs | When |
|---|---|---|---|---|
| `npm test` | `jest.config.ts` (unchanged) | 1–2 | nothing external | every save, every commit — stays exactly as fast/hermetic as today |
| `npm run test:integration` | `jest.integration.config.ts` (new) | 3–4 | local Postgres running (already a prerequisite) | before pushing; would become CI's post-submit stage |
| `npm run test:contract` | same integration config, `__tests__/contract/discogs.*` only | contract | `DISCOGS_TOKEN` + network | manually, or a scheduled job — never on every run, to respect the shared rate limit |
| `npm run test:e2e` | `playwright.config.ts` | 5 | local Postgres, `DISCOGS_TOKEN`; starts its own dev server if one isn't already running | before a release; on demand |

`jest.integration.config.ts` mirrors `jest.config.ts` but sets `testEnvironment: 'node'`,
`testMatch` scoped to `__tests__/{seam,system,contract}/**/*.test.ts`, and
`--runInBand` (these hit real Postgres by name; running them in parallel risks
port/name contention with no benefit — they're not numerous enough for parallelism to
matter). `test:integration` should exclude the Discogs contract test by default
(`--testPathIgnorePatterns=contract/discogs`), since that one specifically has an
external rate-limit cost the others don't.

**No CI pipeline exists yet** (no `.github/workflows`). This plan doesn't add one —
that's a reasonable next step once these tests exist, but is out of scope here. When
it's added, the natural split per the CI skill is: `npm test` presubmit-blocking,
`npm run test:integration` post-submit (with a Postgres service container), and
`test:contract`/`test:e2e` on a schedule rather than per-commit.

---

## 5. Maintenance

- **Fakes are owned, not abandoned.** Whoever changes `prisma/schema.prisma` or
  `tenant-schema.sql` updates `fakePrismaClient.ts` in the same change; whoever changes
  `lib/discogs.ts` or `discogsMapping.ts` updates the MSW fixtures. The two contract
  tests in §2.3 are the tripwire that catches it if this discipline lapses — treat a
  failing contract test as more urgent than a failing seam test, since it means the
  *other* tests built on that fake may now be lying.
- **Scratch databases clean up after themselves.** Every seam/system test wraps
  creation and teardown in `try`/`finally`; the `vinyl_test_` prefix makes any leftover
  from a crashed run identifiable. Worth a one-line `dropdb`-loop note in
  `DEVELOPER_GUIDE.md` for the rare manual cleanup.
- **Discogs contract test cadence:** run it whenever `discogsMapping.ts` changes, and
  otherwise monthly once there's a scheduler. A stale-but-passing contract test is
  worse than an absent one — it's presumed evidence the fake is still faithful.
- **E2E tests get a named owner and stay few.** Per the e2e skill, this is the
  fastest-rotting layer without one. Any bug an e2e test catches that a smaller test
  *could* have caught becomes a new unit/component/seam test at the lowest layer that
  reproduces it — the e2e suite doesn't grow to cover it too.
- **`DEVELOPER_GUIDE.md` §8.7 documents each layer's conventions as it landed**: the
  seam/system real-Postgres conventions (`controlDbGlobals.ts`, and the
  `jest.spyOn`-can't-stub-named-exports gotcha this codebase's SWC compilation causes)
  were added alongside §2.4; the e2e conventions alongside §2.5. No further follow-up
  pass is outstanding.

---

## 6. Rollout order

1. **Layer 1–2 gap-filling** (§2.1) — ✅ done. No new infrastructure, immediate value.
2. **Build the fakes** (§1, §2.2) — ✅ done. `fakePrismaClient.ts`, `scratchDatabase.ts`,
   the MSW Discogs server, `jest.integration.config.ts` + npm scripts, and both
   contract tests, verified green against real local Postgres and the real Discogs
   API. Pulled `scratchDatabase.ts` forward from Phase 3 into this phase, since
   `fakePrismaClient`'s own contract test needed a real proxy database to compare
   against — the original phase split didn't account for that dependency.
3. **Seam integration tests** (§2.3) — ✅ done. `provisionTenant.seam.test.ts`,
   `controlDb.seam.test.ts`, and `tenantPrisma.seam.test.ts` all green against real
   local Postgres.
4. **System integration test** (§2.4) — ✅ done. `registration.system.test.ts`, green
   against real Postgres, built after §2.5 rather than before it.
5. **End-to-end** (§2.5) — ✅ done, out of order, at explicit request ahead of §2.4.
   Playwright + seven journeys (broader than the original three), all green against
   real Postgres and real Discogs on both a first run and a clean re-run.

All five phases are now done. Each was independently useful and shippable on its own;
none blocked starting the next one early — as this out-of-order landing of §2.5 before
§2.4 demonstrates.
