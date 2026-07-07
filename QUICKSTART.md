# Quickstart — New to This Project? Start Here

Welcome! This guide is for someone joining the project with little prior experience in
this particular stack. It won't make you an expert — it will get you oriented, get the
app running on your machine, walk you through one small change end to end, and tell you
where to look when you need more depth.

## The documents, and when to read each one

| Document | What it's for | When to read it |
|---|---|---|
| **QUICKSTART.md** (this file) | Orientation and your first change | Today |
| **README.md** | Installing prerequisites and running the app | Today, alongside this file |
| **DESIGN.md** | The full design spec: architecture, data model, every action and page | Skim §1–§5 this week; use the rest as a reference |
| **DEVELOPER_GUIDE.md** | Hands-on procedures and recipes (§8 "Extensibility" has step-by-step recipes for common changes) | When you're about to make a change |
| **AGENTS.md** | A one-paragraph warning about our Next.js version | Read it now — it's 4 lines |

## What the app is, in three sentences

It's a website where people catalog their vinyl record collections: the records they
own, the condition and value of each, and a wishlist of records they want. Each user
account gets its **own private PostgreSQL database**, created automatically when they
register — that's the most unusual thing about this codebase, and it's explained below.
There's also a search against [Discogs](https://www.discogs.com) (a public music
database) so users can add records without typing everything by hand.

## The stack, in plain terms

- **Next.js** (a React framework). Don't panic if you haven't used it. The key idea:
  files under `app/` become pages. `app/pressings/page.tsx` is the code for the
  `/pressings` page. Most pages here run **on the server** — they query the database
  directly and return HTML. There is no separate "backend API" for most of the app;
  the page file *is* the backend and the frontend together.
- **Server actions** (files in `app/actions/`) are how forms save data. A form on a
  page submits straight to one of these functions, which runs on the server, writes to
  the database, and redirects. Every create/update/delete in the app is one of these
  files — there are 13, and they're all short.
- **Prisma** is the database toolkit. The database structure is declared in
  `prisma/schema.prisma`; Prisma generates a typed client so queries look like
  `prisma.pressing.findMany({ where: ... })` instead of raw SQL.
- **Tailwind CSS** for styling — those long `className="rounded-lg border ..."` strings.
  You compose styles from small utility classes instead of writing CSS files.
- **TypeScript** everywhere, **Jest** for tests, **PostgreSQL** for storage.

> ⚠️ **One rule before you Google anything:** our Next.js version (16) changed several
> APIs, so many tutorials and older AI answers are wrong for this repo. The correct
> docs are on your disk at `node_modules/next/dist/docs/`. Two examples you'll hit
> immediately: `params`/`searchParams` in pages must be `await`ed, and the file other
> projects call "middleware" is `proxy.ts` here.

## The one unusual design decision: a database per user

Most multi-user apps put everyone's rows in shared tables with a `user_id` column.
This app instead gives every account its **own database**, named like
`vinyl_user_a1b2c3d4e5f6`:

- One shared **control database** (`vinyl_control`) holds only accounts and login
  sessions.
- When a request comes in, the session cookie tells us which user it is, and therefore
  **which database to connect to**. All their collection queries run against that
  database alone.

Practical consequences for you:

- You will never write a query that filters by user — the connection itself is the
  security boundary.
- Nearly every page and action starts with the same two lines. Get used to them:

  ```ts
  const session = await requireSession()                    // who is this? (or redirect to /login)
  const prisma = await getTenantPrisma(session.databaseName) // connect to THEIR database
  ```

- Changing the database schema means updating **every** user's database (see
  "Changing the database schema" below) — it is not automatic.

DESIGN.md §3–§4 explains this fully.

## Getting it running

Follow **README.md** top to bottom (install Node, PostgreSQL, create `vinyl_control`,
write your `.env`, `npm install`, `npx prisma generate`). Then:

```bash
npm run dev
```

Open http://localhost:3000, register a throwaway account (this creates your own tenant
database — you can watch it appear with `psql -l`), and click around: add a record, add
a wishlist item, try the search. Ten minutes of using the app will teach you the domain
vocabulary (release vs. pressing, condition grades, wishlist) faster than any document.

The `DISCOGS_TOKEN` in `.env` is optional — skip it at first; only the "Search Discogs"
feature needs it.

**Never commit `.env`.** It's gitignored, and it contains a real API token.

## A map of the code

```
app/                    ← pages (what users see) — folder path = URL path
  page.tsx              ← the landing page at "/"
  pressings/            ← the collection: list, new, [id] detail, [id]/edit
  wishlist/             ← same shape as pressings, plus add-to-collection
  discogs/              ← Discogs search + detail
  search/  insurance/  artists/  releases/  admin/  login/  register/
  actions/              ← ALL writes to the database (13 small files)
  api/                  ← 2 tiny JSON endpoints used by the form autocomplete boxes
lib/                    ← shared server code: sessions, DB connections,
                          tenant provisioning, Discogs client, small utilities
prisma/
  schema.prisma         ← the database structure (the source of truth)
  tenant-schema.sql     ← generated SQL applied to each NEW user's database
  referenceData.ts      ← the fixed lists of formats and genres
__tests__/              ← Jest tests, mirroring the folders above
proxy.ts                ← redirects logged-out visitors to /login
```

Rule of thumb for finding anything: **start from the URL.** Bug on `/wishlist/5/edit`?
Open `app/wishlist/[id]/edit/`. The page file loads the data; the form component next
to it renders the inputs; the save button points at a file in `app/actions/`.

## How a change flows through the system

Take "user edits a wishlist item" as the canonical example:

1. `app/wishlist/[id]/edit/page.tsx` runs on the server: checks the session, loads the
   item from that user's database, renders the form component with the data as props.
2. `EditWishlistItemForm.tsx` (marked `'use client'`, so it runs in the browser) shows
   the inputs and handles clicks.
3. Submitting calls `app/actions/updateWishlistItem.ts` on the server, which checks the
   session again, writes with Prisma, and redirects to `/wishlist`.

Almost every feature in the app is this same triangle: **page → form → action**. When
you add a feature, you'll usually touch one file of each kind, plus sometimes
`prisma/schema.prisma` and a test.

## Your first changes, easiest to hardest

For each of these, DEVELOPER_GUIDE.md §8 ("Extensibility") has a matching step-by-step
recipe — follow it rather than improvising.

1. **Change some text or styling** — edit the page file, save, browser refreshes
   automatically. Zero risk.
2. **Add a genre or format** (§8.4) — one line in `prisma/referenceData.ts`... but note
   that existing users' databases were seeded already, so they need a manual
   `INSERT` too. Your first taste of the tenant-database trade-off.
3. **Add a field to a form that already exists in the database** — add the `<input>`
   in the form component, read it in the action (copy the pattern of a neighboring
   field), display it on the detail page.
4. **Add a brand-new database field** (§8.2) — schema change; read the next section
   first.
5. **Add a new page** (§8.1) — new folder under `app/` with a `page.tsx`; copy the
   closest existing page as a starting point.

## Changing the database schema (the careful one)

There are **no automatic migrations** in this project. The procedure (full detail in
DEVELOPER_GUIDE.md and README.md):

1. Edit `prisma/schema.prisma`.
2. `npx prisma generate` — regenerates the typed client.
3. Regenerate the SQL for future new users:
   `npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script > prisma/tenant-schema.sql`
4. Apply the change to each **existing** database by hand — your dev database and every
   `vinyl_user_*` database (`npx prisma db push` with `DATABASE_URL` pointed at each).
5. **Restart the dev server.** It caches the old Prisma client; the symptom of
   forgetting is a baffling `Cannot read properties of undefined (reading 'create')`.

If step 4 sounds error-prone: it is, deliberately accepted at this project's scale.
Don't invent your own workaround; ask first.

## Testing and checking your work

```bash
npm test            # ~150 Jest tests; no database needed (everything is mocked)
npx tsc --noEmit    # type-check the whole project
npm run lint        # eslint (a handful of pre-existing errors exist; don't add new ones)
```

Before opening a PR: all three of the above, **plus actually click through the feature
in the browser**. The tests mock the database, so they can't catch a wrong query
against real data.

To write a test, find the existing test closest to your change in `__tests__/` and copy
its structure — the mocking patterns (fake session, fake Prisma) are already worked out
there, and inventing new ones is where test-writing goes wrong.

## Gotchas that bite newcomers

- **Old Next.js knowledge misleads.** See the warning box above; check
  `node_modules/next/dist/docs/` when the framework surprises you.
- **`redirect()` and `notFound()` throw.** They work by throwing a special exception,
  so code after them never runs — and wrapping them in `try/catch` breaks them.
- **`'use client'` vs. server.** If you add `useState` or an `onClick` to a file
  without `'use client'` at the top, you'll get a build error. Only form/interactive
  components need it; keep pages as server components.
- **Empty form fields become `NULL`.** Actions normalize with
  `(formData.get('x') as string).trim() || null` — keep that pattern so the database
  never stores empty strings.
- **A "release" is shared.** Editing a release's title (or its artist's name) changes
  it for every pressing and wishlist item that points to it. That's by design.
- **Admin login is `admin` with a blank password.** Intentional for local development
  only; the code and the admin page both carry warnings.

## Where to get more depth

- *"How does X work architecturally?"* → **DESIGN.md** (routes table in §6.2, every
  action specified in §7, every page in §8).
- *"What exact steps do I follow to add Y?"* → **DEVELOPER_GUIDE.md §8**, and its §4
  "Layer Contracts" for how the pieces talk to each other.
- *"Why is the framework behaving weirdly?"* → `node_modules/next/dist/docs/`.
- *"What does this Prisma call do?"* → https://www.prisma.io/docs (the ORM's own docs
  are current and good).
- And read the code: the whole app is ~5,000 lines, the patterns repeat everywhere, and
  the `pressings` folder is the template the rest of the app was built from.
