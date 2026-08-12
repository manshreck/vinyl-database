import { randomBytes } from 'crypto'
import { readFileSync } from 'fs'
import { join } from 'path'
import { Client } from 'pg'
import { schemaConnectionConfig } from '@/lib/dbUrls'
import { FORMATS, GENRES } from '@/prisma/referenceData'

/**
 * Which schemas this module may create or drop. Narrower than dbUrls' interpolation
 * guard on purpose: that one asks "is this string safe in a statement", this one asks
 * "is this a tenant schema we own" — so a typo or a stray `control` can never reach
 * `DROP SCHEMA ... CASCADE`.
 */
const TENANT_SCHEMA_PATTERN = /^vinyl_user_[a-f0-9]{12}$/

const TENANT_SCHEMA_SQL = readFileSync(
  join(process.cwd(), 'prisma/tenant-schema.sql'),
  'utf8'
)

/**
 * Triggers, kept separate because `prisma migrate diff` emits tables and never these:
 * regenerating tenant-schema.sql would silently drop them if they lived there.
 */
const TENANT_TRIGGERS_SQL = readFileSync(
  join(process.cwd(), 'prisma/tenant-triggers.sql'),
  'utf8'
)

export function generateSchemaName(): string {
  return `vinyl_user_${randomBytes(6).toString('hex')}`
}

function assertTenantSchema(schema: string, verb: string): void {
  if (!TENANT_SCHEMA_PATTERN.test(schema)) {
    throw new Error(`Refusing to ${verb} invalid tenant schema name: ${schema}`)
  }
}

/**
 * Applies the tenant DDL and reference data over a connection whose search_path is
 * the new schema, so tenant-schema.sql's unqualified CREATE TABLEs land there. The
 * file needs no changes for this: its `CREATE SCHEMA IF NOT EXISTS "public"` line is
 * a harmless no-op.
 */
async function seedSchema(schema: string) {
  const client = new Client(schemaConnectionConfig(schema))
  await client.connect()
  try {
    await client.query(TENANT_SCHEMA_SQL)
    // After the tables exist, and before the reference-data inserts below — which then
    // become the first bumps the counter records, so a fresh tenant starts consistent.
    await client.query(TENANT_TRIGGERS_SQL)

    for (const format of FORMATS) {
      await client.query(
        `INSERT INTO formats (name, description) VALUES ($1, $2)`,
        [format.name, format.description]
      )
    }
    for (const name of GENRES) {
      await client.query(`INSERT INTO genres (name) VALUES ($1)`, [name])
    }
  } finally {
    await client.end()
  }
}

/**
 * Creates a tenant's schema, applies the schema DDL, and seeds reference data.
 *
 * One ordinary connection does all of this. The previous database-per-tenant version
 * needed a second, privileged connection to the maintenance database purely because
 * CREATE DATABASE cannot run inside another database — CREATE SCHEMA has no such
 * constraint, which removes both that privilege requirement and a failure mode.
 */
export async function createTenantSchema(schema: string): Promise<void> {
  assertTenantSchema(schema, 'provision')

  const client = new Client({ connectionString: schemaConnectionConfig(schema).connectionString })
  await client.connect()
  try {
    await client.query(`CREATE SCHEMA "${schema}"`)
  } finally {
    await client.end()
  }

  try {
    await seedSchema(schema)
  } catch (err) {
    await dropTenantSchema(schema)
    throw err
  }
}

/** Drops a tenant's schema and everything in it. Also rolls back a failed provision. */
export async function dropTenantSchema(schema: string): Promise<void> {
  assertTenantSchema(schema, 'drop')

  const client = new Client({ connectionString: schemaConnectionConfig(schema).connectionString })
  await client.connect()
  try {
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
  } finally {
    await client.end()
  }
}
