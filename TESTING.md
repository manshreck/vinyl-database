# Testing

This project's test suite is organized into five layers plus a cross-cutting
contract-test category, following the house testing taxonomy from *Software
Engineering at Google* (chs. 11–14): **unit → component → seam integration → system
integration → end-to-end**. Each layer trades fidelity (how close to production the
test runs) against speed and determinism — target mix is roughly 80% unit+component /
15% seam / 5% system+end-to-end.

This document describes what's here: what each layer is for, what it covers in this
app, where it lives, and how to run it. For implementation conventions and gotchas
specific to writing a new test at a given layer, see `DEVELOPER_GUIDE.md` §8.7.

---

## 1. Test-double strategy: proxies vs. fakes

One decision shapes everything below: **the database and Discogs use different
doubling strategies, not the same one.** The database is doubled with a **proxy** (a
real, disposable instance — not a reimplementation); Discogs is doubled with a
**fake** (it's an external, rate-limited third party — there's no private instance to
proxy). See `swe-test-doubles` for the general preference ladder (real > proxy > fake
> stub > interaction test); this section is where the distinction matters most in this
codebase.

### 1.1 Discogs → fake (MSW), backed by a contract test

Discogs is external, rate-limited (60 req/min, shared across the whole app on one
token), and not ours to run in a test loop — the case the test-doubles skill describes
for "real one is slow/nondeterministic/external, many tests need one."

- **Fake**: `test-support/fakes/discogsServer.ts` — an [MSW](https://mswjs.io/) (Mock
  Service Worker) handler set standing in for `api.discogs.com`, backed by fixtures
  captured from real responses (`test-support/fakes/fixtures/*.json`, covering
  `/database/search`, `/releases/:id`, `/masters/:id`). Unrecognized ids 404 rather
  than silently returning nothing.
- **Contract test**: `__tests__/contract/discogs.contract.test.ts` replays the same
  fixtures against the real Discogs API, diffing response *shape* — field
  presence/types, not exact content — to catch Discogs changing its contract out from
  under `lib/discogsMapping.ts`. Not run on every pass; see §4.
- **Owner**: whoever last touched `lib/discogs.ts` or `lib/discogsMapping.ts` updates
  the fixtures in the same change.

### 1.2 Database → a proxy for seam/system tests; a fake only for unit tests

Per the test-doubles skill's preference ladder, a proxy beats a fake whenever a
disposable instance of the real thing is affordable to construct — and a scratch
PostgreSQL schema is exactly that: Postgres is already a project prerequisite,
creating and dropping a schema takes milliseconds, and there's no shared state to
make it nondeterministic. A fake would be strictly worse for the seam/system layer,
because the exact things those layers need to verify — that `prisma/schema.prisma`
and `prisma/tenant-schema.sql` haven't drifted, that `provisionTenant.ts`'s raw DDL
and dynamic `CREATE SCHEMA "${name}"` actually work, that the schema-name regex
actually rejects bad input — are real-Postgres behaviors a fake would have to
reimplement from assumptions rather than verify.

This app also makes tenant proxies unusually cheap and safe: the production
architecture already treats "one disposable schema per user" as normal (see
`DEVELOPER_GUIDE.md` §10), so creating and destroying a scratch tenant schema for a
test is the same operation the app performs on every real registration — which also
means the tests exercise the mechanism production actually uses, rather than a
stand-in for it. The control
plane is a shallower conceptual fit (there's exactly one of it in production, not
one-per-something), but mechanically it's proxied the same way: point `CONTROL_SCHEMA`
at a throwaway schema and let `controlDb.ts`'s own bootstrap SQL build it.

So:

- **Seam and system integration tests use a real, per-test proxy schema**
  (`test-support/db/scratchSchema.ts`) — not a fake. That module also provides scratch
  *databases*, used only where a test needs isolation a schema can't give: the
  whole-system backup discovers tenants by scanning for `vinyl_user_*` schemas, so it
  must not share a database with the developer's real ones.
- **A fake tenant-Prisma client exists for the unit layer** —
  `test-support/fakes/fakePrismaClient.ts` — for a different purpose: one
  owner-maintained, in-memory implementation of the handful of Prisma calls the app
  actually makes (`create`/`update`/`delete`/`findMany`/`findUnique`/`$transaction` on
  `pressing`/`release`/`artist`/`wishlistItem`, plus `format.findMany`/
  `genre.findMany`), replacing 13 near-identical ad hoc `jest.fn()` mocks that used to
  be duplicated across `__tests__/actions/*.test.ts`. This raises unit-layer fidelity
  (a real in-memory create-then-read, instead of a stub returning whatever was
  hardcoded) without claiming to close the seam gap. Anything outside the surface it
  implements throws immediately rather than guessing.
- **The fake is contract-tested against the real thing** —
  `__tests__/contract/fakePrismaClient.contract.test.ts` runs the same script of
  operations (create a release with artists, add a pressing, update it, delete it)
  against both the fake and a real scratch-DB-backed Prisma client, asserting they
  agree. This is what keeps the fake honest as the schema evolves.

---

## 2. The layers

### 2.1 Unit tests

One component, one operation, seams doubled. The base of the pyramid — roughly 80% of
the suite combined with component tests. Live in `__tests__/actions/`, `__tests__/api/`,
`__tests__/lib/`. Use `jest-environment-jsdom` by default; files testing server
actions/API routes override with a `@jest-environment node` docblock. Prisma calls are
doubled with either ad hoc `jest.fn()` mocks or `fakePrismaClient` (see §1.2); no
database connection is needed.

### 2.2 Component tests

Same hermeticity as unit tests (one component, seams doubled) but exercise multiple
operations of that component together, verifying a property no single operation
exhibits alone (a roundtrip, a stateful sequence, a lifecycle). Live in
`__tests__/components/`, rendered with `@testing-library/react` and driven with
`userEvent.setup()`. Most of this app's meaningful frontend tests are component tests
— e.g. `PressingsForm.test.tsx` covers the pale-red "not auto-populated" highlight
state clearing as fields are filled in, and the purchase-price-mirrors-into-current-
value behavior, both of which span multiple interactions on the same rendered form.

### 2.3 Seam integration tests

Exactly two real components, one real boundary between them, doubled everywhere else.
Closes the gap unit/component tests deliberately leave: a doubled seam is never
exercised for real anywhere else. Live in `__tests__/seam/`, run against a real local
Postgres via a per-test scratch schema.

| Test | Boundary | Covers |
|---|---|---|
| `provisionTenant.seam.test.ts` | `provisionTenant.ts` ↔ real Postgres | `createTenantDatabase` produces a DB with the expected tables and seeded formats/genres; the name regex rejects invalid input without touching Postgres; `dropTenantDatabase` removes it; a seeding failure triggers the internal rollback |
| `controlDb.seam.test.ts` | `controlDb.ts` ↔ real Postgres | bootstrap SQL is idempotent when re-applied to an already-provisioned database; `createUser`/`findUserByEmail` round-trip; the unique-email constraint surfaces a real Postgres error; session and admin-session create/find/delete round-trip; `updatePasswordHash` actually changes the stored hash |
| `tenantPrisma.seam.test.ts` | generated Prisma Client ↔ a DB built from `tenant-schema.sql` | a release/artist/pressing created through the real generated client is read back unchanged — covers schema drift between `schema.prisma` and `tenant-schema.sql`, which are maintained by hand |

### 2.4 System integration tests

More than two real components assembled, passing or failing on a logical (machine-
checkable) assertion — bigger than pairwise, but still deterministic and CI-runnable.
Justified only by a named gap smaller tests can't cover (configuration, behavior under
load, emergent behavior of assembly), not just "more confidence." Lives in
`__tests__/system/`.

| Test | Assembles | Covers |
|---|---|---|
| `registration.system.test.ts` | `registerUser` action + real `controlDb` + real `provisionTenant` + a real scratch control database + a real tenant database | Success path: a user row and a working, queryable tenant database both exist afterward. Failure path: forcing tenant provisioning to fail and asserting the user row is genuinely gone from the real control database — not just that a rollback function was called |
| `accountDeletion.system.test.ts` | `deleteAccount` action + real `controlDb` + real `provisionTenant` + a real scratch control database + a real tenant database | The inverse of registration: a successful deletion removes both the real user row and the real tenant database; an incorrect password leaves both genuinely intact |

### 2.5 End-to-end tests

A definite, named user journey, driven through the app's real entry points (the
browser UI), verified as a real user would experience it. The most expensive, slowest
layer — kept to a handful of journeys, each independently isolated. Uses
[Playwright](https://playwright.dev), configured at the repo root
(`playwright.config.ts`), living in `e2e/`.

| Spec | Journey |
|---|---|
| `create-account.spec.ts` | Register → land in a working, empty collection |
| `change-password.spec.ts` | Change password on `/account` → old password no longer works, new one does |
| `delete-account.spec.ts` | Delete account on `/account` → logged out, old credentials no longer work |
| `view-collection.spec.ts` | Open the collection → see an existing pressing's details |
| `add-record.spec.ts` | Blank "Add a record" form → manually create a release + pressing → see it listed |
| `edit-record.spec.ts` | Edit an existing pressing → change reflected on the collection list |
| `add-to-wishlist.spec.ts` | Blank "Add to wishlist" form → manually create a release + wishlist item → see it listed |
| `view-wishlist.spec.ts` | Open the wishlist → see an existing item, with its "Add to Collection" link |
| `discogs-search-prefill.spec.ts` | Search Discogs → pick a result → Add to Collection → title/year/artist/cover image arrive prefilled |

Each test registers its own throwaway account (`e2e/support/testUser.ts`) for full
isolation; the view/edit journeys seed fixture data directly through Prisma
(`e2e/support/db.ts`) rather than re-driving the add flow those journeys already cover
separately. `e2e/global-teardown.ts` removes every `@vinyl-test.local` account (and its
tenant database) after the run. Only `discogs-search-prefill.spec.ts` hits the real
Discogs API; the rest hit a real local Postgres via real tenant databases the tests
provision and tear down themselves.

### 2.6 Contract tests

Not one of the five pyramid layers by size, but a distinct category that runs
alongside seam tests: proves a fake agrees with the real thing it stands in for,
since a fake can't detect its own drift. Live in `__tests__/contract/`.

| Test | Verifies |
|---|---|
| `discogs.contract.test.ts` | The MSW fixtures' response shape still matches the real Discogs API (§1.1) |
| `fakePrismaClient.contract.test.ts` | `fakePrismaClient` produces the same results as the real generated Prisma Client for the same script of operations (§1.2) |

---

## 3. Directory layout

```
test-support/                       # shared test infrastructure, not itself a test
  fakes/
    fakePrismaClient.ts
    discogsServer.ts
    fixtures/
      search-kind-of-blue.json
      release-2825456.json
      master-5460.json
  db/
    scratchSchema.ts
    controlDbGlobals.ts

__tests__/
  actions/        # layer 1 (unit)
  api/            # layer 1 (unit)
  components/     # layer 2 (component)
  lib/            # layer 1 (unit)
  seam/           # layer 3 (seam integration)
  system/         # layer 4 (system integration)
  contract/       # fake-vs-real checks (§2.6)

e2e/              # layer 5 (end-to-end), outside Jest entirely
  support/
    testUser.ts
    db.ts
  global-teardown.ts
  *.spec.ts

playwright.config.ts                 # repo root, alongside jest.config.ts
```

`test-support/` is deliberately not under `__tests__/` — it's shared infrastructure,
not itself a test, and keeping it out of `__tests__/**` means it can never be
accidentally picked up by `testMatch`.

---

## 4. Running the tests

Two Jest configs, plus Playwright as a separate tool:

| Command | Config | Layers | Needs |
|---|---|---|---|
| `npm test` | `jest.config.ts` | 1–2 (unit, component) | nothing external |
| `npm run test:integration` | `jest.integration.config.ts` | 3–4 (seam, system) | local Postgres running |
| `npm run test:contract` | same integration config, `__tests__/contract/discogs.*` only | contract | `DISCOGS_TOKEN` + network |
| `npm run test:e2e` | `playwright.config.ts` | 5 (end-to-end) | local Postgres, `DISCOGS_TOKEN`; starts its own dev server if one isn't already running |

`jest.integration.config.ts` mirrors `jest.config.ts` but sets `testEnvironment:
'node'`, scopes `testMatch` to `__tests__/{seam,system,contract}/**/*.test.ts`, and
runs `--runInBand` (these hit real Postgres by name; parallelizing risks port/name
contention with no benefit). `test:integration` excludes the Discogs contract test by
default (`--testPathIgnorePatterns=contract/discogs`), since that one specifically
costs a real request against the shared rate-limited token.

### Cadence

**For now** (see the CI note below):

- **Run `npm test` often** — whenever you change a component or the code it depends
  on, and before every commit. It's fast and needs nothing external, so there's no
  reason not to.
- **Run the integration tiers on demand only**: `npm run test:integration` before
  pushing a change that touches `controlDb.ts`, `provisionTenant.ts`, the Prisma
  schema, or registration; `npm run test:contract` when `lib/discogs.ts` or
  `discogsMapping.ts` changes (or periodically, as a schedule); `npm run test:e2e`
  before a release, or when a change plausibly affects one of the journeys in §2.5.

**CI note**: no CI pipeline exists yet for this project. Once one is set up, CI — not
this document — becomes the authority on what runs when (presubmit vs. post-submit vs.
scheduled), and the cadence guidance above stops being manual discipline and becomes
CI configuration. The natural split, per the CI skill: `npm test` presubmit-blocking,
`npm run test:integration` post-submit (with a Postgres service container), and
`test:contract`/`test:e2e` on a schedule rather than per-commit. Until that exists,
follow the cadence guidance above by hand.

---

## 5. Maintenance

- **Fakes are owned, not abandoned.** Whoever changes `prisma/schema.prisma` or
  `tenant-schema.sql` updates `fakePrismaClient.ts` in the same change; whoever
  changes `lib/discogs.ts` or `discogsMapping.ts` updates the MSW fixtures. The two
  contract tests (§2.6) are the tripwire that catches it if this discipline lapses —
  treat a failing contract test as more urgent than a failing seam test, since it
  means the *other* tests built on that fake may now be lying.
- **Scratch databases clean up after themselves.** Every seam/system test wraps
  creation and teardown in `try`/`finally`; the `vinyl_test_` prefix makes any
  leftover from a crashed run identifiable and safe to drop by hand.
- **Discogs contract test cadence:** run it whenever `discogsMapping.ts` changes, and
  otherwise periodically. A stale-but-passing contract test is worse than an absent
  one — it's presumed evidence the fake is still faithful.
- **End-to-end tests get a named owner and stay few.** This is the fastest-rotting
  layer without one. Any bug an e2e test catches that a smaller test *could* have
  caught becomes a new unit/component/seam test at the lowest layer that reproduces
  it — the e2e suite doesn't grow to cover it too.
- **Implementation conventions and gotchas** for writing a new test at any of these
  layers (mocking patterns, the seam/system module-reload technique, a `jest.spyOn`
  limitation this codebase's SWC compilation causes) live in `DEVELOPER_GUIDE.md`
  §8.7, not here — this document stays focused on what exists and how to run it.
