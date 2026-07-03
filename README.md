# Vinyl Database

A multi-user web application for managing a personal vinyl record collection, built with Next.js, Prisma, and PostgreSQL. Each account gets its own dedicated Postgres database, created automatically at registration.

## Prerequisites

### Node.js and npm

Node.js includes npm (the Node package manager). The recommended way to install Node.js on macOS is via [Homebrew](https://brew.sh).

**Install Homebrew** (if not already installed):

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

**Install Node.js:**

```bash
brew install node
```

Verify the installation:

```bash
node --version
npm --version
```

You should see version numbers for both. This project requires Node.js 18 or later.

### PostgreSQL

Install and start PostgreSQL:

```bash
brew install postgresql@16
echo 'export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
brew services start postgresql@16
```

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
