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

### D2. API style — blocks Phase 3

Plain **REST + JSON** (recommended) over tRPC or GraphQL. tRPC's type-sharing win is
achievable more simply with a shared types package (D4) given both ends are TS;
GraphQL's flexibility solves problems this app doesn't have. REST keeps the API
curl-able, testable with the existing patterns, and legible to a future non-TS
client. Input validation is currently light hand-rolling inside actions; a public
API raises the bar — adopting **zod** schemas (shared with mobile for client-side
validation) is part of this decision.

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

### D6. API compatibility stance — blocks Phase 3, binds forever after

The moment a mobile build ships anywhere (even one test device), the API has a
client that updates out-of-band. Version the path (`/api/v1/`), make changes
additive-only within v1, and treat removal as a v2 event. Hyrum's Law applies with
teeth: an installed app is the consumer you cannot fix in the same commit.

### D7. Mobile v1 feature cut — blocks Phase 5

Recommended v1: login · collection list/filter/search · pressing detail · wishlist
list · Discogs search → add flow *with the duplicate dialogs* · barcode scan (it is
the reason mobile exists, and D1's choice makes it cheap). Deferred: account
management, exports (a `.sql` download on a phone has no obvious home; share-sheet
later), admin, registration, release editing.

### D8. API error envelope — blocks Phase 3

Adopt one JSON error shape from the first endpoint: machine-readable `code`,
human `message` written for the end user, `retryable` boolean, and optional
`action` (e.g. `update_token`). The `DiscogsApiError` flags (`unauthorized`,
`rateLimited`) already model this — the envelope is their generalization, and the
mobile UI branches on `code`, never on prose.

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
- **Phase 3 — the API.** `/api/v1/*` route handlers over the services (surface
  inventory in §5), zod validation, the D8 envelope, pagination/filter parity with
  the pages. **API contract tests** at the system layer: real handlers, scratch
  schemas, asserting the JSON shapes mobile will compile against.
- **Phase 4 — monorepo + shared package** (D3). Mechanical; done when the API is
  stable enough to type.
- **Phase 5 — the app.** Expo skeleton → login → read-only collection browsing
  against the LAN backend → wishlist → Discogs search/add with duplicate dialogs →
  barcode scan. Read-cache per D5.
- **Phase 6 — iOS + polish.** Same codebase via EAS build (requires the $99/yr
  Apple developer account); Maestro flows for the journeys; share-sheet export if
  wanted.

## 5. API surface inventory

| Current | v1 endpoint |
|---|---|
| `loginUser` / `logoutUser` | `POST` / `DELETE /api/v1/auth/session` |
| pressings page query | `GET /api/v1/pressings?artistId&formatId&genreId&sort&page` |
| pressing detail page | `GET /api/v1/pressings/:id` |
| `createPressing` (incl. duplicate dance) | `POST /api/v1/pressings` → `201`, or `409` carrying `ReleaseHoldings`; `confirmDuplicate`/`removeFromWishlist` in the body |
| `updatePressing` / `deletePressing` | `PATCH` / `DELETE /api/v1/pressings/:id` |
| wishlist page + CRUD + `addWishlistItemToCollection` | `/api/v1/wishlist...`, `POST /api/v1/wishlist/:id/add-to-collection` |
| `updateRelease` | `PATCH /api/v1/releases/:id` |
| existing search routes | move under `/api/v1/`, originals kept as thin aliases until web migrates its fetch calls |
| Discogs search/detail pages | `GET /api/v1/discogs/search?q=` **or `?barcode=`**, `GET /api/v1/discogs/releases/:id` |
| summary counts | `GET /api/v1/summary` |
| session info for app boot | `GET /api/v1/me` |

The `409 + ReleaseHoldings` pattern is the existing confirm-dance made honest in
HTTP: same shape, same semantics, one service underneath.

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
