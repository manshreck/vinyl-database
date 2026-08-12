import { randomBytes } from 'crypto'
import { readFileSync } from 'fs'
import { join } from 'path'
import { Client } from 'pg'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { databaseUrl, schemaConnectionConfig } from '@/lib/dbUrls'

/**
 * Real, disposable Postgres schemas for seam/system/contract tests — a "proxy" in
 * the test-doubles sense (swe-test-doubles): the actual database engine and schema,
 * not a reimplementation. Used instead of a fake wherever the risk being tested is a
 * real-Postgres behavior (schema drift, raw DDL, constraint enforcement) that a fake
 * would have to reimplement from assumptions rather than verify.
 *
 * Scratch schemas are named `vinyl_test_<hex>`, distinct from real tenant schemas
 * (`vinyl_user_<hex>`) and the control schema, so a crashed test run's leftovers are
 * trivially identifiable and never mistaken for production data.
 *
 * These create schemas rather than databases so that tests exercise the same
 * mechanism production uses. Scratch *databases* would now be testing a model the
 * application no longer has.
 */

const SCRATCH_PREFIX = 'vinyl_test_'
const SCRATCH_NAME_PATTERN = /^vinyl_test_[a-f0-9]{12}$/

const TENANT_SCHEMA_SQL = readFileSync(join(process.cwd(), 'prisma/tenant-schema.sql'), 'utf8')
const TENANT_TRIGGERS_SQL = readFileSync(join(process.cwd(), 'prisma/tenant-triggers.sql'), 'utf8')

function assertScratchName(name: string): void {
  if (!SCRATCH_NAME_PATTERN.test(name)) {
    throw new Error(`Refusing to operate on a non-scratch schema: ${name}`)
  }
}

/** A fresh, unique scratch-schema name. Never collides with a real tenant or the control schema. */
export function generateScratchSchemaName(): string {
  return `${SCRATCH_PREFIX}${randomBytes(6).toString('hex')}`
}

/**
 * Whole scratch *databases*, for the few tests that need isolation a schema cannot
 * give — currently only the whole-system backup, which discovers tenants by scanning
 * the database for `vinyl_user_*` schemas and would otherwise find (and refuse to
 * back up alongside) the developer's real ones.
 *
 * This is a test-only capability. Production provisions schemas precisely so it needs
 * no CREATEDB privilege; a development machine has one anyway.
 */
export function scratchDatabaseUrl(name: string): string {
  assertScratchName(name)
  const url = new URL(databaseUrl())
  url.pathname = `/${name}`
  return url.toString()
}

export async function createScratchDatabase(name: string): Promise<void> {
  assertScratchName(name)
  const client = new Client({ connectionString: databaseUrl() })
  await client.connect()
  try {
    await client.query(`CREATE DATABASE "${name}"`)
  } finally {
    await client.end()
  }
}

export async function dropScratchDatabase(name: string): Promise<void> {
  assertScratchName(name)
  const client = new Client({ connectionString: databaseUrl() })
  await client.connect()
  try {
    await client.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`)
  } finally {
    await client.end()
  }
}

/** Whether a schema with this exact name exists. Read-only, so no naming restriction — used to check both scratch and real vinyl_user_* names. */
export async function schemaExists(name: string): Promise<boolean> {
  const client = new Client({ connectionString: databaseUrl() })
  await client.connect()
  try {
    const { rows } = await client.query('SELECT 1 FROM pg_namespace WHERE nspname = $1', [name])
    return rows.length > 0
  } finally {
    await client.end()
  }
}

/** Creates an empty scratch schema. Applies no table DDL. */
export async function createScratchSchema(name: string): Promise<void> {
  assertScratchName(name)
  const client = new Client({ connectionString: databaseUrl() })
  await client.connect()
  try {
    await client.query(`CREATE SCHEMA "${name}"`)
  } finally {
    await client.end()
  }
}

/** Drops a scratch schema and its contents. Safe to call even if it was never created. */
export async function dropScratchSchema(name: string): Promise<void> {
  assertScratchName(name)
  const client = new Client({ connectionString: databaseUrl() })
  await client.connect()
  try {
    await client.query(`DROP SCHEMA IF EXISTS "${name}" CASCADE`)
  } finally {
    await client.end()
  }
}

/** Runs arbitrary SQL with search_path set to a scratch schema — e.g. controlDb's bootstrap SQL. */
export async function runSqlOnScratchSchema(name: string, sql: string): Promise<void> {
  assertScratchName(name)
  const client = new Client(schemaConnectionConfig(name))
  await client.connect()
  try {
    await client.query(sql)
  } finally {
    await client.end()
  }
}

/**
 * Applies the same tenant DDL provisionTenant.ts applies to a real tenant schema —
 * including the triggers, which `prisma migrate diff` never generates. A scratch
 * schema without them would silently lack the change counter, and every test of
 * cache invalidation would pass against a schema production does not have.
 */
export async function applyTenantSchema(name: string): Promise<void> {
  await runSqlOnScratchSchema(name, TENANT_SCHEMA_SQL)
  await runSqlOnScratchSchema(name, TENANT_TRIGGERS_SQL)
}

/** A real generated PrismaClient scoped to a scratch schema, via the exact same adapter construction lib/prisma.ts uses in production. */
export function scratchPrismaClient(name: string): PrismaClient {
  assertScratchName(name)
  const adapter = new PrismaPg(schemaConnectionConfig(name), { schema: name })
  return new PrismaClient({ adapter })
}

export type ScratchTenantSchema = {
  schemaName: string
  prisma: PrismaClient
  teardown: () => Promise<void>
}

/**
 * Creates a scratch schema, applies the tenant DDL, and returns a real Prisma
 * client scoped to it. Callers must call `teardown()` — typically in a `finally`
 * block — to disconnect the client and drop the schema.
 */
export async function withScratchTenantSchema(): Promise<ScratchTenantSchema> {
  const schemaName = generateScratchSchemaName()
  await createScratchSchema(schemaName)
  await applyTenantSchema(schemaName)
  const prisma = scratchPrismaClient(schemaName)

  return {
    schemaName,
    prisma,
    teardown: async () => {
      await prisma.$disconnect()
      await dropScratchSchema(schemaName)
    },
  }
}
