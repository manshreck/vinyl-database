# Vinyl Database

A multi-user web application for managing a personal vinyl record collection, built with Next.js, Prisma, and PostgreSQL. Each account gets its own dedicated Postgres database, created automatically at registration.

## Prerequisites

This project requires the following package and framework installations:

* Node.js (JavaScript runtime). Node.js includes npm and npx for managing and running Node package extensions
* PostgreSQL (Database)
* Prisma (installed via npm) for connecting Node.js code to PostgreSQL and generating and utilizing schemas.

After installing these packages, you will need to perform the following setup tasks:

* Seed and install an initial database
* (Optional, but recommended) Obtain a Discogs API access token for accessing the Discogs record API
* Set up environment variables for the database and discogs access
* Generate the Prisma client (via npm)
* Install the Jest testing framework and React testing library (via npm)
* (Optional, only needed for end-to-end tests) Install Playwright and its browser binary (via npm)

Once you have installed everything and set up your environment, you can then run the test suite and run the
application. The following sections walk you through this.

## Installing Packages and Frameworks

### Installing Node.js

Node.js is the JavaScript runtime this project runs on. This project requires Node.js 18 or later.

**macOS** — the recommended way is via [Homebrew](https://brew.sh):

```bash
# Install Homebrew (if not already installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Node.js
brew install node
```

**Windows** — download and run the LTS installer from [nodejs.org](https://nodejs.org), or install from the command line:

```powershell
# Using winget
winget install OpenJS.NodeJS.LTS

# Or using Chocolatey
choco install nodejs-lts
```

Verify the installation (same command on both platforms):

```bash
node --version
```

### Verifing npm and npx

npm (the Node package manager) is bundled with Node.js — installing Node.js above already installs npm on both macOS and Windows, so there's nothing extra to do. Verify it's available:

```bash
npm --version
```

npx (used to run package binaries like `npx prisma ...` without a global install) has shipped with npm since npm 5.2, so it's already available on both macOS and Windows once Node.js is installed. Verify it's available:

```bash
npx --version
```

### Installing PostgreSQL

**macOS** — install and start via [Homebrew](https://brew.sh):

```bash
brew install postgresql@16
echo 'export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
brew services start postgresql@16
```

**Windows** — download and run the installer from [postgresql.org](https://www.postgresql.org/download/windows/) (or install from the command line), which registers PostgreSQL as a Windows service that starts automatically:

```powershell
# Using winget
winget install PostgreSQL.PostgreSQL
```

If `psql` or `createdb` aren't recognized afterward, add PostgreSQL's `bin` directory to your `PATH` (e.g. `C:\Program Files\PostgreSQL\16\bin`). If you ever need to start or stop the service manually, use the **Services** app (`services.msc`) or `pg_ctl`, rather than macOS's `brew services`.

## Setting Up the Application

### Setting Up the Databases

This app uses two kinds of databases, a single control database holding user accounts, and one "tenant" database per user for that user's record collection. Only the control database needs to be initialized manually:

- **A control-plane database** (`vinyl_control`) is shared and holds accounts and sessions. Create it once:

  ```bash
  createdb vinyl_control
  ```

  Its tables (`users`, `sessions`) are created automatically the first time the app connects; no schema file needs to load and no field seeds are needed.

- **A tenant database per account** (`vinyl_user_<random>`) is created automatically when someone registers via `/register`. You don't create these by hand.


### Obtain a Discogs API Token

To get a Discogs API token:

1. Sign in (or create a free account) at [discogs.com](https://www.discogs.com).
2. Go to **Settings → Developers** ([discogs.com/settings/developers](https://www.discogs.com/settings/developers)).
3. Click **Generate new token** and keep it accessible — you'll paste it into the `.env` file's `DISCOGS_TOKEN` line in the next step.

This is a personal access token tied to your Discogs account, not per-app-user credentials — every search request the app makes uses this single token server-side, so individual users of this app never need their own Discogs account. Discogs' free tier caps authenticated requests at 60/minute, shared across the whole app. TODO: this is sufficient for testing but will not scale. Before stress testing, per-user discog tokens will need to be stored and cached.

### Create Environment Variables

Create a `.env` file in the project root:

```ini
# Template used to derive both the Postgres maintenance connection (for CREATE DATABASE)
# and every tenant database's connection — only the database name in the path differs.
DATABASE_URL="postgresql://your_username@localhost:5432/vinyl_database"

# The shared control-plane database (accounts and sessions).
CONTROL_DATABASE_URL="postgresql://your_username@localhost:5432/vinyl_control"

# Powers the "Search Discogs" feature (searching Discogs' catalog and prefilling
# a new pressing/wishlist item from a result). Optional — the rest of the app works
# without it, but /discogs will show a "not configured" error until it's set.
DISCOGS_TOKEN="your_discogs_personal_access_token"
```

### Generate Project Dependencies

Install any needed dependencies by npm:

```bash
npm install
```

Generate the Prisma client (used for tenant databases):

```bash
npx prisma generate
```

If you change `prisma/schema.prisma`, regenerate the DDL applied to new tenant databases:

```bash
npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script > prisma/tenant-schema.sql
```

Existing tenant databases are **not** migrated automatically — that's a manual step per account today (see `DEVELOPER_GUIDE.md`).

The test suite uses Jest and React Testing Library. These are development dependencies and only need to be installed once (they are included automatically if you ran `npm install` from the Project Setup step above, but can be added explicitly if needed):

```bash
npm install --save-dev jest jest-environment-jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom @types/jest
```

End-to-end tests (see below) use [Playwright](https://playwright.dev), which also needs its own browser binary downloaded once. Also included automatically by `npm install`, but only needed if you plan to run `npm run test:e2e`:

```bash
npm install --save-dev @playwright/test
npx playwright install chromium
```

## Running the Tests

This project has four tiers of tests, matched to how much they need to be true to run (see `TESTING.md` for the full breakdown):

Run the fast suite (unit, component — no external dependencies, safe to run constantly):

```bash
npm test
```

Run in watch mode (re-runs affected tests on file save):

```bash
npm run test:watch
```

Run with a coverage report:

```bash
npm run test:coverage
```

Run the integration suite (seam and system tests — needs a local Postgres running, per the Prerequisites above):

```bash
npm run test:integration
```

Run the Discogs contract test (needs `DISCOGS_TOKEN` and network access — not run automatically, since it costs a real request against the shared rate-limited token):

```bash
npm run test:contract
```

Run the end-to-end suite (Playwright, real browser — needs local Postgres, `DISCOGS_TOKEN`, and starts its own dev server if one isn't already running on port 3000):

```bash
npm run test:e2e
```

`npm test` covers utility functions, server actions, API route handlers, and interactive UI components — no database connection is required, all Prisma calls are mocked. The other three tiers hit a real (disposable, per-test) database and, for `test:contract`/`test:e2e`'s Discogs journey, the real Discogs API.

## Running the App

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser. Unauthenticated requests redirect to `/login`; from there, follow the link to `/register` to create an account — this provisions your personal collection database automatically. Store your username/password somewhere safe: passwords are hashed (not reversible) and there's no password-reset flow, so a lost password can't be recovered, even for a test account.

After registering (or logging in), you'll land on the collection list at `/pressings`.
