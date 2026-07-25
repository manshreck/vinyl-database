/**
 * @jest-environment node
 *
 * Seam integration test: controlDb.ts ↔ real Postgres. See TESTING_PLAN.md §2.3.
 *
 * controlDb.ts memoizes its Pool and bootstrap-SQL promise on globalThis (to survive
 * Next.js dev-mode hot reload) and reads CONTROL_DATABASE_URL at module-load time.
 * loadControlDb() below points that env var at a fresh scratch database, resets the
 * module registry, and clears the globalThis cache so each test gets its own real
 * Pool against its own real, disposable database — a proxy, not a fake, because the
 * exact things under test (bootstrap SQL idempotency, the unique-email constraint, a
 * real create/find/delete round-trip) are real-Postgres behaviors a fake would have
 * to reimplement from assumptions rather than verify.
 */
import type { Pool } from 'pg'
import {
  createScratchDatabase,
  dropScratchDatabase,
  generateScratchDatabaseName,
} from '@/test-support/db/scratchDatabase'
import { tenantConnectionString } from '@/lib/dbUrls'

type ControlDbModule = typeof import('@/lib/controlDb')
type ControlDbGlobal = { controlPool?: Pool; controlPoolReady?: Promise<void> }

/** Closes the cached pool (if any) and clears the globalThis cache, so the next load or close never touches an already-ended pool. */
async function resetControlDbGlobals(): Promise<void> {
  const global = globalThis as unknown as ControlDbGlobal
  if (global.controlPool) await global.controlPool.end()
  delete global.controlPool
  delete global.controlPoolReady
}

/** Loads a fresh instance of controlDb.ts pointed at `databaseName`, closing any previously cached pool first. */
async function loadControlDb(databaseName: string): Promise<ControlDbModule> {
  await resetControlDbGlobals()
  jest.resetModules()
  process.env.CONTROL_DATABASE_URL = tenantConnectionString(databaseName)
  return import('@/lib/controlDb')
}

describe('controlDb.ts ↔ real Postgres (seam)', () => {
  let databaseName: string
  let controlDb: ControlDbModule

  beforeEach(async () => {
    databaseName = generateScratchDatabaseName()
    await createScratchDatabase(databaseName)
    controlDb = await loadControlDb(databaseName)
  }, 30000)

  afterEach(async () => {
    await resetControlDbGlobals()
    await dropScratchDatabase(databaseName)
  }, 30000)

  it('bootstrap SQL is idempotent when applied to an already-provisioned database', async () => {
    await expect(loadControlDb(databaseName)).resolves.toBeDefined()
  })

  it('creates a user and finds them by email', async () => {
    const user = await controlDb.createUser('miles@example.com', 'hashed-pw', 'vinyl_user_abc123def456')
    expect(await controlDb.findUserByEmail('miles@example.com')).toEqual(user)
  })

  it('rejects a second user whose email is already in use', async () => {
    await controlDb.createUser('miles@example.com', 'hashed-pw', 'vinyl_user_abc123def456')

    await expect(
      controlDb.createUser('miles@example.com', 'hashed-pw-2', 'vinyl_user_fed654cba321')
    ).rejects.toThrow(/unique/i)
  })

  it('creates, finds, and deletes a session', async () => {
    const user = await controlDb.createUser('miles@example.com', 'hashed-pw', 'vinyl_user_abc123def456')
    const expiresAt = new Date(Date.now() + 60_000)

    await controlDb.createSession(user.id, 'token-hash', expiresAt)
    expect(await controlDb.findSessionByTokenHash('token-hash')).toEqual({
      userId: user.id,
      email: user.email,
      databaseName: user.databaseName,
      expiresAt,
    })

    await controlDb.deleteSessionByTokenHash('token-hash')
    expect(await controlDb.findSessionByTokenHash('token-hash')).toBeNull()
  })

  it('creates, finds, and deletes an admin session', async () => {
    const expiresAt = new Date(Date.now() + 60_000)

    await controlDb.createAdminSession('admin-token-hash', expiresAt)
    expect(await controlDb.findAdminSession('admin-token-hash')).toEqual({ expiresAt })

    await controlDb.deleteAdminSessionByTokenHash('admin-token-hash')
    expect(await controlDb.findAdminSession('admin-token-hash')).toBeNull()
  })
})
