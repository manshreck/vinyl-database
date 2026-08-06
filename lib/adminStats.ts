import { Client } from 'pg'
import { schemaConnectionConfig } from '@/lib/dbUrls'

/** Counts the rows in a tenant schema's pressings table. */
export async function countPressings(schema: string): Promise<number> {
  const client = new Client(schemaConnectionConfig(schema))
  await client.connect()
  try {
    const { rows } = await client.query('SELECT count(*)::int AS count FROM pressings')
    return rows[0].count
  } finally {
    await client.end()
  }
}
