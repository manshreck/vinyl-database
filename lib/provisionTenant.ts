import { randomBytes } from 'crypto'
import { readFileSync } from 'fs'
import { join } from 'path'
import { Client } from 'pg'
import { adminConnectionString, tenantConnectionString } from '@/lib/dbUrls'
import { FORMATS, GENRES } from '@/prisma/referenceData'

const DATABASE_NAME_PATTERN = /^vinyl_user_[a-f0-9]{12}$/

const TENANT_SCHEMA_SQL = readFileSync(
  join(process.cwd(), 'prisma/tenant-schema.sql'),
  'utf8'
)

export function generateDatabaseName(): string {
  return `vinyl_user_${randomBytes(6).toString('hex')}`
}

async function seedReferenceData(databaseName: string) {
  const client = new Client({ connectionString: tenantConnectionString(databaseName) })
  await client.connect()
  try {
    await client.query(TENANT_SCHEMA_SQL)

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

/** Creates a fresh Postgres database for a tenant, applies the schema, and seeds reference data. */
export async function createTenantDatabase(databaseName: string): Promise<void> {
  if (!DATABASE_NAME_PATTERN.test(databaseName)) {
    throw new Error(`Refusing to provision invalid database name: ${databaseName}`)
  }

  const admin = new Client({ connectionString: adminConnectionString() })
  await admin.connect()
  try {
    await admin.query(`CREATE DATABASE "${databaseName}"`)
  } finally {
    await admin.end()
  }

  try {
    await seedReferenceData(databaseName)
  } catch (err) {
    await dropTenantDatabase(databaseName)
    throw err
  }
}

/** Drops a tenant database. Used to roll back a failed provisioning attempt. */
export async function dropTenantDatabase(databaseName: string): Promise<void> {
  if (!DATABASE_NAME_PATTERN.test(databaseName)) {
    throw new Error(`Refusing to drop invalid database name: ${databaseName}`)
  }

  const admin = new Client({ connectionString: adminConnectionString() })
  await admin.connect()
  try {
    await admin.query(`DROP DATABASE IF EXISTS "${databaseName}"`)
  } finally {
    await admin.end()
  }
}
