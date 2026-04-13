# VinylDB Developer Guide

This guide covers the architecture, component contracts, data flow, and extension points for the VinylDB application. It is intended for developers who want to understand, modify, or extend the codebase.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Data Model](#2-data-model)
3. [Directory Structure](#3-directory-structure)
4. [Layer Contracts](#4-layer-contracts)
   - [Database → Prisma Client](#41-database--prisma-client)
   - [Prisma Client → Server Components](#42-prisma-client--server-components)
   - [Prisma Client → Server Actions](#43-prisma-client--server-actions)
   - [Prisma Client → API Route Handlers](#44-prisma-client--api-route-handlers)
   - [Server Actions → Client Components](#45-server-actions--client-components)
   - [API Routes → Client Components](#46-api-routes--client-components)
   - [Client Components → User](#47-client-components--user)
5. [Component Reference](#5-component-reference)
   - [Server Components (Pages)](#51-server-components-pages)
   - [Client Components](#52-client-components)
   - [Server Actions](#53-server-actions)
   - [API Route Handlers](#54-api-route-handlers)
   - [Library Utilities](#55-library-utilities)
6. [Data Flows](#6-data-flows)
   - [Adding a Pressing](#61-adding-a-pressing)
   - [Editing a Pressing](#62-editing-a-pressing)
   - [Editing a Release](#63-editing-a-release)
   - [Advanced Search](#64-advanced-search)
7. [Key Architectural Decisions](#7-key-architectural-decisions)
8. [Extensibility](#8-extensibility)
   - [Adding a New Page](#81-adding-a-new-page)
   - [Adding a New Pressing Field](#82-adding-a-new-pressing-field)
   - [Adding a New Condition Grade](#83-adding-a-new-condition-grade)
   - [Adding a New Format or Genre](#84-adding-a-new-format-or-genre)
   - [Adding a New Server Action](#85-adding-a-new-server-action)
   - [Adding a New API Route](#86-adding-a-new-api-route)
   - [Adding Tests](#87-adding-tests)
9. [Configuration Reference](#9-configuration-reference)

---

## 1. Architecture Overview

VinylDB is a full-stack Next.js application using the App Router. It follows a three-tier pattern:

```
PostgreSQL database
       ↕  (Prisma ORM via @prisma/adapter-pg)
Next.js server (server components, server actions, API routes)
       ↕  (React server/client boundary, fetch)
Browser (client components)
```

**Rendering model:** Nearly all pages are React Server Components that fetch data directly from the database at request time. Client components are used only where interactivity is required (dropdowns, filters, forms, popovers). There is no global client-side state management — URL search parameters serve as the shared state mechanism for filtering.

**Mutation model:** All writes go through Next.js Server Actions (`app/actions/`). Client components collect form data and call the action directly; the action validates, writes to the database via Prisma, and calls `redirect()`. There is no REST-style mutation API.

**Search exception:** The advanced search page (`/search`) uses a raw SQL query via `prisma.$queryRaw` because it needs PostgreSQL's native `~*` regex operator, which is not expressible through Prisma's query builder.

---

## 2. Data Model

### Schema overview (`prisma/schema.prisma`)

The central distinction in the model is **Release vs. Pressing**:

- A **Release** is an abstract work: an album, EP, or single with a title, original year, and associated artists and genres.
- A **Pressing** is a physical object: a specific manufactured copy of a release on a particular format, by a particular label, in a particular year, with its own condition and provenance.

One release may have many pressings (e.g., the UK original pressing and a US reissue are both pressings of the same release).

```
Artist ──< ReleaseArtist >── Release ──< Pressing >── Format
                                │
                           ReleaseGenre
                                │
                              Genre
```

### Models

#### `Artist`
| Column | Type | Notes |
|--------|------|-------|
| `artistId` | `Int` PK | auto-increment |
| `name` | `String` | unique |
| `sortName` | `String` | e.g. `"Davis, Miles"` — used for sort ordering |
| `createdAt` | `DateTime` | |

The `sortName` field stores a filing form separate from the display name. The application is responsible for populating it correctly; the `artistSortKey()` utility then strips leading articles before comparing.

#### `Release`
| Column | Type | Notes |
|--------|------|-------|
| `releaseId` | `Int` PK | auto-increment |
| `title` | `String` | up to 500 chars |
| `originalReleaseYear` | `Int` (SmallInt) | year the work was first released |
| `notes` | `String?` | freeform |
| `createdAt`, `updatedAt` | `DateTime` | |

#### `Pressing`
| Column | Type | Notes |
|--------|------|-------|
| `pressingId` | `Int` PK | auto-increment |
| `releaseId` | `Int` FK | → `Release` |
| `formatId` | `Int` FK | → `Format` |
| `pressingYear` | `Int?` (SmallInt) | year this copy was manufactured |
| `country` | `String?` | country of manufacture |
| `label` | `String?` | record label name |
| `catalogNumber` | `String?` | label catalog number |
| `vinylColor` | `String?` | null = standard black |
| `discCount` | `Int` | default 1 |
| `recordCondition` | `ConditionGrade` | required |
| `sleeveCondition` | `ConditionGrade?` | optional |
| `notes` | `String?` | |
| `purchasePrice` | `Decimal(10,2)?` | what was paid |
| `purchaseDate` | `Date?` | |
| `currentValue` | `Decimal(10,2)?` | estimated insurance value |
| `createdAt`, `updatedAt` | `DateTime` | |

`purchasePrice` and `currentValue` are Prisma `Decimal` types. **They cannot be passed directly to client components** — they must be serialized to strings in the server component before crossing the server/client boundary (see `app/pressings/[id]/edit/page.tsx`). Similarly, `purchaseDate` is a `Date` object and must be converted to an ISO string (`YYYY-MM-DD`).

#### `Format`
Reference table for physical formats (LP, 45, 78, CD, etc.). Populated by seed data; not editable through the UI.

#### `Genre`
Reference table for musical genres. Populated by seed data; not editable through the UI.

#### `ReleaseArtist` (junction)
Links releases to artists. `artistOrder` determines display and sort order for multi-artist releases. `role` defaults to `"Primary Artist"` but is not currently exposed in the UI.

#### `ReleaseGenre` (junction)
Links releases to genres. `genreOrder` determines display order.

#### `ConditionGrade` (enum)

The Goldmine/Discogs grading scale, from highest to lowest:

| Prisma enum value | DB value | Display |
|---|---|---|
| `S` | `S` | Sealed |
| `M` | `M` | Mint |
| `NM` | `NM` | Near Mint |
| `VG_PLUS` | `VG+` | Very Good Plus |
| `VG` | `VG` | Very Good |
| `VG_MINUS` | `VG-` | Very Good Minus |
| `G_PLUS` | `G+` | Good Plus |
| `G` | `G` | Good |
| `FR` | `FR` | Fair |
| `P` | `P` | Poor |

The Prisma enum value (e.g., `VG_PLUS`) is what appears in TypeScript code. The DB-mapped value (e.g., `VG+`) is what the PostgreSQL `condition_grade` custom type stores. Any UI `conditionLabel` map must use the Prisma enum value as its key.

---

## 3. Directory Structure

```
vinyl-database/
├── app/
│   ├── actions/              # Server Actions (mutations only)
│   │   ├── createPressing.ts
│   │   ├── updatePressing.ts
│   │   ├── deletePressing.ts
│   │   └── updateRelease.ts
│   ├── api/                  # HTTP API routes (read-only, for autocomplete)
│   │   ├── artists/search/route.ts
│   │   └── releases/search/route.ts
│   ├── artists/[id]/
│   │   └── page.tsx          # Artist detail (server component)
│   ├── insurance/
│   │   ├── page.tsx          # Insurance report (server component)
│   │   └── PrintButton.tsx   # (client component)
│   ├── pressings/
│   │   ├── page.tsx          # Collection list (server component)
│   │   ├── ConditionInfo.tsx # Grading scale popover (client component)
│   │   ├── FilterPanel.tsx   # Filter dropdowns (client component)
│   │   ├── [id]/
│   │   │   ├── page.tsx      # Pressing detail (server component)
│   │   │   └── edit/
│   │   │       ├── page.tsx           # Edit pressing (server component)
│   │   │       └── EditPressingForm.tsx # (client component)
│   │   └── new/
│   │       ├── page.tsx           # New pressing (server component)
│   │       └── PressingsForm.tsx  # Add form with autocomplete (client)
│   ├── releases/[id]/edit/
│   │   ├── page.tsx           # Edit release (server component)
│   │   └── EditReleaseForm.tsx # (client component)
│   ├── search/
│   │   ├── page.tsx           # Search results (server component)
│   │   └── SearchForm.tsx     # Search form with mode toggle (client)
│   ├── globals.css            # Tailwind + CSS variables
│   ├── layout.tsx             # Root layout (fonts, metadata)
│   └── page.tsx               # Root route → redirect to /pressings
├── lib/
│   ├── prisma.ts              # Prisma client singleton
│   ├── artistSort.ts          # artistSortKey() utility
│   └── wildcardToRegex.ts     # wildcardToRegex() utility
├── prisma/
│   └── schema.prisma          # Database schema
├── __tests__/                 # Jest tests (mirrors app/ structure)
│   ├── actions/
│   ├── api/
│   ├── components/
│   └── lib/
├── jest.config.ts
├── jest.setup.ts
├── next.config.ts
├── prisma.config.ts           # Prisma 7 datasource config (reads DATABASE_URL)
├── tsconfig.json
└── package.json
```

---

## 4. Layer Contracts

### 4.1 Database → Prisma Client

**Contract:** Prisma generates a type-safe client from `prisma/schema.prisma`. All database access goes through this client — there are no raw SQL queries except in `app/search/page.tsx`.

**The Prisma singleton** lives in `lib/prisma.ts`:

```typescript
// lib/prisma.ts
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
  return new PrismaClient({ adapter })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()
```

- Uses `@prisma/adapter-pg` (the PostgreSQL adapter for Prisma 7).
- `DATABASE_URL` must be set in `.env` (loaded by `prisma.config.ts`).
- The singleton is cached on `globalThis` to survive hot-module replacement in development.
- **Do not import `PrismaClient` anywhere else.** Always import `prisma` from `@/lib/prisma`.

**Raw SQL** is used only in `app/search/page.tsx` via `prisma.$queryRaw<ResultRow[]>(Prisma.sql`...`)`. Parameterized with `Prisma.sql` template literals — never string-interpolate user input directly.

### 4.2 Prisma Client → Server Components

Server components call `prisma.*` methods directly. They run on the server at request time, so there is no API boundary between the page and the database.

**Pattern:**

```typescript
// app/pressings/page.tsx (simplified)
export default async function PressingsPage() {
  const pressings = await prisma.pressing.findMany({
    include: { release: { include: { artists: { include: { artist: true } } } }, format: true },
    orderBy: [{ pressingYear: 'asc' }],
  })
  // ... render
}
```

**Key constraint:** Prisma `Decimal` fields (`purchasePrice`, `currentValue`) and `Date` fields (`purchaseDate`) are **not plain JavaScript objects** and cannot be serialized across the React server/client boundary. Server components that need to pass these values to a client component must convert them first:

```typescript
// app/pressings/[id]/edit/page.tsx
const serialized = {
  ...pressing,
  purchasePrice: pressing.purchasePrice?.toString() ?? null,
  currentValue:  pressing.currentValue?.toString()  ?? null,
  purchaseDate:  pressing.purchaseDate?.toISOString().split('T')[0] ?? null,
}
```

### 4.3 Prisma Client → Server Actions

Server actions are the only mutation path. They are `async` functions marked `'use server'` and receive a `FormData` object.

**Invariants all server actions must uphold:**

1. Parse and validate all fields before writing to the database.
2. Treat empty strings from form fields as `null` for optional database columns.
3. Trim whitespace from all text inputs.
4. Call `redirect()` as the final step — this throws internally (Next.js design) and terminates the action.
5. Never return a value that the client depends on — use `redirect()` instead.

**FormData field naming** is the shared contract between client components (which build the `FormData`) and server actions (which read it). Any mismatch silently produces `null`. The field names for each action are documented in the [Component Reference](#5-component-reference) below.

### 4.4 Prisma Client → API Route Handlers

The two API routes (`/api/releases/search`, `/api/artists/search`) are used exclusively for autocomplete. They are read-only GET handlers and return JSON arrays.

**Contract:**

- Query parameter: `q` (string).
- If `q.length < 2`, return `[]` immediately without querying the database.
- Results are limited to `take: 10`.
- Response is always a JSON array (never an error object).

### 4.5 Server Actions → Client Components

Client components call server actions by importing them and invoking them as async functions:

```typescript
import { createPressing } from '@/app/actions/createPressing'

async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
  e.preventDefault()
  const data = new FormData(e.currentTarget)
  await createPressing(data)
}
```

After the action completes, Next.js handles the redirect server-side. The client component does not need to navigate — it just needs to disable its submit button (`pending` state) while waiting.

### 4.6 API Routes → Client Components

Client components fetch the autocomplete endpoints directly via `fetch()`, with a 300ms debounce:

```typescript
useEffect(() => {
  if (debouncedQuery.length < 2) { setResults([]); return }
  fetch(`/api/releases/search?q=${encodeURIComponent(debouncedQuery)}`)
    .then(r => r.json())
    .then(setResults)
}, [debouncedQuery])
```

The response shape for `/api/releases/search` is `ReleaseResult[]`:

```typescript
type ReleaseResult = {
  releaseId: number
  title: string
  originalReleaseYear: number
  artists: Array<{ artist: { name: string } }>
}
```

The response shape for `/api/artists/search` is `ArtistResult[]`:

```typescript
type ArtistResult = {
  artistId: number
  name: string
  sortName: string
}
```

### 4.7 Client Components → User

Client components use URL search parameters as the primary state mechanism for anything that should be bookmarkable or server-rendered (collection filters). Local React state is used for ephemeral UI state (dropdown open/closed, pending submission, autocomplete results).

**`FilterPanel`** reads `useSearchParams()` and calls `router.push()` to update the URL, which triggers a server re-render of the parent page with the new filter values.

**`SearchForm`** submits a native HTML form whose `action` defaults to the current page, so search parameters appear in the URL and the server component re-renders with results.

---

## 5. Component Reference

### 5.1 Server Components (Pages)

#### `app/page.tsx`
Immediately redirects to `/pressings`. No props or data fetching.

#### `app/pressings/page.tsx` — Collection list
**Data fetched:** All pressings (with release, artists, format), all artists, all formats, all genres (for filter dropdowns).

**Filtering:** `searchParams.artistId`, `searchParams.formatId`, `searchParams.genreId` are passed as Prisma `where` conditions.

**Sorting:** After the DB fetch, pressings are sorted in JavaScript by:
1. Primary artist `sortName` via `artistSortKey()` (strips articles, lowercases)
2. Then release title
3. Then pressing year

**Renders:** `<FilterPanel>` (client, inside `<Suspense>`), `<ConditionInfo>` (client), pressing table rows.

#### `app/pressings/new/page.tsx` — Add pressing
**Data fetched:** All formats, all genres.

**Renders:** `<PressingsForm formats genres>` (client component handles all interactivity).

#### `app/pressings/[id]/page.tsx` — Pressing detail
**Data fetched:** Single pressing with release (artists, genres), format.

**Renders:** Static detail sections — Release, Pressing details, Condition, Provenance & Value. Edit link.

#### `app/pressings/[id]/edit/page.tsx` — Edit pressing
**Data fetched:** Single pressing with release (artists), all formats.

**Serialization:** Converts `Decimal` and `Date` fields to strings before passing to the client component.

**Renders:** `<EditPressingForm pressing formats>`.

#### `app/releases/[id]/edit/page.tsx` — Edit release
**Data fetched:** Single release (artists, genres), all genres.

**Query params read:** `returnTo` — passed through to `<EditReleaseForm>` so the form can redirect back to the correct page after saving.

**Renders:** `<EditReleaseForm release genres returnTo>`.

#### `app/artists/[id]/page.tsx` — Artist detail
**Data fetched:** Single artist with all releases (each with pressings, formats, genres, all artists).

**Renders:** Artist header, release cards (grouped), per-release pressing sub-tables.

#### `app/search/page.tsx` — Advanced search
**Query params read:** `title`, `artist`, `year`, `regex` (`"1"` = regex mode, omitted = wildcard mode).

**Data fetched:** Raw SQL via `prisma.$queryRaw`. In wildcard mode, user patterns are processed by `wildcardToRegex()` and wrapped in `.*...*` for substring matching. In regex mode, patterns are used as-is.

**Error handling:** If the PostgreSQL regex is invalid, the `$queryRaw` call throws; the error is caught and displayed inline rather than crashing the page.

**Renders:** `<SearchForm>` (client, for UI toggle state), results table.

#### `app/insurance/page.tsx` — Insurance report
**Data fetched:** All pressings with `currentValue != null` (valued) and all without (unvalued), each with release and artists.

**Renders:** Summary totals, `<PrintButton>` (client), valued pressings table sorted by value descending, unvalued pressings table.

---

### 5.2 Client Components

#### `PressingsForm` (`app/pressings/new/PressingsForm.tsx`)

The most complex client component. Manages three mutually exclusive UI states for the release section:

| State | Condition |
|---|---|
| Search box | No release selected, not creating |
| Selected release banner | `selectedRelease !== null` |
| New release form | `creatingRelease === true` |

The pressing details section is only rendered when `releaseSelected` is true.

**FormData fields sent to `createPressing`:**

| Field | When present | Value |
|---|---|---|
| `releaseId` | Existing release selected | `number` |
| `newReleaseTitle` | Creating new release | `string` |
| `newReleaseYear` | Creating new release | `number` |
| `newArtistName` | Creating new release | `string` (always) |
| `newArtistId` | Creating new release + artist selected from autocomplete | `number` |
| `genreIds` | Creating new release + genres checked | `number[]` (repeating field) |
| `formatId` | Always | `number` |
| `discCount` | Always | `number` |
| `recordCondition` | Always | `ConditionGrade` enum string |
| `sleeveCondition` | Always | `ConditionGrade` or `""` |
| `pressingYear` | Always | `number` or `""` |
| `country` | Always | `string` or `""` |
| `label` | Always | `string` or `""` |
| `catalogNumber` | Always | `string` or `""` |
| `vinylColor` | Always | `string` or `""` |
| `purchasePrice` | Always | `number` or `""` |
| `purchaseDate` | Always | `YYYY-MM-DD` or `""` |
| `currentValue` | Always | `number` or `""` |
| `notes` | Always | `string` or `""` |

**Debounce:** Both the release and artist search fields debounce at 300ms before calling the API.

#### `EditPressingForm` (`app/pressings/[id]/edit/EditPressingForm.tsx`)

Renders all pressing fields as a controlled-ish form (uses `defaultValue` — not controlled). Has a two-click delete pattern: first click sets `confirming = true` and changes the button label; second click calls `deletePressing`.

**FormData fields sent to `updatePressing`:** Same pressing fields as `PressingsForm` above, minus the release/artist/genre fields (those are not editable here).

#### `EditReleaseForm` (`app/releases/[id]/edit/EditReleaseForm.tsx`)

Edits release-level data. Artist names are editable in-line; each artist has a hidden `artistIds` field so the server action knows which artist IDs to update.

**FormData fields sent to `updateRelease`:**

| Field | Value |
|---|---|
| `title` | `string` |
| `originalReleaseYear` | `number` |
| `notes` | `string` or `""` |
| `artistIds` | `number[]` (repeating) |
| `name[{artistId}]` | `string` — display name for that artist |
| `sortName[{artistId}]` | `string` — sort name for that artist (may be blank) |
| `genreIds` | `number[]` (repeating) |

#### `FilterPanel` (`app/pressings/FilterPanel.tsx`)

Three `<select>` dropdowns (artist, format, genre). On change, calls `router.push()` with updated URL search params. Uses `useSearchParams()` to read the current active values.

**Props:**
```typescript
{ artists: Artist[], formats: Format[], genres: Genre[] }
```

All data is passed in from the parent server component — `FilterPanel` itself makes no data fetches.

#### `ConditionInfo` (`app/pressings/ConditionInfo.tsx`)

Info icon button that toggles a popover listing all 10 condition grades with descriptions. Uses a `mousedown` event listener on `document` (registered only when open) to close when clicking outside. The `GRADES` array in this file is the authoritative source of grade definitions — if a new grade is added, it must be added here.

#### `SearchForm` (`app/search/SearchForm.tsx`)

Reads URL search params to initialize field values and the regex toggle. Submits as a standard HTML form (no `onSubmit` handler) — the browser updates the URL and the server component re-renders.

#### `PrintButton` (`app/insurance/PrintButton.tsx`)

Minimal component. Calls `window.print()` and is hidden via `print:hidden` Tailwind class so it disappears in the print output.

---

### 5.3 Server Actions

All actions are in `app/actions/`. All import `prisma` from `@/lib/prisma` and `redirect` from `next/navigation`.

#### `createPressing(formData: FormData)`

1. If `releaseId` is present in the form data, use it. Otherwise:
   a. If `newArtistId` is present, use that artist. Otherwise, create a new artist with `name = sortName = newArtistName`.
   b. Create a new release linked to the artist, with genres if any were selected.
2. Create the pressing record linked to the release.
3. `redirect('/pressings')`.

**Cascade behavior:** Artist creation has no fallback for duplicates — if a user types a name that already exists but doesn't select it from autocomplete, a second artist record will be created. The autocomplete is the mechanism for preventing duplicates.

#### `updatePressing(id: number, formData: FormData)`

Updates all pressing fields for the given `pressingId`. Does not touch the release. Empty strings are stored as `null` for optional fields.

**Null coercion rules:**
- Empty `sleeveCondition` → `null`
- Empty `pressingYear` → `null`
- Empty `country`, `label`, `catalogNumber`, `vinylColor` (after trim) → `null`
- Empty `purchasePrice`, `purchaseDate`, `currentValue` → `null`

#### `deletePressing(id: number)`

Calls `prisma.pressing.delete`. Then `redirect('/pressings')`.

**Note:** The `Release` is not deleted. If this was the last pressing for a release, the release remains in the database (orphaned). There is no UI to delete releases.

#### `updateRelease(releaseId: number, returnTo: string, formData: FormData)`

Executes inside a `prisma.$transaction`:
1. `tx.release.update` — title, year, notes.
2. For each `artistId` in `artistIds[]`: `tx.artist.update` — name and sortName (falls back to name if sortName is blank).
3. `tx.releaseGenre.deleteMany` — removes all existing genre associations.
4. If `genreIds[]` is non-empty, `tx.releaseGenre.createMany` — creates new associations.

Then `redirect(returnTo)`.

**Transaction guarantee:** All updates succeed or all fail. Genre replacement is atomic — there is no window where a release has no genres mid-update.

---

### 5.4 API Route Handlers

Both handlers follow the same pattern. They are Next.js Route Handlers (not Server Actions) because they serve JSON to client-side `fetch()` calls.

#### `GET /api/releases/search?q=`

Returns up to 10 releases whose `title` contains `q` (case-insensitive). Includes `artists` relation so the autocomplete can show artist names. Returns `[]` if `q.length < 2`.

#### `GET /api/artists/search?q=`

Returns up to 10 artists whose `name` contains `q` (case-insensitive), ordered by `sortName`. Returns `[]` if `q.length < 2`.

---

### 5.5 Library Utilities

#### `artistSortKey(sortName: string): string` — `lib/artistSort.ts`

Strips leading `The `, `A `, or `An ` (case-insensitive) from a sort name, then lowercases the result. Used to sort the collection list by a "filing" key that ignores articles.

```
"The Beatles"        → "beatles"
"A Tribe Called Quest" → "tribe called quest"
"Davis, Miles"       → "davis, miles"
"Beatles, The"       → "beatles, the"   ← note: article at end is not stripped
```

**Input convention:** Expects a `sortName` in filing form (e.g. `"Davis, Miles"`), not a display name (e.g. `"Miles Davis"`). The database stores both; the sort key is derived from `sortName`.

#### `wildcardToRegex(pattern: string): string` — `lib/wildcardToRegex.ts`

Converts a user-facing wildcard pattern to a PostgreSQL-compatible regex string:

1. Escapes all regex metacharacters (`.`, `+`, `^`, `$`, `{`, `}`, `(`, `)`, `[`, `]`, `\`, `|`).
2. Converts `*` → `.*` (any sequence of characters).
3. Converts `?` → `.` (any single character).

The result is intended for use with PostgreSQL's `~*` (case-insensitive regex match) operator.

---

## 6. Data Flows

### 6.1 Adding a Pressing

```
Browser                     Server                          Database
  │                            │                               │
  ├─ GET /pressings/new ───────►│                               │
  │                            ├─ prisma.format.findMany() ───►│
  │                            ├─ prisma.genre.findMany() ─────►│
  │◄── HTML (PressingsForm) ───┤                               │
  │                            │                               │
  ├─ type release title        │                               │
  ├─ GET /api/releases/search?q=... ►                          │
  │                            ├─ prisma.release.findMany() ──►│
  │◄── JSON ReleaseResult[] ───┤                               │
  │ (autocomplete dropdown)    │                               │
  │                            │                               │
  ├─ select release / create new                               │
  ├─ fill pressing fields      │                               │
  ├─ submit form ──────────────►│                               │
  │                     createPressing(formData)               │
  │                            ├─ [if new] artist.create() ──►│
  │                            ├─ [if new] release.create() ──►│
  │                            ├─ pressing.create() ──────────►│
  │                            ├─ redirect('/pressings')       │
  │◄── 302 /pressings ─────────┤                               │
```

### 6.2 Editing a Pressing

```
Browser                     Server                          Database
  │                            │                               │
  ├─ GET /pressings/{id}/edit ─►│                               │
  │                            ├─ pressing.findUnique() ───────►│
  │                            ├─ format.findMany() ───────────►│
  │                            │ (serialize Decimal/Date)       │
  │◄── HTML (EditPressingForm) ┤                               │
  │                            │                               │
  ├─ edit fields / submit ─────►│                               │
  │                     updatePressing(id, formData)           │
  │                            ├─ pressing.update() ───────────►│
  │                            ├─ redirect('/pressings')       │
  │◄── 302 /pressings ─────────┤                               │
```

### 6.3 Editing a Release

The edit release page is reached via a link from the edit pressing page, which encodes a `returnTo` parameter:

```
/pressings/{id}/edit  →  "Edit release" link
    → /releases/{releaseId}/edit?returnTo=/pressings/{id}/edit
    → (on save) redirect(returnTo)
    → /pressings/{id}/edit
```

Inside `updateRelease`, the transaction ensures all changes (title, artist names, genres) are atomic.

### 6.4 Advanced Search

```
Browser                     Server                          Database
  │                            │                               │
  ├─ GET /search ──────────────►│                               │
  │◄── HTML (SearchForm) ──────┤                               │
  │                            │                               │
  ├─ fill form, submit         │                               │
  ├─ GET /search?title=m*&regex=0 ►                            │
  │                            │ wildcardToRegex('m*') → 'm.*' │
  │                            ├─ prisma.$queryRaw(...~* 'm.*')►│
  │◄── HTML (results table) ───┤                               │
```

In regex mode, the user's pattern is passed directly to `~*`. Invalid patterns are caught and displayed as an error message rather than a 500.

---

## 7. Key Architectural Decisions

### Server Actions for all mutations
Forms call server actions directly — there are no REST mutation endpoints. This simplifies the client components (no `fetch` wrappers for writes) and means all write logic is co-located in `app/actions/`. The trade-off is that actions always `redirect()`, so there is no way to return validation errors to the form inline. If validation errors become a requirement, server actions would need to return an error shape rather than calling `redirect()`.

### URL params as filter state
The collection filter values (`artistId`, `formatId`, `genreId`) live in the URL, not in React state. This means filters survive a page refresh and can be bookmarked or shared. The `FilterPanel` client component reads the current URL, computes the new URL on change, and calls `router.push()` — this triggers a full server re-render with the new filter applied at the database query level.

### Client-side sort on server-fetched data
The collection list fetches all pressings and sorts them in JavaScript rather than in SQL. This allows the `artistSortKey()` logic (strip articles, lowercase) to be applied without a custom PostgreSQL collation or stored computed column. For collections up to a few thousand records this is fast enough; at larger scale, a PostgreSQL generated column for the sort key would be a natural extension.

### Raw SQL for search
The search page uses `prisma.$queryRaw` with PostgreSQL's `~*` operator because Prisma's query builder has no equivalent for regex matching. The query is parameterized via `Prisma.sql` tagged template literals, which prevents injection. The `artistJoin` subquery correctly handles multi-artist releases (a release where any of its artists matches the pattern is included).

### Decimal serialization at the server/client boundary
Prisma's `Decimal` type is a custom object (not a native JS number) and cannot cross the React server/client boundary. The edit pressing server component explicitly calls `.toString()` on both monetary fields before passing them to the client component. The client component receives them as `string | null` and renders them directly into `<input defaultValue>`. On form submission, they are sent back as strings and re-parsed to numbers in the server action.

### `$transaction` for release updates
`updateRelease` wraps its work in `prisma.$transaction` so that artist name updates and genre replacement are atomic. Without the transaction, a failure partway through (e.g., network drop between the artist update and the genre replacement) could leave the release in an inconsistent state.

---

## 8. Extensibility

### 8.1 Adding a New Page

1. Create a directory under `app/` following Next.js App Router conventions (e.g., `app/labels/page.tsx` for `/labels`).
2. Fetch data with `prisma.*` directly in the server component.
3. Add a navigation link wherever appropriate (e.g., in `app/pressings/page.tsx` header buttons).
4. If the page has write operations, add a server action in `app/actions/`.

### 8.2 Adding a New Pressing Field

Adding a field involves changes at every layer:

1. **Database / Prisma schema** (`prisma/schema.prisma`): Add the column to the `Pressing` model. Run `npx prisma migrate dev` (or update the SQL schema directly and run `npx prisma db pull` then `npx prisma generate`).

2. **Server action** (`app/actions/createPressing.ts`, `app/actions/updatePressing.ts`): Read the new field from `formData` and include it in the `data` object passed to Prisma. Apply the same null-coercion rules as other optional fields.

3. **New pressing form** (`app/pressings/new/PressingsForm.tsx`): Add the `<input>` or `<select>` with the correct `name` attribute inside the pressing details section.

4. **Edit pressing form** (`app/pressings/[id]/edit/EditPressingForm.tsx`): Add the same field with `defaultValue` populated from the `pressing` prop.

5. **If the field is a Prisma `Decimal` or `Date`:** Also update the serialization in `app/pressings/[id]/edit/page.tsx` and add the serialized type to the `Pressing` type in `EditPressingForm.tsx`.

6. **Display**: Add the field to the detail view (`app/pressings/[id]/page.tsx`) and/or the collection list (`app/pressings/page.tsx`) as appropriate.

7. **Tests**: Update `__tests__/actions/updatePressing.test.ts` and `createPressing.test.ts` to cover the new field.

### 8.3 Adding a New Condition Grade

The `ConditionGrade` enum is defined in three places that must all be updated:

1. **PostgreSQL schema**: Add the new value to the `condition_grade` enum type. This requires a `ALTER TYPE condition_grade ADD VALUE '...'` migration.
2. **Prisma schema** (`prisma/schema.prisma`): Add the new enum member with the appropriate `@map` value. Run `npx prisma generate`.
3. **`ConditionInfo.tsx`**: Add an entry to the `GRADES` array with grade, label, and description.
4. **Every `conditionLabel` map**: There are currently three copies of this record (in `app/pressings/page.tsx`, `app/artists/[id]/page.tsx`, and `app/pressings/[id]/edit/EditPressingForm.tsx` — the `CONDITIONS` array). All must be updated.
5. **Form `<select>` options**: `CONDITIONS` arrays in `PressingsForm.tsx` and `EditPressingForm.tsx`.

> **Refactoring opportunity:** The `conditionLabel` map and `CONDITIONS` array are duplicated across multiple files. Extracting them to `lib/conditions.ts` would make future additions a single-file change.

### 8.4 Adding a New Format or Genre

Formats and genres are reference data managed directly in the database — there is no UI for adding them. To add a new format or genre, insert a row directly:

```sql
INSERT INTO formats (name) VALUES ('78 RPM');
INSERT INTO genres (name) VALUES ('Classical');
```

No code changes are needed; the forms read all formats and genres from the database at request time.

### 8.5 Adding a New Server Action

1. Create `app/actions/myAction.ts` with `'use server'` at the top.
2. Import `prisma` from `@/lib/prisma` and `redirect` from `next/navigation`.
3. Accept `FormData` (for form-driven actions) or typed parameters (for programmatic actions).
4. End with `redirect(destination)`.
5. Import and call from the client component:
   ```typescript
   import { myAction } from '@/app/actions/myAction'
   ```
6. Add a test in `__tests__/actions/myAction.test.ts` using the mock Prisma pattern established in the existing action tests.

### 8.6 Adding a New API Route

API routes should be added only for data that client components need to fetch asynchronously (e.g., autocomplete). All other data should be fetched in server components.

1. Create `app/api/{resource}/{operation}/route.ts`.
2. Export a `GET` (or `POST`) function using `NextRequest` / `NextResponse`.
3. Follow the established pattern: check minimum query length, query Prisma, return `NextResponse.json(results)`.
4. Add a test in `__tests__/api/{resource}-{operation}.test.ts`.

### 8.7 Adding Tests

The test suite uses:
- **`jest-environment-jsdom`** (default) for component tests.
- **`@jest-environment node`** docblock for server action and API route tests (avoids DOM overhead and matches the actual server runtime).

**Mocking Prisma:** All tests that involve Prisma mock the entire `@/lib/prisma` module:

```typescript
const mockFindMany = jest.fn()
jest.mock('@/lib/prisma', () => ({
  prisma: {
    pressing: { findMany: (...args: unknown[]) => mockFindMany(...args) },
  },
}))
```

**Mocking `next/navigation`:**

```typescript
jest.mock('next/navigation', () => ({
  redirect: jest.fn(),
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
```

**Mocking `$transaction`:** The callback must actually be invoked, so use `mockImplementation`:

```typescript
mockTransaction.mockImplementation(async (fn) => fn(mockTx))
```

**Component tests** render with `@testing-library/react` and interact with `userEvent.setup()` (v14 API — do not use the legacy `userEvent.click()` directly).

---

## 9. Configuration Reference

### `prisma.config.ts`
Prisma 7 datasource configuration. Reads `DATABASE_URL` from the environment (loaded by `dotenv/config`). The schema path is `prisma/schema.prisma`. This file takes precedence over any `url` field in `schema.prisma` — the schema file intentionally has no `url` in the `datasource` block.

### `next.config.ts`
Minimal. No special redirects, rewrites, or environment variable exposure configured.

### `tsconfig.json`
- `strict: true` — all strict TypeScript checks are enabled.
- `paths: { "@/*": ["./*"] }` — the `@/` alias maps to the project root. Use this in all imports rather than relative paths.
- `moduleResolution: "bundler"` — required for Next.js 16.

### `jest.config.ts`
- `testEnvironment: 'jsdom'` — default for component tests; override per-file with `@jest-environment node`.
- `setupFilesAfterEnv: ['<rootDir>/jest.setup.ts']` — loads `@testing-library/jest-dom` matchers.
- `moduleNameMapper: { '^@/(.*)$': '<rootDir>/$1' }` — resolves the `@/` alias in tests.
- `testMatch: ['<rootDir>/__tests__/**/*.test.{ts,tsx}']` — only runs files in `__tests__/`.

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string, e.g. `postgresql://user@localhost:5432/vinyl_database` |
