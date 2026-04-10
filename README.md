# Vinyl Database

A web application for managing a personal vinyl record collection, built with Next.js, Prisma, and PostgreSQL.

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

Create the database and load the schema (the schema file lives in the companion `vinyl-database-db` repository):

```bash
createdb vinyl_database
psql -d vinyl_database -f path/to/vinyl-database-db/db/schema.sql
```

## Project Setup

Install dependencies:

```bash
npm install
```

Create a `.env` file in the project root with your database connection string:

```ini
DATABASE_URL="postgresql://your_username@localhost:5432/vinyl_database"
```

Generate the Prisma client:

```bash
npx prisma generate
```

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

Open [http://localhost:3000](http://localhost:3000) in your browser. The app will redirect to the collection list at `/pressings`.
