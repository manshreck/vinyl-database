# Vinyl Database

A multi-user web application for managing a personal vinyl record collection, built with Next.js, Prisma, and PostgreSQL. Each account gets its own dedicated Postgres database, created automatically at registration.

## Prerequisites

### Node.js

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

### npm

npm (the Node package manager) is bundled with Node.js — installing Node.js above already installs npm on both macOS and Windows, so there's nothing extra to do. Verify it's available:

```bash
npm --version
```

### npx

npx (used to run package binaries like `npx prisma ...` without a global install) has shipped with npm since npm 5.2, so it's already available on both macOS and Windows once Node.js is installed. Verify it's available:

```bash
npx --version
```

### Prisma

Prisma is a project dependency, not a system-wide tool — running `npm install` in the [Project Setup](#project-setup) step below installs it automatically, identically on macOS and Windows. No separate installation is needed; the `npx prisma ...` commands used later in this guide work the same on both platforms.

### PostgreSQL

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

## Database Setup

This app uses two kinds of database:

- **A control-plane database** (`vinyl_control`) — shared, holds accounts and sessions. Create it once:

  ```bash
  createdb vinyl_control
  ```

  Its tables (`users`, `sessions`) are created automatically the first time the app connects — no schema file to load.

- **A tenant database per account** (`vinyl_user_<random>`) — created automatically when someone registers via `/register`. You don't create these by hand.

## Project Setup

Install dependencies:

```bash
npm install
```

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

To get a Discogs token:

1. Sign in (or create a free account) at [discogs.com](https://www.discogs.com).
2. Go to **Settings → Developers** ([discogs.com/settings/developers](https://www.discogs.com/settings/developers)).
3. Click **Generate new token** and copy it into `DISCOGS_TOKEN` above.

This is a personal access token tied to your Discogs account, not per-app-user credentials — every search request the app makes uses this single token server-side, so individual users of this app never need their own Discogs account. Discogs' free tier caps authenticated requests at 60/minute, shared across the whole app.

Generate the Prisma client (used for tenant databases):

```bash
npx prisma generate
```

If you change `prisma/schema.prisma`, regenerate the DDL applied to new tenant databases:

```bash
npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script > prisma/tenant-schema.sql
```

Existing tenant databases are **not** migrated automatically — that's a manual step per account today (see `DEVELOPER_GUIDE.md`).

## Running Tests

### Install test dependencies

The test suite uses Jest and React Testing Library. These are development dependencies and only need to be installed once (they are included automatically if you ran `npm install` from the Project Setup step above, but can be added explicitly if needed):

```bash
npm install --save-dev jest jest-environment-jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom @types/jest
```

### Run the tests

Run the full suite once:

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

The suite covers utility functions, server actions, API route handlers, and interactive UI components. No database connection is required — all Prisma calls are mocked.

## Running the App

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser. Unauthenticated requests redirect to `/login`; from there, follow the link to `/register` to create an account — this provisions your personal collection database automatically. After registering (or logging in), you'll land on the collection list at `/pressings`.
