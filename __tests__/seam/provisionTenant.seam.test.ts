/**
 * @jest-environment node
 *
 * Seam integration test: provisionTenant.ts ↔ real Postgres. See TESTING.md §2.3.
 *
 * Uses a real, disposable Postgres database (a "proxy" — see swe-test-doubles), not a
 * fake, because the exact things under test — does the DDL in tenant-schema.sql
 * actually apply, does seeding actually insert rows, does a partial failure actually
 * roll back the database it just created — are real-Postgres behaviors a fake would
 * have to reimplement from our own assumptions rather than verify.
 *
 * Test databases here are real `vinyl_user_*`-named databases (provisionTenant.ts's
 * own naming scheme, not the `vinyl_test_*` scratch-database convention), created and
 * dropped through provisionTenant.ts's own exported functions — the same operation
 * the app performs on every real registration.
 */
import { Client } from 'pg'
import {
  createTenantDatabase,
  dropTenantDatabase,
  generateDatabaseName,
} from '@/lib/provisionTenant'
import { tenantConnectionString } from '@/lib/dbUrls'
import { databaseExists } from '@/test-support/db/scratchDatabase'
import { FORMATS, GENRES } from '@/prisma/referenceData'

async function queryTenant(name: string, sql: string) {
  const client = new Client({ connectionString: tenantConnectionString(name) })
  await client.connect()
  try {
    return await client.query(sql)
  } finally {
    await client.end()
  }
}

describe('provisionTenant.ts ↔ real Postgres (seam)', () => {
  it('creates a database with the expected tables and seeded formats/genres', async () => {
    const name = generateDatabaseName()
    await createTenantDatabase(name)
    try {
      const tables = await queryTenant(
        name,
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`
      )
      const tableNames = tables.rows.map((r) => r.table_name)
      expect(tableNames).toEqual(
        expect.arrayContaining([
          'artists',
          'releases',
          'pressings',
          'wishlist_items',
          'genres',
          'formats',
          'release_artists',
          'release_genres',
        ])
      )

      const formatRows = await queryTenant(name, `SELECT name, description FROM formats`)
      expect(formatRows.rows.map((r) => r.name).sort()).toEqual([...FORMATS.map((f) => f.name)].sort())

      const genreRows = await queryTenant(name, `SELECT name FROM genres`)
      expect(genreRows.rows.map((r) => r.name).sort()).toEqual([...GENRES].sort())
    } finally {
      await dropTenantDatabase(name)
    }
  }, 30000)

  it('rejects an invalid database name without touching Postgres', async () => {
    await expect(createTenantDatabase('not-a-valid-name')).rejects.toThrow(
      'Refusing to provision invalid database name'
    )
    expect(await databaseExists('not-a-valid-name')).toBe(false)
  })

  it('dropTenantDatabase removes a database that createTenantDatabase provisioned', async () => {
    const name = generateDatabaseName()
    await createTenantDatabase(name)
    expect(await databaseExists(name)).toBe(true)

    await dropTenantDatabase(name)
    expect(await databaseExists(name)).toBe(false)
  }, 30000)

  it('rolls back (drops) the database it just created when seeding fails', async () => {
    const name = generateDatabaseName()
    const realQuery = Client.prototype.query
    const querySpy = jest
      .spyOn(Client.prototype, 'query')
      .mockImplementation(function (this: Client, ...args: unknown[]) {
        const sql = args[0]
        if (typeof sql === 'string' && sql.includes('INSERT INTO genres')) {
          return Promise.reject(new Error('simulated seeding failure'))
        }
        return (realQuery as (...a: unknown[]) => unknown).apply(this, args)
      } as unknown as typeof Client.prototype.query)

    try {
      await expect(createTenantDatabase(name)).rejects.toThrow('simulated seeding failure')
    } finally {
      querySpy.mockRestore()
    }

    expect(await databaseExists(name)).toBe(false)
  }, 30000)
})
