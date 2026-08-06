import { Client } from 'pg'
import { assertSafeSchemaName, controlSchema, databaseUrl } from '@/lib/dbUrls'
import {
  emitTenantSql,
  exportReadClient,
  preserveExactText,
  sqlLiteral,
  quoteIdent,
} from '@/lib/exportTenant'

/**
 * Control-plane DDL for a restore.
 *
 * Mirrors controlDb.ts's bootstrap, minus the ALTER TABLE lines, which exist there to
 * migrate older installs forward and have nothing to add to a table being created
 * fresh. Restoring into a database this app then boots against is safe either way:
 * that bootstrap is `IF NOT EXISTS` throughout.
 */
const CONTROL_DDL = `CREATE TABLE users (
  id             SERIAL PRIMARY KEY,
  email          VARCHAR(255) NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  database_name  VARCHAR(63) NOT NULL UNIQUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at  TIMESTAMPTZ,
  discogs_token  TEXT,
  full_name      TEXT
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE admin_sessions (
  token_hash TEXT PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL
);`

function header(generatedAt: Date, tenantCount: number, userCount: number): string {
  return `--
-- Vinyl Database — whole-system backup.
-- Generated ${generatedAt.toISOString()}
--
-- Contains the control plane (${userCount} account${userCount === 1 ? '' : 's'}) and
-- ${tenantCount} tenant schema${tenantCount === 1 ? '' : 's'}, rebuilt under their live names.
--
-- ============================ TREAT THIS FILE AS A SECRET ============================
-- It contains every account's password hash and Discogs API token. Store it as you
-- would a password. Anyone holding it can attempt offline cracking of those hashes and
-- can use those Discogs tokens directly.
-- ====================================================================================
--
-- Login sessions are deliberately NOT included. Restoring them would revive every
-- session token that was live when the backup was taken, so a leaked backup plus a
-- restore would hand over logged-in access. The sessions tables are created empty;
-- everyone signs in again after a restore.
--
-- To restore into a fresh, empty database:
--
--   createdb vinyl_restored
--   psql -d vinyl_restored -f <this file>
--
-- Then point DATABASE_URL at it. Restore into an EMPTY database: this file creates
-- schemas and tables, and will fail against a database that already has them.
--
`
}

/**
 * A tenant schema recorded in the control plane but absent from the database, or vice
 * versa. Either direction means the backup would be wrong in a way its reader could
 * not detect, so it refuses to produce a file at all — the same reasoning as the
 * per-tenant export's unknown-table guard, one level up.
 */
function assertTenantsConsistent(fromUsers: string[], fromDatabase: string[]): void {
  const missing = fromUsers.filter((s) => !fromDatabase.includes(s))
  const orphaned = fromDatabase.filter((s) => !fromUsers.includes(s))

  if (missing.length > 0) {
    throw new Error(
      `Backup refused: ${missing.length} account(s) reference schema(s) that do not exist: ` +
        `${missing.join(', ')}. The control plane and the database disagree; investigate ` +
        'before trusting any backup.'
    )
  }
  if (orphaned.length > 0) {
    throw new Error(
      `Backup refused: schema(s) present with no account: ${orphaned.join(', ')}. ` +
        'These would be silently omitted. Remove them, or add them to an account, first.'
    )
  }
}

/**
 * Builds one .sql file rebuilding the entire system — control plane plus every tenant
 * schema, under their live names — into an empty database.
 *
 * This is the blast-radius answer to running every tenant in one database: the
 * per-account export protects one collection, this protects all of them at once.
 * It complements rather than replaces provider-side backups and `pg_dump`; what it
 * adds is a no-tooling-required option whose restore path is the same `psql -f` users
 * already use.
 */
export async function buildSystemBackup(generatedAt: Date = new Date()): Promise<string> {
  const control = controlSchema()
  assertSafeSchemaName(control)

  // preserveExactText for the same reason the tenant reader uses it: users.created_at
  // is a timestamptz, and a JS Date would be emitted lossily and unparseably.
  const client = new Client({ connectionString: databaseUrl(), types: preserveExactText })
  await client.connect()

  let users: Array<Record<string, unknown>>
  let userFields: string[]
  let tenantSchemas: string[]

  try {
    // Source of truth for which schemas are live tenants. A schema that exists but no
    // account claims is an anomaly, not a tenant — see assertTenantsConsistent.
    const usersResult = await client.query(
      `SELECT * FROM ${quoteIdent(control)}.users ORDER BY id`
    )
    users = usersResult.rows
    userFields = usersResult.fields.map((f) => f.name)
    tenantSchemas = users.map((u) => String(u.database_name))

    const { rows: nsRows } = await client.query<{ nspname: string }>(
      `SELECT nspname FROM pg_namespace WHERE nspname LIKE 'vinyl\\_user\\_%'`
    )
    assertTenantsConsistent(tenantSchemas, nsRows.map((r) => r.nspname))
  } finally {
    await client.end()
  }

  const out: string[] = [header(generatedAt, tenantSchemas.length, users.length)]

  // ── Control plane ──
  out.push(
    `-- ${'='.repeat(70)}`,
    `-- Control plane: accounts. Sessions intentionally omitted (see header).`,
    `-- ${'='.repeat(70)}`,
    `CREATE SCHEMA ${quoteIdent(control)};`,
    `SET search_path TO ${quoteIdent(control)};`,
    '',
    CONTROL_DDL,
    '',
    `-- users: ${users.length} row${users.length === 1 ? '' : 's'}`
  )
  const userColumns = userFields.map(quoteIdent).join(', ')
  for (const row of users) {
    const values = userFields.map((f) => sqlLiteral(row[f])).join(', ')
    out.push(`INSERT INTO users (${userColumns}) VALUES (${values});`)
  }
  out.push(
    '',
    `SELECT setval(pg_get_serial_sequence('users', 'id'), ` +
      `COALESCE(MAX(id), 1), MAX(id) IS NOT NULL) FROM users;`,
    ''
  )

  // ── Tenants, each under its live schema name ──
  for (const schema of tenantSchemas) {
    const tenantClient = exportReadClient(schema)
    await tenantClient.connect()
    try {
      out.push(
        `-- ${'='.repeat(70)}`,
        `-- Tenant schema: ${schema}`,
        `-- ${'='.repeat(70)}`,
        ...(await emitTenantSql(tenantClient, schema, schema))
      )
    } finally {
      await tenantClient.end()
    }
  }

  return out.join('\n')
}
