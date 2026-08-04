import { readFileSync } from 'fs'
import { join } from 'path'
import { Client, types as pgTypes } from 'pg'
import { tenantConnectionString } from '@/lib/dbUrls'

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

const preserveExactText = {
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

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}

/**
 * Renders one column value as a SQL literal. Doubling the single quote is the whole
 * escape: Postgres runs with standard_conforming_strings on, so a backslash inside a
 * literal is an ordinary character rather than an escape introducer.
 */
function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
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
 * Fails loudly if the database holds a table this export doesn't know about.
 *
 * An export that silently omits data is far worse than one that refuses to run: the
 * file looks complete, gets kept as a backup, and the loss only surfaces when someone
 * restores it. Better to break the feature and get it fixed.
 */
function assertNoUnknownTables(actualTables: string[]): void {
  const missing = actualTables.filter((t) => !TABLES_IN_RESTORE_ORDER.includes(t))
  if (missing.length > 0) {
    throw new Error(
      `Export would silently omit table(s): ${missing.join(', ')}. ` +
        'Add them to TABLES_IN_RESTORE_ORDER in lib/exportTenant.ts, in foreign-key order.'
    )
  }
}

/** Builds a self-contained .sql file restoring this tenant's schema and every row. */
export async function buildTenantSqlExport(
  databaseName: string,
  generatedAt: Date = new Date()
): Promise<string> {
  const client = new Client({
    connectionString: tenantConnectionString(databaseName),
    types: preserveExactText,
  })
  await client.connect()

  try {
    const { rows: tableRows } = await client.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
    )
    assertNoUnknownTables(tableRows.map((r) => r.table_name))

    const out: string[] = [header(generatedAt), TENANT_SCHEMA_SQL.trim(), '']

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

    return out.join('\n')
  } finally {
    await client.end()
  }
}
