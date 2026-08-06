import { readFileSync } from 'fs'
import { join } from 'path'
import { Client, types as pgTypes } from 'pg'
import { assertSafeSchemaName, schemaConnectionConfig } from '@/lib/dbUrls'

/**
 * Types whose Postgres text form carries more than the JS value would.
 *
 * A timestamptz stores microseconds; parsing it into a JS Date and formatting with
 * toISOString() silently truncates to milliseconds, so an exported-then-restored row
 * no longer equals the original. Taking Postgres' own text representation instead
 * round-trips exactly. date/numeric are here for the same reason — no timezone
 * reinterpretation, no float rounding.
 */
const PRESERVE_AS_TEXT_OIDS = new Set([
  1082, // date
  1114, // timestamp
  1184, // timestamptz
  1700, // numeric
])

export const preserveExactText = {
  getTypeParser: ((oid: number, format?: unknown) =>
    PRESERVE_AS_TEXT_OIDS.has(oid)
      ? (value: string) => value
      : (pgTypes.getTypeParser as (o: number, f?: unknown) => unknown)(
          oid,
          format
        )) as typeof pgTypes.getTypeParser,
}

/**
 * Shipped verbatim in the export so the file rebuilds the database on its own — the
 * point of the feature is that your data outlives this app, which it can't do if
 * restoring requires the app's source to supply the schema.
 */
const TENANT_SCHEMA_SQL = readFileSync(join(process.cwd(), 'prisma/tenant-schema.sql'), 'utf8')

/**
 * Parents before children, so a restore never inserts a row whose foreign key target
 * doesn't exist yet. Adding a table here without regard to that order produces a file
 * that looks fine and fails halfway through a restore.
 */
const TABLES_IN_RESTORE_ORDER = [
  'artists',
  'genres',
  'formats',
  'releases',
  'release_artists',
  'release_genres',
  'pressings',
  'wishlist_items',
]

/** SERIAL primary keys, whose sequences must be advanced past the restored rows. */
const SERIAL_KEYS: Array<[table: string, column: string]> = [
  ['artists', 'artist_id'],
  ['genres', 'genre_id'],
  ['formats', 'format_id'],
  ['releases', 'release_id'],
  ['pressings', 'pressing_id'],
  ['wishlist_items', 'wishlist_item_id'],
]

export function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}

/**
 * Renders one column value as a SQL literal. Doubling the single quote is the whole
 * escape: Postgres runs with standard_conforming_strings on, so a backslash inside a
 * literal is an ordinary character rather than an escape introducer.
 */
export function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  // A Date here means the reading client was built without preserveExactText. Left
  // alone, String(date) yields "Tue Aug 05 2026 12:00:00 GMT-0400 (…)", which is both
  // lossy (milliseconds) and not valid SQL — Postgres rejects it with "time zone
  // gmt-0400 not recognized", but only when someone finally restores the file. Fail
  // now, at the point the mistake is made.
  if (value instanceof Date) {
    throw new Error(
      'sqlLiteral received a Date: build the reading client with `preserveExactText` ' +
        'so timestamps arrive as Postgres text and round-trip exactly.'
    )
  }
  // Timestamps, dates and numerics arrive as Postgres' own text (see
  // PRESERVE_AS_TEXT_OIDS); quoting them is correct, and Postgres casts on insert.
  return `'${String(value).replace(/'/g, "''")}'`
}

function header(generatedAt: Date): string {
  return `--
-- Vinyl Database — a complete export of your collection.
-- Generated ${generatedAt.toISOString()}
--
-- This is your data in plain SQL: readable, greppable, and restorable without this
-- application. The schema is included, so the file rebuilds everything by itself.
--
-- To restore into a fresh, empty database:
--
--   createdb my_vinyl_restore
--   psql -d my_vinyl_restore -f <this file>
--
-- Restore into an EMPTY database. Run against a database that already has these
-- tables and it will fail on the CREATE statements.
--
`
}

/**
 * Guards against schema drift — a developer error, not anything about a given
 * account's data. TABLES_IN_RESTORE_ORDER is hand-maintained, so adding a table to
 * tenant-schema.sql without adding it here would make every export quietly skip it.
 *
 * Nothing about how much data an account holds can trigger this: empty tables export
 * fine, as zero INSERTs. It fires only when the database contains a table this file
 * has never been told about.
 *
 * Failing loudly is the point. An export that silently omits a table is far worse
 * than one that refuses to run: the file looks complete, gets kept as the backup, and
 * the omission only surfaces when someone finally restores it.
 */
function assertEveryTableIsExported(actualTables: string[]): void {
  const unlisted = actualTables.filter((t) => !TABLES_IN_RESTORE_ORDER.includes(t))
  if (unlisted.length > 0) {
    throw new Error(
      `Export is missing table(s) that exist in the database: ${unlisted.join(', ')}. ` +
        'Add them to TABLES_IN_RESTORE_ORDER in lib/exportTenant.ts, in foreign-key order, ' +
        'or every export will silently omit them.'
    )
  }
}

/** A client that reads Postgres' own text for timestamps, dates and numerics. */
export function exportReadClient(schema: string): Client {
  return new Client({ ...schemaConnectionConfig(schema), types: preserveExactText })
}

/**
 * Emits the DDL and data for one tenant, over a client whose search_path is already
 * `schema`.
 *
 * `targetSchema` is what the *emitted file* rebuilds into, which is not the schema
 * being read:
 *
 * - `null` — the file is unqualified and restores into whatever `public` is at
 *   restore time. This is the per-user export: their records should simply be the
 *   contents of their database, not sit in a schema named after an internal id.
 * - a name — the file recreates and selects that schema first. This is the admin
 *   whole-system backup, which must rebuild the live layout tenant for tenant.
 */
export async function emitTenantSql(
  client: Client,
  schema: string,
  targetSchema: string | null
): Promise<string[]> {
  // Scoped to this tenant's schema: with one database, 'public' would inspect the
  // wrong (empty) namespace, and looking across all schemas would trip the
  // unknown-table guard on every *other* tenant.
  const { rows: tableRows } = await client.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = $1 AND table_type = 'BASE TABLE'`,
    [schema]
  )
  assertEveryTableIsExported(tableRows.map((r) => r.table_name))

  const out: string[] = []
  if (targetSchema) {
    assertSafeSchemaName(targetSchema)
    out.push(
      `CREATE SCHEMA ${quoteIdent(targetSchema)};`,
      `SET search_path TO ${quoteIdent(targetSchema)};`,
      ''
    )
  }
  out.push(TENANT_SCHEMA_SQL.trim(), '')

  for (const table of TABLES_IN_RESTORE_ORDER) {
    const result = await client.query(`SELECT * FROM ${quoteIdent(table)}`)
    const count = result.rows.length
    out.push(`-- ${table}: ${count} row${count === 1 ? '' : 's'}`)

    if (count > 0) {
      const columns = result.fields.map((f) => quoteIdent(f.name)).join(', ')
      for (const row of result.rows) {
        const values = result.fields.map((f) => sqlLiteral(row[f.name])).join(', ')
        out.push(`INSERT INTO ${quoteIdent(table)} (${columns}) VALUES (${values});`)
      }
    }
    out.push('')
  }

  out.push('-- Advance sequences past the restored rows, so the next insert does not collide.')
  for (const [table, column] of SERIAL_KEYS) {
    const col = quoteIdent(column)
    out.push(
      `SELECT setval(pg_get_serial_sequence('${table}', '${column}'), ` +
        `COALESCE(MAX(${col}), 1), MAX(${col}) IS NOT NULL) FROM ${quoteIdent(table)};`
    )
  }
  out.push('')
  return out
}

/**
 * Builds a self-contained .sql file restoring this tenant's schema and every row.
 *
 * Reads from `schema`, emits for `public` — see emitTenantSql. The admin
 * whole-system backup is the one that preserves schema names; see lib/exportSystem.ts.
 */
export async function buildTenantSqlExport(
  schema: string,
  generatedAt: Date = new Date()
): Promise<string> {
  const client = exportReadClient(schema)
  await client.connect()

  try {
    return [header(generatedAt), ...(await emitTenantSql(client, schema, null))].join('\n')
  } finally {
    await client.end()
  }
}
