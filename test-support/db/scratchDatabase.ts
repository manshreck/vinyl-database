import { randomBytes } from 'crypto'
import { readFileSync } from 'fs'
import { join } from 'path'
import { Client } from 'pg'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { adminConnectionString, tenantConnectionString } from '@/lib/dbUrls'

/**
 * Real, disposable Postgres databases for seam/system/contract tests — a "proxy" in
 * the test-doubles sense (swe-test-doubles): the actual database engine and schema,
 * not a reimplementation. Used instead of a fake wherever the risk being tested is a
 * real-Postgres behavior (schema drift, raw DDL, constraint enforcement) that a fake
 * would have to reimplement from assumptions rather than verify.
 *
 * Scratch databases are named `vinyl_test_<hex>`, distinct from real tenant databases
 * (`vinyl_user_<hex>`) and the one real control database (`vinyl_control`), so a
 * crashed test run's leftovers are trivially identifiable and never mistaken for
 * production data.
 */

const SCRATCH_PREFIX = 'vinyl_test_'
const SCRATCH_NAME_PATTERN = /^vinyl_test_[a-f0-9]{12}$/

const TENANT_SCHEMA_SQL = readFileSync(join(process.cwd(), 'prisma/tenant-schema.sql'), 'utf8')

function assertScratchName(name: string): void {
  if (!SCRATCH_NAME_PATTERN.test(name)) {
    throw new Error(`Refusing to operate on a non-scratch database: ${name}`)
  }
}

/** A fresh, unique scratch-database name. Never collides with a real tenant or control database name. */
export function generateScratchDatabaseName(): string {
  return `${SCRATCH_PREFIX}${randomBytes(6).toString('hex')}`
}

/** Creates an empty scratch database on the local Postgres instance. Applies no schema. */
export async function createScratchDatabase(name: string): Promise<void> {
  assertScratchName(name)
  const admin = new Client({ connectionString: adminConnectionString() })
  await admin.connect()
  try {
    await admin.query(`CREATE DATABASE "${name}"`)
  } finally {
    await admin.end()
  }
}

/** Drops a scratch database. Safe to call even if it was never created (IF EXISTS). */
export async function dropScratchDatabase(name: string): Promise<void> {
  assertScratchName(name)
  const admin = new Client({ connectionString: adminConnectionString() })
  await admin.connect()
  try {
    await admin.query(`DROP DATABASE IF EXISTS "${name}"`)
  } finally {
    await admin.end()
  }
}

/** Runs arbitrary SQL against a scratch database — e.g. a different schema than the tenant one (controlDb's bootstrap SQL). */
export async function runSqlOnScratchDatabase(name: string, sql: string): Promise<void> {
  assertScratchName(name)
  const client = new Client({ connectionString: tenantConnectionString(name) })
  await client.connect()
  try {
    await client.query(sql)
  } finally {
    await client.end()
  }
}

/** Applies the same tenant schema DDL provisionTenant.ts applies to a real tenant database. */
export async function applyTenantSchema(name: string): Promise<void> {
  await runSqlOnScratchDatabase(name, TENANT_SCHEMA_SQL)
}

/** A real generated PrismaClient connected to a scratch database, via the exact same adapter construction lib/prisma.ts uses in production. */
export function scratchPrismaClient(name: string): PrismaClient {
  assertScratchName(name)
  const adapter = new PrismaPg({ connectionString: tenantConnectionString(name) })
  return new PrismaClient({ adapter })
}

export type ScratchTenantDatabase = {
  databaseName: string
  prisma: PrismaClient
  teardown: () => Promise<void>
}

/**
 * Creates a scratch database, applies the tenant schema, and returns a real Prisma
 * client connected to it. Callers must call `teardown()` — typically in a `finally`
 * block — to disconnect the client and drop the database.
 */
export async function withScratchTenantDatabase(): Promise<ScratchTenantDatabase> {
  const databaseName = generateScratchDatabaseName()
  await createScratchDatabase(databaseName)
  await applyTenantSchema(databaseName)
  const prisma = scratchPrismaClient(databaseName)

  return {
    databaseName,
    prisma,
    teardown: async () => {
      await prisma.$disconnect()
      await dropScratchDatabase(databaseName)
    },
  }
}
