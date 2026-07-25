# Roadmap: Production Hosting + Mobile Apps

This is a prioritized plan for taking VinylDB from "runs on my laptop against local
Postgres" to a real hosted website with a real database, plus native Android and iOS
apps. Written as a standing reference to revisit and update, not a one-time todo list.

**Current state, for context:** Next.js 16 App Router app, per-tenant PostgreSQL
databases (`vinyl_user_<hex>`) plus one control database (`vinyl_control`), Prisma ORM,
cookie-based session auth via Server Actions, a single shared server-side Discogs API
token, `.env`-only configuration, no CI, no deployment target configured, web-only. See
`DEVELOPER_GUIDE.md` for the full architecture and `TESTING.md` for the test suite.

---

## 0. Decisions to lock in before building anything

These four choices shape everything downstream. Worth a short design doc of their own
(per the `swe-design` philosophy this project already follows) before writing code —
a code review should never be a surprise about *architecture*, only about
implementation.

1. **Keep the per-tenant-database-per-user model, for now.** This is the app's most
   distinctive architectural trait and the one most exposed by "real hosting." It's a
   real strength for isolation and matches how this project already tests itself
   (scratch databases are cheap because production treats one-DB-per-user as normal).
   It's also the thing most managed Postgres hosts aren't optimized for at scale —
   connection pooling in particular gets harder when a request might target any one of
   N databases rather than one shared schema. Recommendation: **don't rearchitect this
   before launch.** It's fine for dozens to low hundreds of users on a single
   well-resourced Postgres instance. Pick an explicit revisit trigger (e.g. "reconsider
   once we cross ~500 active accounts, or once connection-pool exhaustion shows up in
   monitoring") so it's a conscious decision later, not a surprise outage.

2. **Hosting: Vercel (web) + a serverless-pooling-friendly Postgres provider (Neon is
   the natural fit, given #1).** Vercel is close to zero-config for Next.js App Router
   and Server Actions. Neon supports many databases per project and is built for the
   serverless-connection-churn pattern this app's per-tenant-DB model produces (a
   request can hit a different database than the last one). Alternative: a
   single-box host (Fly.io/Railway) running Postgres yourself, if cost or control
   matters more than convenience — more ops burden, cheaper at small scale, and
   sidesteps some serverless-pooling subtleties. Decide once, don't build for both.

3. **Mobile approach: React Native (via Expo), not two native codebases, and not a
   rewrite-avoidance PWA.** This app is fundamentally CRUD — forms, lists, search — with
   no evident need for camera/AR/heavy offline sync that would justify native Swift/
   Kotlin. One React Native codebase covers both stores at roughly half the ongoing
   maintenance cost of two native ones, and the team already has the React background
   from this web app to build on. Expo specifically over bare React Native for faster
   iteration and simpler store builds/OTA updates. If mobile demand is still unproven,
   an even cheaper interim step is making the existing web app an installable PWA first
   — worth 30 minutes of consideration before committing to store submissions, but not
   a substitute for real apps if the goal is App Store/Play Store presence.

4. **Mobile auth: token-based (JWT access + refresh token), issued by a new API layer,
   independent of the existing cookie session.** httpOnly cookies plus Server Actions
   don't reach a native app. This is additive, not a replacement — the web app keeps
   its cookie flow; a new `/api/v1/auth/*` surface issues tokens for API/mobile
   consumers, validated the same way `requireSession()` validates a cookie today (see
   `lib/session.ts`), just reading an `Authorization: Bearer` header instead.

---

## 1. Make the web app hostable for real

The smallest step to "a real website, backed by a real database" — no mobile work yet.

- Provision the chosen Postgres host: the control database, plus confirm tenant-database
  creation (`lib/provisionTenant.ts`) works against it exactly as it does locally.
- Deploy to Vercel (or chosen host); move `.env` values to the platform's secret/env-var
  management. Nothing in the app should read a `.env` file in production.
- **Automate tenant-database migrations.** Today, per `README.md`/`DEVELOPER_GUIDE.md`,
  applying a schema change to existing tenant databases is a manual, per-account step.
  That doesn't survive contact with more than a handful of real users — build a runner
  that iterates every `vinyl_user_*` database and applies pending DDL, and decide how
  it's triggered (deploy hook, scheduled job, manual-but-scripted).
- Load/connection-test signup and login under concurrency before calling this done —
  the per-tenant-DB model's realistic failure mode is connection-pool exhaustion under
  concurrent registrations, not application bugs.
- Stand up CI. `TESTING.md` §4 already describes the intended split once CI exists:
  `npm test` presubmit-blocking, `npm run test:integration` post-submit (with a
  Postgres service container), `test:contract`/`test:e2e` on a schedule. Building the
  actual pipeline is the missing piece — start here, since everything after this phase
  benefits from a real gate.
- Add basic error tracking (e.g. Sentry) and an uptime/health check. There is
  currently no visibility into production failures at all.
- Add rate limiting on `/register` and `/login` — currently unprotected beyond password
  length validation.
- If this will have real users outside the household: minimal privacy policy and terms
  of service. The app stores email addresses, hashed passwords, and personal collection
  data — even a short, honest policy is better than none.

## 2. Build a mobile-consumable API

Nothing in the current app is callable by a native client. The three existing routes
under `app/api/` (`releases/search`, `artists/search`, `discogs/cover-image`) are
narrow, unauthenticated-by-cookie-context helpers, not a real API surface.

- Design a versioned REST API (`/api/v1/...`) covering: auth (register/login/refresh/
  logout), collection (list/create/update/delete pressings), wishlist (same), Discogs
  search/prefill, artist/release lookups. Reuse the business logic already in
  `app/actions/*` and `lib/*` rather than duplicating it — the Server Actions and the
  new API routes should both call the same underlying functions.
- Add the token-based auth from §0.4 alongside the existing cookie session.
- Document the API (even a short OpenAPI/Markdown reference) before mobile development
  starts guessing at request/response shapes.
- Extend the test suite: this is new seam/system-integration surface per
  `TESTING.md`'s taxonomy, not just new unit tests — the API's contract with mobile
  clients deserves the same seam-testing discipline the DB/Discogs boundaries already
  get.

## 3. Mobile apps (React Native / Expo)

- Stand up the Expo project; recreate the seven journeys already proven end-to-end on
  web (`e2e/*.spec.ts` — create account, view/add/edit collection, add/view wishlist,
  Discogs search-and-prefill) against the new API instead of Server Actions.
- Mobile-specific concerns the web app doesn't have: secure on-device token storage,
  offline/error/retry states, app icons and store screenshots.
- TestFlight (iOS) and an internal testing track (Android) before public submission.
- App Store / Play Store submission — budget real lead time here, especially iOS
  review, which is the least predictable part of this whole roadmap.

## 4. Harden for real usage

Revisit once there's real traffic, not before:

- Revisit the per-tenant-database decision from §0.1 against its trigger condition.
- Per-user Discogs API tokens, replacing the single shared 60/min token — already
  flagged as a known TODO in `README.md`; becomes a real constraint once there are
  enough concurrent users to hit it.
- Backups and a tested disaster-recovery restore — for both the control database and
  tenant databases.
- Real performance/load testing once usage patterns are known, rather than guessed at.

---

## Suggested sequencing

Phases 1 and 2 can start in parallel (hosting work and API design don't block each
other), but phase 3 (mobile app development) shouldn't start until phase 2's API is
stable — building against a moving API target is the single most avoidable source of
wasted mobile-dev time. Phase 0's decisions should be genuinely settled, not just
defaulted into, before phase 1 begins.
