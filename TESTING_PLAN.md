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

**Current state:** 166 tests, 25 files, all layer 1 (unit) or layer 2 (component). Zero
seam, system, or end-to-end tests. Full findings are in the conversation that preceded
this plan; this document doesn't repeat the inventory, only the resulting work.

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

### 2.2 Test-double infrastructure (§1 above)

- `test-support/fakes/fakePrismaClient.ts`
- `test-support/fakes/discogsServer.ts` + `test-support/fakes/fixtures/*.json`
- `test-support/db/scratchDatabase.ts` — `createScratchDatabase()` /
  `dropScratchDatabase(name)` helpers wrapping `provisionTenant.ts`'s own
  `generateDatabaseName`-style pattern, used by seam/system tests below. Database
  names get a `vinyl_test_` prefix (distinct from `vinyl_user_`) so a crashed run's
  leftovers are trivially identifiable and safe to sweep.

### 2.3 Seam integration tests (layer 3 — new)

Each test names exactly two real components and the one boundary between them, per
the seam-testing skill.

| Test | Boundary | Covers |
|---|---|---|
| `seam/provisionTenant.seam.test.ts` | `provisionTenant.ts` ↔ real Postgres | `createTenantDatabase` produces a DB with the expected tables and seeded formats/genres; the name regex rejects invalid input; `dropTenantDatabase` removes it; a seeding failure triggers the internal rollback (the DB it just created gets dropped) |
| `seam/controlDb.seam.test.ts` | `controlDb.ts` ↔ real control DB | bootstrap SQL is idempotent against a fresh DB; `createUser`/`findUserByEmail` round-trip; the unique-email constraint surfaces a real Postgres error; session and admin-session create/find/delete round-trip |
| `seam/tenantPrisma.seam.test.ts` | generated Prisma Client ↔ a DB built from `tenant-schema.sql` | a release/artist/pressing created through the *real* generated client can be read back — this is the schema-drift gap: `schema.prisma` and `tenant-schema.sql` are maintained by hand today and nothing currently notices if they disagree |
| `contract/discogs.contract.test.ts` | our fixtures ↔ real Discogs API | fixture responses still match Discogs' real shape (see §1.1) |
| `contract/fakePrismaClient.contract.test.ts` | fake Prisma client ↔ real Prisma client | the fake agrees with reality for the operations it implements (see §1.2) |

### 2.4 System integration test (layer 4 — new)

One test, justified by two named gaps at once (Configuration, and emergent behavior of
assembly — see the system-integration skill's gap list):

- `system/registration.system.test.ts` — `registerUser` action + real `controlDb` +
  real `provisionTenant` + real scratch control *and* tenant databases. Success path:
  a user row and a working tenant database both exist afterward, queryable for real.
  Failure path: force `createTenantDatabase` to fail and assert the user row is
  genuinely gone from the real control DB — not just that `deleteUser` was called
  (which `registerUser.test.ts` already covers at the unit level with a mock; this
  test proves the mock's assumption was correct).

This is deliberately the *only* layer-4 test in the initial plan. Everything else
smaller reduces to a chain of the seam tests above.

### 2.5 End-to-end tests (layer 5 — new tooling)

Requires adding Playwright (`@playwright/test`) — nothing in the repo runs a browser
today. Three journeys, chosen by what a failure would actually cost, per the e2e
skill's anchor rule:

1. `e2e/register-and-add-record.spec.ts` — *register → manually add a record → see it
   on the collection page.* The core value proposition, end to end.
2. `e2e/discogs-search-and-prefill.spec.ts` — *search Discogs → Add to Collection →
   title/year/color/cover image arrive prefilled.* The feature area with the most
   accumulated complexity this project has seen, and the one that's been verified by
   hand repeatedly.
3. `e2e/edit-pressing.spec.ts` — *log in → edit a pressing → updated values reflected
   on the list.* Exercises the update path and session auth together.

These hit real Discogs (journey 2) and a real database, so they're the slowest, most
expensive layer — see §4 for how they're kept from blocking normal development.

---

## 3. Directory layout

```
test-support/
  fakes/
    fakePrismaClient.ts
    discogsServer.ts
    fixtures/
      search-kind-of-blue.json
      release-11664327.json
  db/
    scratchDatabase.ts

__tests__/
  actions/        # unchanged — layer 1
  api/            # unchanged — layer 1
  components/     # unchanged + new files — layer 2
  lib/            # unchanged + new files — layer 1
  seam/           # new — layer 3
  system/         # new — layer 4
  contract/       # new — fake-vs-real checks (run alongside layer 3)

e2e/              # new — layer 5, outside Jest entirely
  playwright.config.ts
  *.spec.ts
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
| `npm run test:e2e` | `e2e/playwright.config.ts` | 5 | local Postgres, `DISCOGS_TOKEN`, dev server running | before a release; on demand |

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
- **`DEVELOPER_GUIDE.md` §8.7 gets a follow-up pass** once this lands, documenting the
  fake/scratch-DB conventions the way it currently documents the mock-Prisma
  convention — not part of this plan, but flagged here so it isn't forgotten.

---

## 6. Rollout order

1. **Layer 1–2 gap-filling** (§2.1) — no new infrastructure, immediate value.
2. **Build the fakes** (§1, §2.2) — `fakePrismaClient.ts` and the MSW Discogs server,
   plus their contract tests.
3. **Seam integration tests** (§2.3) — `scratchDatabase.ts` helper, then the three
   Postgres seam tests and the Discogs contract test.
4. **System integration test** (§2.4) — the registration-flow test, once the seam
   layer it's built from already exists and is green.
5. **End-to-end** (§2.5) — add Playwright, then the three journeys, last — the most
   expensive layer, and the one that most benefits from everything below it already
   being solid.

Each phase is independently useful and shippable; none blocks starting the next one
early if there's a specific reason to.
