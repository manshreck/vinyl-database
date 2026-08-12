# Plan: a mobile app alongside the web interface

Status: **plan only — nothing here has been executed.** No code changes accompany
this document.

Target: an Android app running against the local backend first, iOS later, with the
web interface continuing unchanged throughout.

## 1. The governing insight: this is additive layering, not a rewrite

The obstacle is specific and narrow. This app's mutation model is **Next.js Server
Actions** — an RPC protocol private to Next/React. A mobile app cannot call them;
their wire format is not a public contract. And most pages fetch data by querying
Prisma directly inside React Server Components, which mobile likewise cannot reach.

But the obstacle is thin. Measured, not assumed:

- **All 18 server actions total 602 lines.** They are already adapters: parse
  FormData, call into `lib/` (releaseIntake, provisionTenant, controlDb, the
  exporters), redirect. The business logic mostly *already lives below them*.
- **Sessions are already bearer-shaped.** The session token is an opaque random
  256-bit value, stored server-side as a SHA-256 hash with a 30-day TTL
  (`lib/session.ts`). Only the *transport* is web-specific — one `cookies()` read.
  Accepting the same token via an `Authorization: Bearer` header is a small,
  contained change that reuses the entire existing session machinery, including
  revocation on logout and account deletion.
- **The domain shapes serialize.** `ReleaseHoldings`, the export summaries, the
  Discogs prefill values — all were already flattened to JSON-safe primitives to
  cross the server-action boundary. They can cross an HTTP boundary unchanged.
- **Three JSON endpoints already exist** (`/api/artists/search`,
  `/api/releases/search`, `/api/discogs/cover-image`) and demonstrate the pattern.

So the architecture move is: extract the action bodies into an explicit **service
layer**, then give that layer two thin transports — the existing server actions for
the web, and JSON route handlers for mobile. The web UI, the database layer, the
tenancy model, the exports and the admin backup are untouched.

```
   Web browser                        Mobile app (Android, then iOS)
       │                                   │
   RSC pages + Server Actions          /api/v1/* route handlers
   (cookie session)                    (bearer session, same table)
       └───────────────┬───────────────────┘
                lib/services/*  ← single source of truth
                       │
        lib/* (releaseIntake, exporters, discogs, prisma, controlDb)
                       │
              PostgreSQL (schema-per-tenant)
```

Two transports over one service layer is deliberately *not* the same as two
implementations. The adapters must stay dumb — parse, call, serialize — so the
duplicate-detection dance, the wishlist-clearing rules, and every other behavior
exists exactly once.

## 2. Verified findings (probed 2026-08-07)

1. **Barcode → exact pressing works.** Discogs'
   `/database/search?barcode=<EAN>` returned the precise 2018 Moon Safari pressing
   from a barcode taken from this collection's own data. Mobile's camera makes this
   the feature the web version structurally cannot have: scan a record in a shop →
   "you own this pressing" / "it's on your wishlist" / one-tap add — riding directly
   on the duplicate-detection machinery that already exists.
2. **Actions are thin** (602 lines / 18 actions) — the extraction in Phase 1 is
   mostly moving code, not disentangling it.
3. **The session store is transport-agnostic** — bearer support does not require a
   second auth system, new tables, or JWTs.

## 3. Decision points

Each needs an answer before the phase that consumes it; recommendations included.

### D1. Mobile framework — blocks Phase 5

| Option | For | Against |
|---|---|---|
| **Expo / React Native** (recommended) | One TypeScript codebase for Android *and* iOS; shares types and pure domain logic with the backend via a workspace package; camera/barcode modules are mature; OTA updates shrink the versioning problem (D6) | A second app to maintain; native look requires effort |
| Capacitor (web app in a shell) | Days of work, not weeks; zero duplicated UI | It *is* the web UI — no offline, webby feel, camera integration clunkier; iOS review can be hostile to thin wrappers |
| PWA only | Nearly free — the responsive site installed to the home screen | Not what was asked; iOS PWA support is limited; no barcode-grade camera access |
| Native Kotlin + Swift | Best-in-class feel | Two codebases, zero code sharing with the TS domain — unjustifiable solo |

The stated Android-now-iOS-later path is precisely what Expo exists for. PWA is
worth noting as a zero-cost stopgap while phases 1–4 land, since they are all
backend work.

### D2. API style — ~~blocks Phase 3~~ **DECIDED**

Plain **REST + JSON**, with **zod** validating the boundary.

REST over tRPC or GraphQL. tRPC's type-sharing win is achievable more simply with a
shared types package (D3) given both ends are TS; GraphQL's flexibility solves
problems this app doesn't have, and its caching story is not worth buying for a
collection this size. REST keeps the API curl-able, testable with the existing
patterns, and legible to a future non-TS client. It also expresses the one genuinely
awkward interaction — the duplicate-confirmation dance — as `409` carrying
`ReleaseHoldings`, which a query language would have made harder rather than easier.

**zod at the `/api/v1` boundary only**, for request bodies and query params.

The reasoning that settled it: Phase 3 needs a second set of parsers no matter what.
`app/actions/formInput.ts` turns `FormData` — all strings — into typed inputs, and
JSON arrives already typed, so none of it is reusable. The choice was never "extra
machinery vs. none", only what the new parsers are written in. Hand-rolling leaves
each input type with a TypeScript type *and* two independent parsers that must agree
with it; with zod the schema **is** the type via `z.infer`, so the runtime check and
the compile-time type cannot drift. Phase 5 would otherwise write the same validation
a third time in the app.

Two boundaries this deliberately does **not** cross:

- **`app/actions/formInput.ts` stays hand-rolled.** It is tested and it works, and
  rewriting it buys nothing. New code at the API boundary uses zod; the form parsers
  are left alone.
- **Services keep their plain TypeScript input types.** Schemas are written to
  produce exactly those types, so a schema that drifts from `PressingDetailsInput`
  is a compile error rather than a runtime surprise. Services stay free of any
  validation library, matching the Phase 1 rule that they import nothing from a
  transport.

The concrete defect this closes: `parseReleaseSelection` relies on `Number(null)`
being `0`, so an absent `originalReleaseYear` becomes year **0**. On the web the
form's `required` attribute masks it; an API has nothing in that spot. Pinned as
known-wrong in `__tests__/actions/formInput.test.ts`, to be rejected outright at the
API boundary.

`zod` is not yet a dependency — Phase 3 adds it.

### D3. Repository layout — blocks Phase 4

| Option | Shape | Trade |
|---|---|---|
| **npm workspaces monorepo** (recommended) | `apps/web` (the current app, moved), `apps/mobile`, `packages/shared` | One-time churn: every doc path reference, scripts, tsconfig; done at the *start* of mobile work, not before |
| Additive dirs | Next app stays at root; `mobile/`, `shared/` beside it | No churn now; permanently untidy; root package.json serves two masters |
| Two repos | Full separation | Kills type/domain sharing, the main reason Expo wins D1 |

The shared package carries: API types + zod schemas, `discogsMapping`'s pure
helpers, `artistSort`, condition-label maps, `recordDetails` formatting — everything
both UIs must agree on.

### D4. Auth transport & lifetime — ~~blocks Phase 2~~ **DECIDED, implemented**

Same sessions table, token accepted from `Authorization: Bearer` as well as the
cookie; a JSON login endpoint returns the raw token once; mobile stores it in the
platform keystore (Expo SecureStore). No JWTs — the server-side hash lookup
already provides revocation, which JWTs would take away.

Resolved sub-decisions:

- **Lifetime is per-transport**, recorded in a new `sessions.origin` column. Web
  keeps a fixed 30 days; mobile gets a 30-day window that **slides**, renewed on
  use but at most once a day. A long *fixed* mobile TTL was rejected: it buys
  "never signs out" at the price of a token on a lost phone staying valid for its
  whole term, where sliding gives indefinite life to an active device and 30 days
  from last use to an idle one. See DEVELOPER_GUIDE §10.
- **Registration stays web-only.** It provisions a tenant schema and happens once
  per user; there is no endpoint for it.
- **Admin stays web-only.**

One thing this phase turned up that the plan had not anticipated: `proxy.ts` gated
every route on *cookie presence*, so a bearer request was redirected to `/login`
before reaching any handler. `/api` is now excluded from the matcher — the handlers
all authenticate themselves and return 401 JSON, so this removed redundancy rather
than a check, and a redirect to an HTML page was never a useful answer for a
programmatic caller anyway.

### D5. Offline scope — blocks Phase 5

| Level | Cost | Verdict |
|---|---|---|
| Online-only | none | Acceptable floor |
| **Read-through cache** (recommended) | small | The record-store use case — "do I own this?" with one bar of signal — is the whole point of mobile; cache the last-fetched collection, serve it stale with a banner when offline |
| Full offline CRUD + sync | very large (conflicts, queues, merge UX) | **Out of scope.** Revisit only with evidence of need |

### D6. API compatibility stance — blocks Phase 3

**Revised.** The first draft said an installed build binds the API forever and that
removal is a v2 event. That over-rotates, and it contradicts D1, which credits Expo's
OTA updates with shrinking exactly this problem. Both cannot hold at full strength.

Applying the ownership test honestly: we *cannot* change both sides in one commit, but
we very much *can* make the caller upgrade — it is our own phone. That is a
**reachability** problem, not an ownership one, and the discipline scales to how long
a stale install survives and what it does while stale:

| Surface | Stance |
|---|---|
| Response shapes a stale build reads offline — the cached collection, the error envelope, the `409` body | The real commitment. A client that cannot reach us cannot be told we changed |
| Interactive mutations and Discogs proxies | Coordinated two-step change is fine: ship the server, ship the client |

So: keep the `/api/v1/` path (cheap, and right if this ever grows an audience), keep
additive-as-default, and drop "removal is a v2 event" in favour of a coordinated
upgrade for as long as every install sits on a device we control.

**Stability starts at the first install on a device we do not own.** Until then this
is `0.x` semantics wearing a `v1` path — which is fine, and worth naming, because the
moment it stops being true should be a date somebody can point at. From that date the
full versioning discipline applies: major only for breaking changes, previous version
running for a published window, notice before the change, migration path provided.

Hyrum's Law still applies to the offline-consumed shapes with teeth. It does not apply
equally to all fourteen endpoints, which is what the first draft got wrong.

### D7. Mobile v1 feature cut — blocks Phase 5

Recommended v1: login · collection list/filter/search · pressing detail · wishlist
list · Discogs search → add flow *with the duplicate dialogs* · barcode scan (it is
the reason mobile exists, and D1's choice makes it cheap). Deferred: account
management, exports (a `.sql` download on a phone has no obvious home; share-sheet
later), admin, registration, release editing.

### D8. API error envelope — blocks Phase 3

One JSON error shape everywhere:

```json
{ "error": { "code": "invalid_credentials",
             "message": "Incorrect email or password.",
             "action": "update_token" } }
```

`code` is machine-readable and stable; `message` is written for the end user (see
swe-error-messages); `action` is optional and names an affordance the client can
offer. The `DiscogsApiError` flags (`unauthorized`, `rateLimited`) already model
this — the envelope is their generalization, and the mobile UI branches on `code`,
never on prose.

**Dropped from the first draft: a per-error `retryable` boolean.** It reads as
obviously useful and is a promise kept forever for no gain. It is also ambiguous — is
a `401` retryable? After re-authenticating, yes; immediately, no — so the field would
have to encode *when*, which is the client's decision anyway. Retryability is derivable
from status class (`5xx`, `429`) on the client. The skill's rule: anything you specify,
you must keep.

`code` values are themselves published contract. Adding one is additive; renaming or
removing one is breaking.

**This was not honoured by the first endpoint that shipped.** `POST/DELETE/GET
/api/v1/auth/session` (commit `606af93`) returns a bare `{ "error": "..." }` string
from all five failure paths, and a system test pins that shape. Nothing consumes it
yet, so the fix is one route file and one test; after the Expo login screen is built
it is a breaking change to the flow that gates everything else. **Retrofitting it is
the first task of Phase 3, before any new endpoint.**

### D9. Mobile e2e tooling — blocks Phase 6 verification

Maestro (recommended: YAML flows, low setup, fine for a solo project) vs Detox
(more powerful, much heavier). Either way the e2e layer stays small per
TESTING.md; the heavy lifting moves down the pyramid via API contract tests.

## 4. Phases

Each phase leaves `main` shippable; web behavior is unchanged through Phase 4.

- **Phase 1 — service extraction. ✅ Done.** Move action bodies to `lib/services/*` taking
  typed params; actions become FormData-parsing adapters. Pure refactor: the
  existing 400+ unit tests must pass unmodified or with mechanical mock-path
  updates only. This phase is worth doing even if mobile never happens.
- **Phase 2 — bearer transport. ✅ Done.** `getSession()` checks the `Authorization`
  header before the cookie; `POST /api/v1/auth/session` (login → token), `DELETE`
  (logout), `GET` (whoami); `sessions.origin` plus the per-transport lifetime policy
  from D4; `/api` excluded from `proxy.ts`. Note: the token path is inherently
  CSRF-immune — no cookie, no cross-site ambient credential.
- **Phases 3 and 5 — the API and the app, interleaved.** The original plan built all
  of §5, then typed it in Phase 4, then wrote the client in Phase 5. That ordering is
  precisely how a surface gets derived from services instead of screens, which is the
  mistake §5 has now been cut to undo. Bloch's rule is to write code against an API
  before implementing it, and D6 establishes that the contract is not load-bearing
  until an install exists — so build each endpoint against the screen that needs it:

  1. **Retrofit the auth endpoint to the D8 envelope** (see D8). Before anything new.
  2. `GET /api/v1/pressings` → Expo skeleton, login, collection browse.
  3. `GET /api/v1/wishlist` → wishlist screen.
  4. `GET /api/v1/discogs/search` + `/releases/:id` → barcode scan and add-flow prefill.
  5. `POST /api/v1/pressings` with the `409` dance → the add flow and duplicate dialogs.
  6. The two judgment-call endpoints, if their screens turn out to want them.

  Throughout: zod at the boundary, the D8 envelope from every handler, the §5.1
  contract obligations, and **API contract tests** at the system layer — real
  handlers, scratch schemas, asserting the JSON shapes mobile compiles against.
- **Phase 4 — monorepo + shared package** (D3). Mechanical. Do it when the screens
  stop moving and the shapes are worth freezing, not before.
- **Phase 6 — iOS + polish.** Same codebase via EAS build (requires the $99/yr
  Apple developer account); Maestro flows for the journeys; share-sheet export if
  wanted.

## 5. API surface inventory

Every row below answers *who calls this, for what, and what breaks if it is absent* —
and rows that could not answer are cut. An earlier draft of this table derived the
surface from the web pages and the service functions, which is how a schema gets
published by accident. **Cut is not "never": each deferred row is additive later at
near-zero cost, which is the whole reason to leave it out now.**

### v1 — ships in Phase 3

| Caller / use case | Endpoint |
|---|---|
| App login, logout, boot-time token check | `POST` / `DELETE` / `GET /api/v1/auth/session` |
| Collection browse + D5 offline cache | `GET /api/v1/pressings` — whole collection, counts in the envelope |
| Pressing detail, deep link, single refresh | `GET /api/v1/pressings/:id` |
| Add a record, incl. the duplicate dance | `POST /api/v1/pressings` → `201`, or `409` carrying `ReleaseHoldings` |
| Wishlist browse | `GET /api/v1/wishlist` |
| Barcode scan and title search | `GET /api/v1/discogs/search?q=` **or `?barcode=`** |
| Add-flow prefill | `GET /api/v1/discogs/releases/:id` |

Judgment calls — decide from the screen when Phase 5 reaches it, not from the service:

| Use case | Endpoint | Note |
|---|---|---|
| "Scan it in the shop, want it later" | `POST /api/v1/wishlist` | D7 says wishlist *list* only; this is a genuine mobile flow |
| "Bought the record I was hunting" | `POST /api/v1/wishlist/:id/add-to-collection` | Avoids re-entering pressing details — but `POST /pressings` already clears an identical wishlist entry transactionally, so not strictly required |

### Deferred — not in v1

| Endpoint | Why not |
|---|---|
| `PATCH` / `DELETE /api/v1/pressings/:id` | Editing is not in D7's feature cut. Also mis-specified: `updatePressing` replaces *every* field, which is `PUT` semantics — a `PATCH` omitting `notes` would null it. Redesign before exposing |
| `PATCH` / `DELETE /api/v1/wishlist/:id` | Not in D7 |
| `PATCH /api/v1/releases/:id` | D7 defers release editing outright. `UpdateReleaseInput` also carries `renames: Rename[]` — the web form's shape, not a resource contract |
| `GET /api/v1/summary` | No caller of its own. The counts ride in the `GET /pressings` envelope; a client holding the cached list can also compute them |
| `GET /api/v1/me` | Duplicate of `GET /api/v1/auth/session`, which already ships and returns the same fields. Two names for one concept |
| Moving `/api/artists/search`, `/api/discogs/cover-image` under `/api/v1/` | Called only by web form components in this repo — one commit changes both sides, so they are *internal* interfaces needing no version ceremony. Mobile v1's add flow is Discogs-driven with no editing and needs neither |
| `/api/releases/search` | Has no caller anywhere in the app; only its own test references it. Publishing it would promote dead code to a permanent commitment. Delete or leave, but do not version |

**No thin aliases.** An earlier draft kept the original search routes alongside
versioned copies "until web migrates". That doubles the surface — two URLs, both
supported forever — to serve callers that already work. Internal routes stay internal
and unversioned.

**No `?page=`.** The earlier draft promised "pagination parity with the pages", which
cannot exist: `app/pressings/page.tsx` loads the whole collection, sorts it in memory
with `artistSortKey` (an app-level collation Postgres cannot reproduce — see
DEVELOPER_GUIDE §7 on filing artists), then slices. Server-side offset paging would
force the sort into SQL, which those rules forbid. D5's read-through cache wants the
whole collection in one fetch anyway. Additive later if a screen ever demands it; the
same goes for the `artistId` / `formatId` / `genreId` filters, which a client holding
the full list can apply locally.

The `409 + ReleaseHoldings` pattern is the existing confirm-dance made honest in
HTTP: same shape, same semantics, one service underneath. Its contract needs three
things written down that the code does not currently state — see §5.1.

### 5.1 Contract obligations for Phase 3

Settled before the endpoints are written, because each becomes contract on first
install:

- **`confirmDuplicate` means "proceed past whatever collides at execution time", not
  "I accept the collision you showed me."** Holdings can change between the `409` and
  the retry. Document it in exactly those words; tightening it (echo the observed
  `releaseId`, re-`409` if holdings moved) is optional and probably unnecessary for a
  single-user collection.
- **A confirmed create is not idempotent.** If the response is lost and the client
  retries, the bypass flag rides along and a second pressing is written — and
  bad-signal-in-a-record-store is the stated environment. Either accept an
  `Idempotency-Key` header on `POST /pressings` and `POST /wishlist/:id/add-to-collection`,
  or publish the client rule ("re-`GET` before retrying a confirmed create").
- **Money crosses as a decimal string**, never a JSON number. Output already behaves:
  Prisma `Decimal` serializes to `"12.99"`. Note it *normalizes* — `0.10` becomes
  `"0.1"` — so the contract is "normalized decimal string", or the boundary formats to
  fixed precision on purpose. Input types are currently `number | null` and must become
  strings at the API boundary.
- **`purchaseDate` is date-only**: `"YYYY-MM-DD"`, not an ISO datetime, which invites
  off-by-one drift across a phone's timezone.
- **`recordCondition` / `sleeveCondition` are unvalidated today** — cast `as never`
  into Prisma enums, with the web `<select>` as the only guard. Same defect class as
  the `Number(null)` year-zero bug. zod owns them at the boundary and the accepted
  values become published contract, so enumerate them deliberately.
- **`404` vs `500`:** `updatePressing`/`deletePressing` throw Prisma `P2025` for a
  missing id while `addWishlistItemToCollection` returns `not_found`. Handlers map
  `P2025` to `404` uniformly, and every status code gets a documented postcondition.
- **Tenant scoping is the authorization precondition.** Handlers obtain the Prisma
  client from `session.databaseName`, never from anything client-supplied.
  Schema-per-tenant makes BOLA structurally hard, but the invariant currently lives in
  a code comment; Phase 3 adds a contract test that a valid token for tenant A cannot
  address tenant B's ids.

## 6. Local development topology (Android phase)

- Backend on the Mac as today. Device access either by LAN IP or — cleaner —
  `adb reverse tcp:3000 tcp:3000` over USB, which makes `localhost:3000` on the
  device reach the Mac and sidesteps Android's default cleartext-HTTP block for
  non-localhost hosts.
- Native apps do not enforce CORS; no CORS work needed for the RN path. (Capacitor
  or PWA would need it — one more reason D1 matters early.)
- **Reality check:** a mobile app is only useful beyond the couch once the backend
  is deployed on public HTTPS (iOS ATS requires TLS outright). Off-LAN usefulness
  therefore depends on executing `DEPLOYMENT.md` — mobile does not add hosting
  requirements beyond it, but it does make deployment load-bearing.

## 7. Testing strategy additions

The five-layer pyramid extends rather than changes:

- Service extraction re-points existing action unit tests at services (or leaves
  them on actions as integration-through-the-adapter — decide during Phase 1 by
  whichever keeps them mechanical).
- **API contract tests** become the seam between repo halves: system-layer tests
  run real handlers against scratch schemas and pin the JSON shapes; the mobile
  app's tests run against recorded fixtures of those same shapes; the contract
  tests are what keep the fixtures honest — the exact Discogs-fake pattern from
  TESTING.md §1.1, now applied to our own API.
- Mobile UI: RN Testing Library at the component layer; a handful of Maestro
  journeys (D9) at the top.

## 8. Rejected alternatives

- **Rewriting the web UI to consume the API** ("eat your own dogfood"): uniform,
  but discards a working RSC model for symmetry's sake. Drift risk between the two
  transports is real but is addressed where it belongs — by keeping adapters dumb
  and logic in one service layer — not by rewriting a client that isn't broken.
- **GraphQL / tRPC**: see D2.
- **Offline-first sync**: see D5. The cost is a different order of magnitude from
  everything else in this plan.
- **Wrapping the web app and calling it done**: viable fallback (D1), but it
  forfeits the barcode scanner — the one capability that makes mobile more than a
  smaller screen.
