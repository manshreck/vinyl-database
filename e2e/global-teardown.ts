import 'dotenv/config'
import type { Pool } from 'pg'
import { listUsers, deleteUser } from '@/lib/controlDb'
import { dropTenantDatabase } from '@/lib/provisionTenant'
import { TEST_EMAIL_DOMAIN } from './support/testUser'

/**
 * Removes every account the e2e run created — identified by TEST_EMAIL_DOMAIN, not
 * by tracking individual accounts across spec files — dropping each one's real
 * tenant database and its control-db row. Drops the tenant database first: if this
 * process is killed mid-run, a leftover control-db row (easy to find and finish
 * cleaning up next time, via the same email-domain filter) is safer to leave behind
 * than a control-db row pointing at an already-dropped database.
 */
export default async function globalTeardown(): Promise<void> {
  const users = await listUsers()
  const testUsers = users.filter((u) => u.email.endsWith(TEST_EMAIL_DOMAIN))

  for (const user of testUsers) {
    await dropTenantDatabase(user.databaseName)
    await deleteUser(user.id)
  }

  const pool = (globalThis as unknown as { controlPool?: Pool }).controlPool
  if (pool) await pool.end()
}
