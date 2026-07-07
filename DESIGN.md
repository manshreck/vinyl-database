# Vinyl Database — Design Specification

This document is a reverse-engineered design specification of the application as it
exists today. It is written for an experienced programmer who is **not** assumed to know
Next.js, React, or Prisma — framework concepts are explained where they matter.

Companion documents:

- `README.md` — installation and first-run instructions.
- `DEVELOPER_GUIDE.md` — hands-on development procedures (schema changes, testing, etc.).
- `AGENTS.md` — a warning that this Next.js version (16.x) has breaking changes vs.
  older documentation; the authoritative framework docs ship in `node_modules/next/dist/docs/`.

---

## 1. What the application is

A multi-user web application for cataloging a personal vinyl record collection. Each
user account gets its **own dedicated PostgreSQL database** (a "tenant" database),
provisioned automatically at registration. Users can:

- Record **pressings** they own (a specific physical copy of a release: format,
  pressing year, label, catalog number, condition, purchase info, insurance value).
- Maintain a **wishlist** of pressings they want (same descriptive fields, minus
  condition and cost), and promote a wishlist item into the collection when purchased.
- Browse, filter, and search the collection (wildcard and PostgreSQL-regex search).
- Generate a printable **insurance report** totaling the collection's declared value.
- Search the public **Discogs** catalog and prefill the add-record / add-wishlist forms
  from a Discogs release, including persisted cover art.

There is also a minimal, separately-authenticated **admin page** listing all accounts.

## 2. Technology stack

| Layer | Technology | Notes |
|---|---|---|
| Web framework | Next.js 16.2.3 (App Router) | Server-rendered React; see primer below |
| UI library | React 19.2 | Mostly server components; a few interactive client components |
| Styling | Tailwind CSS 4 | Utility classes inline in JSX; light + dark mode variants |
| ORM | Prisma 7.7 (`@prisma/client` + `@prisma/adapter-pg`) | Used for **tenant** databases only |
| Raw SQL driver | `pg` (node-postgres) | Used for the control-plane DB, provisioning, and admin stats |
| Database | PostgreSQL 16 | One control DB + one DB per user account |
| External API | Discogs REST API | Server-side only, single app-level token |
| Tests | Jest 30 + React Testing Library | All DB/network calls mocked; no live DB needed |
| Language | TypeScript 5 (strict) | `@/*` path alias maps to repo root |

### 2.1 Next.js primer (for backend engineers)

The mental model that makes the rest of this document readable:

- **File-system routing.** Every `app/<path>/page.tsx` file is a page served at
  `/<path>`. Square brackets are path parameters: `app/pressings/[id]/page.tsx` serves
  `/pressings/123`. Every `app/api/<path>/route.ts` is a plain HTTP JSON endpoint.

- **Server components (the default).** A `page.tsx` exports an `async` function that
  runs **on the server per request**. It can query the database directly, then returns
  JSX (HTML templating). No API layer is needed between the page and the DB — the page
  *is* the controller and the view. Nothing in these files ships to the browser as JS.

- **Client components** are files starting with the `'use client'` directive. These are
  hydrated in the browser and may hold state (`useState`), run effects, and handle
  events. This app uses them only where interactivity is required: forms, typeahead
  dropdowns, filter selects, print button.

- **Server actions** are functions in files starting with `'use server'`
  (everything under `app/actions/`). A client `<form>` can submit directly to one; Next
  serializes the `FormData` over an RPC POST to the server, runs the function there, and
  applies its result (usually a `redirect()`). This replaces hand-written
  POST endpoints for all mutations. **All writes in this app go through server actions;
  the two `route.ts` endpoints are read-only.**

- **`redirect()` / `notFound()`** (from `next/navigation`) work by throwing a special
  exception — code after them never runs, and they must not be wrapped in a bare
  `try/catch`.

- **Version-16 specifics** (differ from most online tutorials):
  - `params` and `searchParams` passed to pages are **Promises** and must be awaited.
  - `cookies()` (from `next/headers`) is async.
  - The request-interception file is `proxy.ts` (previously called "middleware").

### 2.2 Rendering / data-flow in one picture

```
Browser ── GET /pressings ──▶ proxy.ts (cookie present? else 302 /login)
                                  │
                                  ▼
                       app/pressings/page.tsx  (server component)
                          requireSession()  ──▶ control DB (session → tenant name)
                          getTenantPrisma() ──▶ tenant DB (queries)
                          returns JSX ──▶ HTML streamed to browser

Browser ── submit <form> ──▶ Next server-action RPC (POST)
                                  │
                                  ▼
                       app/actions/createPressing.ts ('use server')
                          requireSession() → getTenantPrisma() → prisma.pressing.create()
                          redirect('/pressings') ──▶ browser navigates
```

---

## 3. Multi-tenant database architecture

This is the app's defining architectural decision: **isolation by database, not by
row**. There is no `user_id` column anywhere in collection data — a user's data lives in
a Postgres database only they are routed to.

### 3.1 The two kinds of database

**Control-plane database** (`vinyl_control`, connection string `CONTROL_DATABASE_URL`):
shared by all users; holds accounts and sessions. Accessed with raw `pg` (no Prisma).
Its schema is bootstrapped idempotently (`CREATE TABLE IF NOT EXISTS ...`) the first
time the process connects (`lib/controlDb.ts`); there is no migration tooling for it.

```sql
users (
  id             SERIAL PRIMARY KEY,
  email          VARCHAR(255) NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,             -- scrypt, format "salt:hash" (hex)
  database_name  VARCHAR(63) NOT NULL UNIQUE, -- e.g. vinyl_user_d337e840f831
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at  TIMESTAMPTZ
)
sessions (
  token_hash TEXT PRIMARY KEY,              -- sha256(cookie token), hex
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
)
admin_sessions (
  token_hash TEXT PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL
)
```

**Tenant databases** (one per account, named `vinyl_user_<12 hex chars>`): hold all
collection data, accessed through Prisma. The schema is defined in
`prisma/schema.prisma`; the DDL applied to *new* tenants is the generated snapshot
`prisma/tenant-schema.sql`.

### 3.2 Connection-string derivation (`lib/dbUrls.ts`)

`DATABASE_URL` is treated as a **template**: host/port/credentials are shared, and only
the path (database name) is swapped per connection.

- `tenantConnectionString(name)` → `DATABASE_URL` with path `/<name>`.
- `adminConnectionString()` → `DATABASE_URL` with path `/postgres` (the Postgres
  maintenance DB, needed because `CREATE DATABASE` can't run inside the target DB).

### 3.3 Tenant provisioning (`lib/provisionTenant.ts`)

Runs during registration:

1. `generateDatabaseName()` — `vinyl_user_` + 6 random bytes hex.
2. `createTenantDatabase(name)`:
   - Validates the name against `/^vinyl_user_[a-f0-9]{12}$/` (defense against SQL
     injection into the un-parameterizable `CREATE DATABASE "<name>"`).
   - `CREATE DATABASE` via the maintenance connection.
   - Applies `prisma/tenant-schema.sql`, then seeds reference rows: 7 formats and 19
     genres from `prisma/referenceData.ts`.
   - On any seeding failure, **drops the just-created database** and rethrows, so a
     half-provisioned tenant never persists.

### 3.4 Tenant Prisma client cache (`lib/prisma.ts`)

Prisma clients are expensive (each owns a connection pool), so
`getTenantPrisma(databaseName)` maintains a process-global `Map<dbName, client>`:

- Each client uses the `pg` adapter with **pool max = 5** connections.
- An idle-eviction timer disconnects and removes a client after **30 minutes** without
  use; each access resets the timer.
- The map lives on `globalThis` in development so Next's hot-reload doesn't leak pools.
- The function does **no auth** — callers must resolve `databaseName` from a validated
  session first. This is the app's core security invariant (see §4.4).

> Operational note: after `npx prisma generate`, a running dev server still holds the
> old client in this cache — restart the dev server or you'll see
> `Cannot read properties of undefined (reading 'create')`.

---

## 4. Authentication & sessions

### 4.1 Passwords (`lib/password.ts`)

scrypt via Node `crypto`: `hashPassword` produces `"<16-byte-salt-hex>:<64-byte-hash-hex>"`;
`verifyPassword` recomputes and compares with `timingSafeEqual`. No external dependency.

### 4.2 User sessions (`lib/session.ts`)

- Cookie `session`: 32 random bytes hex, **httpOnly, SameSite=Lax, Secure in
  production**, 30-day expiry.
- The DB stores only `sha256(token)` — a leaked control-DB dump cannot be replayed as
  cookies.
- `getSession()` → `{ userId, email, databaseName } | null` — validates the cookie
  against the `sessions` table (join to `users`, `expires_at > now()`).
- `requireSession()` — same, but `redirect('/login')` when invalid. Every authenticated
  page and server action calls this first.
- `createSessionCookie(userId)` — inserts the session row, updates
  `users.last_login_at`, sets the cookie.
- `clearSessionCookie()` — deletes the row and the cookie.

### 4.3 Route gating (`proxy.ts`)

The edge proxy performs a **cookie-presence check only** (no DB round-trip — the
authoritative validation happens in `requireSession()` on every request anyway):

- Matcher: everything **except** `/login`, `/register`, `/admin*`, Next static assets,
  and the favicon.
- No `session` cookie → `302 /login`.

Consequences worth knowing:
- A stale/garbage cookie passes the proxy but fails `requireSession()` → redirect at
  the page layer.
- `/admin*` is excluded here and gated separately (below).

### 4.4 Tenant isolation model

Authorization is **structural**: the session row carries `database_name`, every page and
action calls `requireSession()` and then opens Prisma against exactly that database.
Entity IDs (`pressingId`, `wishlistItemId`, …) are only ever resolved inside the
caller's own tenant DB, so there is no cross-tenant IDOR surface — ID 7 in your DB and
ID 7 in mine are unrelated rows in different databases. There are deliberately no
ownership checks in queries because there is nothing to check.

### 4.5 Admin authentication (`lib/adminSession.ts`, `lib/adminCredentials.ts`)

A separate, parallel mechanism for `/admin`:

- Credentials are **hardcoded**: username `admin`, password `""` (blank).
  `lib/adminCredentials.ts` documents this as local-testing-only, and the admin page
  renders a prominent warning banner while the password is blank.
- Cookie `admin_session`, 12-hour expiry, token hashed into `admin_sessions` (not tied
  to any user row).
- `requireAdminSession()` redirects to `/admin/login`.

---

## 5. Data model (tenant schema)

Defined in `prisma/schema.prisma`; all names are camelCase in code and snake_case in
Postgres via `@map`. Prisma models ↔ tables:

```
Artist(artists)            Release(releases)              Pressing(pressings)
  artistId PK                releaseId PK                   pressingId PK
  name UNIQUE                title varchar(500)             releaseId FK → releases
  sortName (indexed)         originalReleaseYear smallint   formatId  FK → formats
  createdAt                  notes text?                    pressingYear smallint?
                             coverImageUrl text?            country, label,
Genre(genres)                createdAt / updatedAt          catalogNumber, vinylColor
  genreId PK                                                discCount (default 1)
  name UNIQUE               ReleaseArtist(release_artists)  recordCondition  (enum, required)
                              PK (releaseId, artistId)      sleeveCondition? (enum)
Format(formats)               artistOrder, role             notes text?
  formatId PK                 ON DELETE CASCADE w/ release  purchasePrice  decimal(10,2)?
  name UNIQUE                                               purchaseDate   date?
  description?              ReleaseGenre(release_genres)    currentValue   decimal(10,2)?
                              PK (releaseId, genreId)       createdAt / updatedAt
                              genreOrder
                              ON DELETE CASCADE w/ release

WishlistItem(wishlist_items)
  wishlistItemId PK
  releaseId FK, formatId FK
  pressingYear?, country?, label?, catalogNumber?, vinylColor?
  discCount (default 1), notes?
  createdAt / updatedAt
  -- deliberately NO condition fields and NO cost fields
```

**Conceptual split — Release vs. Pressing.** A *Release* is the abstract album ("Kind of
Blue, 1959, Miles Davis, Jazz") — title, original year, artists, genres, notes, cover
art. A *Pressing* is a physical copy you own of some manufacturing run (1972 UK
reissue, Columbia, VG+, bought for $30). Multiple pressings (and wishlist items) can
share one Release; editing the Release updates them all. A `WishlistItem` is
structurally "a pressing you don't own yet": the same pressing-describing fields, minus
condition (unknowable until you hold it — captured at add-to-collection time) and minus
purchase/valuation fields.

**Condition enum** `ConditionGrade` (standard Goldmine grading):
`P, FR, G, G_PLUS("G+"), VG_MINUS("VG-"), VG, VG_PLUS("VG+"), NM, M, S(Sealed)` — the
parenthesized strings are the values stored in Postgres via `@map`.

**Reference data** (seeded per tenant at provisioning, `prisma/referenceData.ts`):
- Formats: `7"`, `10"`, `12"`, `LP`, `Box Set`, `Cassette`, `CD`. (Disc multiples like
  "2xLP" are intentionally *not* formats — that's the `discCount` field.)
- Genres: Ambient, Blues, Classical, Country, Electronica, Folk, Funk, Hip-Hop, Jazz,
  Latin, Metal, Pop, Punk, R&B / Soul, Reggae, Rock, Soundtrack, Spoken Word, World.
- Artists are **not** reference data — created on the fly as releases are added.

**Schema-change procedure** (there are no automatic migrations for tenants): edit
`schema.prisma` → `npx prisma generate` → regenerate `prisma/tenant-schema.sql` with
`npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script` (new
tenants get it automatically) → manually `npx prisma db push` against each **existing**
tenant DB. See `DEVELOPER_GUIDE.md`.

---

## 6. Module inventory

### 6.1 `lib/` — shared server-side modules

| Module | Responsibility |
|---|---|
| `session.ts` | User session cookie create/read/clear (§4.2) |
| `adminSession.ts` | Admin session cookie, 12h (§4.5) |
| `adminCredentials.ts` | Hardcoded admin username/password |
| `controlDb.ts` | Raw-SQL data access for the control DB: users, sessions, admin sessions; bootstraps schema on first connect |
| `dbUrls.ts` | Derives per-database connection strings from `DATABASE_URL` (§3.2) |
| `provisionTenant.ts` | Create/seed/drop tenant databases (§3.3) |
| `prisma.ts` | Cached per-tenant Prisma clients (§3.4) |
| `releaseIntake.ts` | `resolveReleaseId(prisma, formData)` — the shared "pick existing release or create release+artist" logic used by both create actions (§7.3) |
| `password.ts` | scrypt hash/verify (§4.1) |
| `artistSort.ts` | `artistSortKey()` — strips leading "The/A/An" and lowercases for alphabetical artist ordering |
| `wildcardToRegex.ts` | Converts `*`/`?` wildcard patterns to escaped PostgreSQL regex |
| `adminStats.ts` | `countPressings(dbName)` — raw count query per tenant for the admin page |
| `discogs.ts` | Discogs HTTP client: search + release detail (§9) |
| `discogsMapping.ts` | Pure functions mapping Discogs payloads onto this app's vocabulary (§9.3) |

### 6.2 Route map

**Public (no session required):**

| Route | File | Purpose |
|---|---|---|
| `/login` | `app/login/` | Email/password login form |
| `/register` | `app/register/` | Account creation (provisions tenant DB) |
| `/admin/login` | `app/admin/login/` | Admin login form |

**Authenticated user pages:**

| Route | File | Purpose |
|---|---|---|
| `/` | `app/page.tsx` | Landing page: 5 navigation cards (View Collection, Add Record, View Wishlist, Add to Wishlist, Search Discogs) |
| `/pressings` | `app/pressings/page.tsx` | Collection list with filter panel |
| `/pressings/new` | `app/pressings/new/` | Add-record form (optional `?discogsId=` prefill) |
| `/pressings/[id]` | `app/pressings/[id]/page.tsx` | Pressing detail (read-only) |
| `/pressings/[id]/edit` | `app/pressings/[id]/edit/` | Edit pressing + two-click delete |
| `/releases/[id]/edit` | `app/releases/[id]/edit/` | Edit shared release data (`?returnTo=` controls post-save destination) |
| `/artists/[id]` | `app/artists/[id]/page.tsx` | Artist discography: their releases with owned pressings nested |
| `/search` | `app/search/` | Wildcard/regex collection search |
| `/insurance` | `app/insurance/` | Printable valuation report |
| `/wishlist` | `app/wishlist/page.tsx` | Wishlist list |
| `/wishlist/new` | `app/wishlist/new/` | Add-wishlist-item form (optional `?discogsId=` prefill) |
| `/wishlist/[id]` | `app/wishlist/[id]/page.tsx` | Wishlist item detail |
| `/wishlist/[id]/edit` | `app/wishlist/[id]/edit/` | Edit wishlist item + two-click remove |
| `/wishlist/[id]/add-to-collection` | `app/wishlist/[id]/add-to-collection/` | Interstitial: capture condition/purchase info, convert to pressing |
| `/discogs` | `app/discogs/page.tsx` | Discogs catalog search (`?q=`) |
| `/discogs/[id]` | `app/discogs/[id]/page.tsx` | Discogs release detail with "Add to Collection" / "Add to Wishlist" |

**Admin:**

| Route | File | Purpose |
|---|---|---|
| `/admin` | `app/admin/page.tsx` | Account table: email, created, record count (live per-tenant query), last login |

**JSON API (read-only, used by form typeaheads):**

| Route | File | Purpose |
|---|---|---|
| `GET /api/releases/search?q=` | `app/api/releases/search/route.ts` | ≤10 releases from the caller's tenant, title `ILIKE %q%`, with artists; `[]` if `q` < 2 chars; 401 without session |
| `GET /api/artists/search?q=` | `app/api/artists/search/route.ts` | Same contract for artists by name |

**Layout** (`app/layout.tsx`): wraps every page; when a session exists it renders a
header bar with the user's email and a Log out button (a form posting to `logoutUser`).

---

## 7. Action specification

Every mutation in the system, one subsection each. Shared shape unless noted:

```
'use server'
session = await requireSession()            // redirect /login if absent
prisma  = await getTenantPrisma(session.databaseName)
...parse FormData...                        // text: .trim() || null; numbers: Number(x) or null
...write...
redirect(<target>)                          // ends the action
```

Optional text fields are normalized so **empty string is stored as NULL**. Numeric
`""` → null. There is no field-level validation layer beyond HTML form constraints
(`required`, `min`, `max`) plus DB constraints; a hand-crafted bad request produces a
Prisma error (HTTP 500), which is accepted for this app's threat model (own data only).

### 7.1 Auth actions

These three return a `FormState = { error } | null` instead of throwing, so the client
form (via React's `useActionState`) can render inline errors without navigation.

**`registerUser(prevState, formData)`** — `app/actions/registerUser.ts`
- Inputs: `email` (trimmed, lowercased), `password`, `confirmPassword`.
- Validation, each returning `{error}`: both present; password ≥ 8 chars; passwords
  match; email not already registered.
- Flow: scrypt-hash password → insert `users` row with a generated tenant DB name
  (retrying up to 3× on the astronomically-unlikely name-collision unique violation) →
  `createTenantDatabase()`. If provisioning fails, the `users` row is **deleted**
  (compensating rollback) and an error is returned.
- Success: create session cookie → `redirect('/')`.

**`loginUser(prevState, formData)`**
- Looks up by email; verifies scrypt hash. Single generic error ("Invalid email or
  password.") for both unknown-user and bad-password — no account enumeration.
- Success: session cookie (updates `last_login_at`) → `redirect('/')`.

**`logoutUser()`** — deletes session row + cookie → `redirect('/login')`.

**`loginAdmin(prevState, formData)` / `logoutAdmin()`** — same pattern against the
hardcoded credentials and `admin_sessions`; redirect to `/admin` / `/admin/login`.

### 7.2 Pressing actions

**`createPressing(formData)`** — from `/pressings/new`.
- Resolves the release via `resolveReleaseId` (§7.3).
- Creates a `Pressing` with: `formatId` (required select), `recordCondition` (required
  enum), and optional `sleeveCondition`, `pressingYear`, `country`, `label`,
  `catalogNumber`, `vinylColor`, `discCount` (default 1), `notes`, `purchasePrice`,
  `purchaseDate`, `currentValue`.
- `redirect('/pressings')`.

**`updatePressing(id, formData)`** — from `/pressings/[id]/edit`. Same field set as
create (minus release resolution — the pressing's release is not changeable here;
release fields are edited via `/releases/[id]/edit`). `redirect('/pressings')`.

**`deletePressing(id)`** — hard delete of the pressing row only. The Release (and
artist) rows remain even if orphaned. Guarded in the UI by a two-click confirm on the
edit page. `redirect('/pressings')`.

### 7.3 Release intake — `resolveReleaseId` (`lib/releaseIntake.ts`)

Shared by `createPressing` and `createWishlistItem`; implements the dedup-first flow:

1. If the form carries `releaseId` (user picked an existing release from the typeahead)
   → return it. Nothing is created.
2. Otherwise create a new release from the "new release" form section:
   - Artist: reuse `newArtistId` if the user picked one from the artist typeahead, else
     `artist.create({ name, sortName: name })` from `newArtistName`.
   - `release.create` with `newReleaseTitle`, `newReleaseYear`,
     optional `newReleaseCoverImageUrl` (hidden field populated by the Discogs prefill),
     the artist link (`artistOrder: 1`), and any checked `genreIds`
     (ordered as submitted).

### 7.4 Release action

**`updateRelease(releaseId, returnTo, formData)`** — from `/releases/[id]/edit`. Runs in
a single transaction:
1. Update the release: `title`, `originalReleaseYear`, `notes`, `coverImageUrl`
   (blank → null, i.e. clearing the field removes the art).
2. For each `artistIds` entry, update that artist's `name` / `sortName` from the
   parallel `name[<artistId>]` / `sortName[<artistId>]` fields (sortName falls back to
   name; blank names skipped). Note: artists are shared across releases, so renaming
   here renames everywhere.
3. Replace genre links wholesale: `deleteMany` then `createMany` with fresh ordering.

`redirect(returnTo)` — the edit page is reachable from multiple places (artist page,
pressing edit), and `returnTo` (a query param threaded through the page) sends the user
back where they came from.

### 7.5 Wishlist actions

**`createWishlistItem(formData)`** — from `/wishlist/new`. Same release resolution as
createPressing, then creates a `WishlistItem` with `formatId`, `pressingYear`,
`country`, `label`, `catalogNumber`, `vinylColor`, `discCount`, `notes`. **No condition,
no cost fields by design.** `redirect('/wishlist')`.

**`updateWishlistItem(id, formData)`** — same field set. `redirect('/wishlist')`.

**`deleteWishlistItem(id)`** — hard delete; two-click confirm in the edit form
("Remove from wishlist"). `redirect('/wishlist')`.

**`addWishlistItemToCollection(id, formData)`** — the wishlist→collection conversion,
from the interstitial page. The only multi-row transactional workflow in the app:

1. Load the wishlist item; `notFound()` if missing.
2. In one `$transaction`:
   - Create a `Pressing` copying every descriptive field from the wishlist item
     (release, format, year, country, label, catalog #, color, disc count, notes) and
     taking from the form the fields a wishlist can't know:
     `recordCondition` (required), `sleeveCondition?`, `purchaseDate` (form is
     prefilled with today), `purchasePrice?`, `currentValue?`.
   - Delete the wishlist item.
3. `redirect('/pressings/<newPressingId>')` — lands on the new pressing's detail page.

The transaction guarantees the item is never simultaneously in both lists, nor lost.

---

## 8. Page / workflow specifications (frontend)

Common visual language: zinc-palette Tailwind styling with dark-mode variants
throughout; data displayed in bordered tables; primary actions are pill buttons;
navigational "Title / Edit / Add to Collection" links in lists are **bold, underlined,
sky-blue**; vinyl color shown as a violet chip; condition as a small gray chip; `—` for
null values.

### 8.1 Landing (`/`)

Server component; greets by session email; renders 5 static cards (grid, 2→3 columns
responsive) linking to the main workflows (§6.2).

### 8.2 Collection list (`/pressings`)

- Reads filters from query params `artistId`, `formatId`, `genreId`.
- Loads (in one `Promise.all`): filtered pressings with release→artists and format
  joined, plus full artist/format/genre lists for the filter dropdowns.
- Sorting is done **in JS after the query**: artist sort-key (article-stripped
  `sortName`), then title, then pressing year — Postgres can't express the
  article-stripping collation directly.
- `FilterPanel` (client component): three `<select>`s that push updated query params to
  the router — filtering is therefore a full server round-trip (URL is shareable
  state), no client-side data filtering. "Clear filters" resets to `/pressings`.
- Table columns: Title (with 40px cover thumbnail when the release has `coverImageUrl`,
  original year in parens, link → detail) · Artist (links → artist page) · Format ·
  Pressing Year · Label · Catalog # (+ vinyl-color chip) · Condition (chip, with an
  info-popover component `ConditionInfo` explaining the grading scale) · Value · Edit.
- Header buttons: Wishlist, Search, Insurance report, Add record.

### 8.3 Add record (`/pressings/new` + `PressingsForm`)

The most complex form; client component. Two-phase UX:

**Phase 1 — Release selection (dedup-first).** A debounced (300 ms) typeahead against
`GET /api/releases/search`. The user either:
- picks an existing release → shown as a locked summary card with a hidden
  `releaseId` input and a "Change" button; or
- clicks "+ Create new release for &lt;query&gt;" (offered under the results, and as a
  fallback link when there are no results) → expands an inline "new release" section:
  title, original release year (1877–2200), an artist typeahead
  (`/api/artists/search`; picking sets hidden `newArtistId`, otherwise the free text
  becomes `newArtistName`), and genre checkboxes.

**Phase 2 — Pressing details** (revealed once a release is selected/being created):
format select (required), disc count, record condition (required) & sleeve condition
selects, pressing year, country, label, catalog number, vinyl color, purchase
price/date, current value, notes.

Submission calls the `createPressing` server action directly with the form's
`FormData`; button shows "Saving…" while pending.

**Discogs prefill:** the page (`page.tsx`) accepts `?discogsId=`. When present it
fetches the Discogs release server-side, maps it (§9.3), resolves suggested
format/genre **names** to this tenant's actual IDs, and passes an `initialValues` prop.
The form then seeds the release-search query (so the dedup search still runs first),
prefills the new-release fields and pressing details, and carries `coverImageUrl` in a
hidden `newReleaseCoverImageUrl` input (applied only when a *new* release is created —
it never overwrites existing art). Any Discogs failure is caught and logged; the form
simply opens blank, so manual entry is never blocked.

### 8.4 Pressing detail & edit (`/pressings/[id]`, `/pressings/[id]/edit`)

Detail: read-only card layout — header (96px cover, title, artists, Edit button), then
Release / Pressing / Condition / Provenance & Value sections. Missing ID → 404.

Edit (`EditPressingForm`, client): all pressing fields prefilled; links out to
`/releases/[id]/edit?returnTo=...` for release-level fields; Delete uses the two-click
pattern (first click arms it — "Click again to confirm delete" — second click calls
`deletePressing`).

### 8.5 Release edit (`/releases/[id]/edit`)

Edits data shared by all pressings/wishlist items of the release: title, year, notes,
cover image URL (plain text input — manually settable/clearable, not only
Discogs-sourced), per-artist name/sortName inputs, genre checkboxes. Submits
`updateRelease` with the `returnTo` target (§7.4).

### 8.6 Artist page (`/artists/[id]`)

Discography view: header with name, sortName (when different), release/pressing counts;
one card per release (ordered by original year) showing collaborators, genres, an
"Edit release" link (with `returnTo` back here), and a nested table of owned pressings
(format, year, label/catalog, condition, value, View/Edit links).

### 8.7 Collection search (`/search`)

Advanced search distinct from the list filters. Client form pushes `title`, `artist`,
`year`, and optional `regex=1` into the URL; the server component then runs **one raw
parameterized SQL query** (`prisma.$queryRaw` with `Prisma.sql` composition — user
input is always bound, never spliced):

- Wildcard mode (default): pattern converted by `wildcardToRegex` (`*`→`.*`, `?`→`.`,
  everything else escaped) and wrapped in `.*…​.*` for substring semantics; matched
  case-insensitively with Postgres `~*`. Year is an exact integer match.
- Regex mode: title/artist patterns passed through as raw Postgres regexes; year is
  matched as regex against the year cast to text (enables `196[0-9]`).
- Artist matching joins through a `DISTINCT release_id` subquery so multi-artist
  releases match correctly; artists render as a `string_agg` per row.
- Invalid regexes are caught and shown as an inline "Invalid pattern" error.

### 8.8 Insurance report (`/insurance`)

All pressings ordered by `currentValue` desc, split into **valued** and **unvalued**
sections; summary cards (total value — valued rows only, valued count, unvalued count);
valued table has a total footer; unvalued titles link to the *edit* page (nudging the
user to add a value). `PrintButton` is a tiny client component calling
`window.print()`; print CSS strips link underlines.

### 8.9 Wishlist (`/wishlist`, `/wishlist/new`, `/wishlist/[id]`, edit, add-to-collection)

- List mirrors the collection table (Title+thumb, Artist, Format, Pressing Year, Label,
  Catalog #) — no condition/value columns — plus per-row **Add to Collection** links to
  the interstitial. Header: Collection, Add to wishlist buttons.
- `/wishlist/new` reuses the same two-phase form pattern as §8.3 (`WishlistForm`),
  minus condition and cost fields, submitting `createWishlistItem`. Supports the same
  `?discogsId=` prefill.
- Detail page: cover, release info, pressing-sought info, Edit + prominent **Add to
  Collection** button.
- Edit page: pressing-detail fields + two-click "Remove from wishlist".
- Add-to-collection interstitial (`/wishlist/[id]/add-to-collection`): shows what's
  being added; form fields are exactly the "unknowable until purchase" set — record
  condition (required), sleeve condition, purchase date (**prefilled with today**,
  server-rendered `toISOString().split('T')[0]`), purchase price, current value.
  Submits `addWishlistItemToCollection` (§7.5) and lands on the new pressing.

### 8.10 Discogs search (`/discogs`, `/discogs/[id]`)

- `/discogs?q=…`: plain GET-param search (client form only pushes the URL). Server
  component calls `searchDiscogsReleases`; **any** `DiscogsApiError` (missing token,
  429 rate limit, upstream failure) is caught and rendered as an inline red error box —
  the page never hard-crashes on Discogs problems. Results are cards: 56px thumb,
  title, year, formats · country · label, each linking to `/discogs/<id>?q=…` (the `q`
  is threaded through so "← Results" works).
- `/discogs/[id]`: full release detail — 160px cover, artists, original release year vs
  pressing year, country, genres, label/catalog, format, notes — plus the two exits:
  **Add to Collection** → `/pressings/new?discogsId=<id>` and **Add to Wishlist** →
  `/wishlist/new?discogsId=<id>`.

### 8.11 Admin (`/admin`, `/admin/login`)

After `requireAdminSession()`: a table of all accounts (email, created, live record
count via a direct `count(*)` against each tenant DB, last login), the blank-password
warning banner (§4.5), and logout. There are no mutating admin operations.

---

## 9. Discogs integration

### 9.1 Auth model

A single **app-level personal access token** (`DISCOGS_TOKEN` env var), used
server-side only — end users never need Discogs accounts, and the token never reaches
the browser. Per-user OAuth was considered and rejected: the app only reads the public
catalog, never acts on a user's Discogs account. Discogs' free tier allows 60
requests/minute **shared across the whole app**. The token is required even for search
(`/database/search` rejects unauthenticated calls).

### 9.2 HTTP client (`lib/discogs.ts`)

- `discogsFetch<T>(path, params)`: builds the URL against `https://api.discogs.com`,
  appends `?token=`, sends the Discogs-required `User-Agent`
  (`VinylDatabase/1.0 +https://github.com/manshreck/vinyl-database`). Throws
  `DiscogsApiError` (carrying `status` and a `rateLimited` flag) on missing token, 429
  (friendly retry message), or any non-2xx.
- `searchDiscogsReleases(query)`: `GET /database/search?type=release&q=…&per_page=25`;
  maps raw results to `{id, title, year, country, label (first), catno, formats,
  thumb}`. First page only; no pagination UI yet.
- `getDiscogsRelease(id)`: `GET /releases/{id}`. **Key subtlety:** Discogs'
  release-level `year` is the *pressing* year. When the release has a `master_id`, the
  client also fetches `GET /masters/{id}` and uses the master's `year` as
  `originalReleaseYear` (falling back to the release year if there's no master or that
  lookup fails) — mapping cleanly onto this schema's Release-vs-Pressing split.
  Returns title, cleaned artist names, both years, country, genres, labels(+catno),
  formats(+qty+descriptions), notes, and the primary image URI as `coverImageUrl`.

### 9.3 Vocabulary mapping (`lib/discogsMapping.ts` — pure, unit-tested)

- `cleanDiscogsArtistName`: strips Discogs' disambiguation suffix ("Genesis (2)" →
  "Genesis"); does not touch names like "Blink-182".
- `guessFormatName`: case-insensitive match of Discogs `formats[].descriptions` against
  this app's 7 format names; `null` (leave unselected) when nothing matches — never
  guesses wrong.
- `guessGenreNames`: alias map for naming drift (Discogs "Electronic" → local
  "Electronica").
- `guessDiscCount`: first positive numeric `formats[].qty`, default 1.
- `buildDiscogsInitialValues(detail)`: assembles the prefill object consumed by the
  create-form pages (title, originalReleaseYear, first artist, genre names, format
  name, country, first label + catno, disc count, coverImageUrl). The pages then
  resolve names→IDs against tenant reference data.

### 9.4 Cover images

`next.config.ts` whitelists `i.discogs.com` / `img.discogs.com` for `next/image`
(rendered `unoptimized`, i.e. hotlinked directly rather than proxied through Next's
optimizer). The URL is persisted on `Release.coverImageUrl`, shown at 40px in list
rows, 56px in Discogs results, 96px in detail headers.

---

## 10. Testing

Jest with two environments: default `jsdom` for component tests; server-side test files
opt into Node with a `/** @jest-environment node */` docblock. `next/jest` handles
TS/JSX transforms; `@/` alias mapped in `jest.config.ts`. **No database or network is
ever touched** — `@/lib/prisma`, `@/lib/session`, `@/lib/controlDb`, `next/navigation`,
and `global.fetch` (for Discogs) are mocked per test file.

Coverage (24 suites, ~150 tests, under `__tests__/`):
- `actions/` — every server action: field parsing/null-normalization, validation
  branches, transaction contents, redirect targets, provisioning rollback.
- `api/` — both typeahead routes: auth 401, short-query short-circuit, query shape.
- `lib/` — pure utilities (password round-trip, artistSort, wildcardToRegex, session
  token hashing, Discogs client URL/auth/error/master-fallback behavior, all
  discogsMapping helpers).
- `components/` — the interactive pieces (`FilterPanel`, `ConditionInfo`) via React
  Testing Library.

`npm test` / `test:watch` / `test:coverage`.

---

## 11. Configuration & environment

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | Connection **template** (credentials/host); its path is replaced per tenant and for the `postgres` maintenance DB |
| `CONTROL_DATABASE_URL` | Yes | The shared `vinyl_control` database |
| `DISCOGS_TOKEN` | No | Enables `/discogs`; without it that page shows a "not configured" error and everything else works |

`.env` is gitignored. `prisma.config.ts` wires the Prisma CLI to `DATABASE_URL` and the
seed script (`prisma/seed.ts`, which seeds reference data into the DB named by
`DATABASE_URL` — used for the standalone dev database, not tenants).

## 12. Known limitations / deliberate trade-offs

- **No tenant migrations.** New tenants get the current `tenant-schema.sql`; existing
  tenant DBs must be migrated by hand per account. Acceptable at hobby scale; the first
  thing to automate if accounts grow.
- **Admin credentials hardcoded, blank password** — local-only by design, loudly
  flagged in code and UI.
- **Admin page scales linearly** — one live connection + count query per account per
  page load.
- **Discogs**: shared 60 req/min budget, no caching, no pagination past 25 results;
  cover art is hotlinked (a dead Discogs URL means a broken image).
- **Deletes are hard deletes**; releases/artists orphaned by deleting their last
  pressing are kept, not garbage-collected.
- **Server-side validation is minimal** (HTML + DB constraints); malformed hand-crafted
  requests surface as 500s rather than 400s.
- **Session table growth**: expired session rows are never purged (they're ignored by
  the `expires_at > now()` predicate but not deleted).
- **Collection list loads all rows** — no pagination anywhere; fine for
  personal-collection cardinality.
