import { Client } from 'pg'
import { tenantConnectionString } from '@/lib/dbUrls'

/** Counts the rows in a tenant database's pressings table. */
export async function countPressings(databaseName: string): Promise<number> {
  const client = new Client({ connectionString: tenantConnectionString(databaseName) })
  await client.connect()
  try {
    const { rows } = await client.query('SELECT count(*)::int AS count FROM pressings')
    return rows[0].count
  } finally {
    await client.end()
  }
}
