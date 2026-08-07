/**
 * @jest-environment node
 *
 * Seam integration test: controlDb.ts ↔ real Postgres. See TESTING.md §2.3.
 *
 * controlDb.ts memoizes its Pool and bootstrap-SQL promise on globalThis (to survive
 * Next.js dev-mode hot reload) and resolves its control schema at connect time.
 * loadControlDb() below points that env var at a fresh scratch database, resets the
 * module registry, and clears the globalThis cache so each test gets its own real
 * Pool against its own real, disposable database — a proxy, not a fake, because the
 * exact things under test (bootstrap SQL idempotency, the unique-email constraint, a
 * real create/find/delete round-trip) are real-Postgres behaviors a fake would have
 * to reimplement from assumptions rather than verify.
 */
import {
  createScratchSchema,
  dropScratchSchema,
  generateScratchSchemaName,
} from '@/test-support/db/scratchSchema'
import { resetControlDbGlobals } from '@/test-support/db/controlDbGlobals'
import { schemaConnectionConfig } from '@/lib/dbUrls'

type ControlDbModule = typeof import('@/lib/controlDb')

/** Loads a fresh instance of controlDb.ts pointed at `databaseName`, closing any previously cached pool first. */
async function loadControlDb(databaseName: string): Promise<ControlDbModule> {
  await resetControlDbGlobals()
  jest.resetModules()
  process.env.CONTROL_SCHEMA = databaseName
  return import('@/lib/controlDb')
}

describe('controlDb.ts ↔ real Postgres (seam)', () => {
  let databaseName: string
  let controlDb: ControlDbModule

  beforeEach(async () => {
    databaseName = generateScratchSchemaName()
    await createScratchSchema(databaseName)
    controlDb = await loadControlDb(databaseName)
  }, 30000)

  afterEach(async () => {
    await resetControlDbGlobals()
    await dropScratchSchema(databaseName)
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
      discogsToken: null,
      fullName: null,
      expiresAt,
      // Defaulted by the column, not passed by createSession's caller — the same
      // default that backfills every session row predating the bearer transport.
      origin: 'web',
    })

    await controlDb.deleteSessionByTokenHash('token-hash')
    expect(await controlDb.findSessionByTokenHash('token-hash')).toBeNull()
  })

  it('records the origin a session was created with', async () => {
    const user = await controlDb.createUser('miles@example.com', 'hashed-pw', 'vinyl_user_abc123def456')

    await controlDb.createSession(user.id, 'mobile-hash', new Date(Date.now() + 60_000), 'mobile')

    const found = await controlDb.findSessionByTokenHash('mobile-hash')
    expect(found?.origin).toBe('mobile')
  })

  describe('touchSession', () => {
    it('pushes a live session expiry back', async () => {
      const user = await controlDb.createUser('miles@example.com', 'hashed-pw', 'vinyl_user_abc123def456')
      await controlDb.createSession(user.id, 'token-hash', new Date(Date.now() + 60_000), 'mobile')

      const extended = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      await controlDb.touchSession('token-hash', extended)

      const found = await controlDb.findSessionByTokenHash('token-hash')
      expect(found?.expiresAt.getTime()).toBe(extended.getTime())
    })

    // The `expires_at > now()` guard in the UPDATE is the whole security value of this
    // function: without it, presenting a long-dead token would resurrect it.
    it('refuses to revive a session that has already expired', async () => {
      const user = await controlDb.createUser('miles@example.com', 'hashed-pw', 'vinyl_user_abc123def456')
      await controlDb.createSession(user.id, 'stale-hash', new Date(Date.now() - 60_000), 'mobile')

      await controlDb.touchSession('stale-hash', new Date(Date.now() + 30 * 24 * 60 * 60 * 1000))

      expect(await controlDb.findSessionByTokenHash('stale-hash')).toBeNull()
    })
  })

  it('updates the stored password hash', async () => {
    const user = await controlDb.createUser('miles@example.com', 'hashed-pw', 'vinyl_user_abc123def456')

    await controlDb.updatePasswordHash(user.id, 'new-hashed-pw')

    const updated = await controlDb.findUserByEmail('miles@example.com')
    expect(updated?.passwordHash).toBe('new-hashed-pw')
  })

  it('updates the stored Discogs token, and can clear it back to null', async () => {
    const user = await controlDb.createUser('miles@example.com', 'hashed-pw', 'vinyl_user_abc123def456')
    const expiresAt = new Date(Date.now() + 60_000)
    await controlDb.createSession(user.id, 'token-hash', expiresAt)

    await controlDb.updateDiscogsToken(user.id, 'a-discogs-token')
    expect((await controlDb.findSessionByTokenHash('token-hash'))?.discogsToken).toBe('a-discogs-token')

    await controlDb.updateDiscogsToken(user.id, null)
    expect((await controlDb.findSessionByTokenHash('token-hash'))?.discogsToken).toBeNull()
  })

  it('updates the stored full name, and can clear it back to null', async () => {
    const user = await controlDb.createUser('miles@example.com', 'hashed-pw', 'vinyl_user_abc123def456')
    const expiresAt = new Date(Date.now() + 60_000)
    await controlDb.createSession(user.id, 'token-hash', expiresAt)

    await controlDb.updateFullName(user.id, 'Miles Davis')
    expect((await controlDb.findSessionByTokenHash('token-hash'))?.fullName).toBe('Miles Davis')

    await controlDb.updateFullName(user.id, null)
    expect((await controlDb.findSessionByTokenHash('token-hash'))?.fullName).toBeNull()
  })

  it('creates, finds, and deletes an admin session', async () => {
    const expiresAt = new Date(Date.now() + 60_000)

    await controlDb.createAdminSession('admin-token-hash', expiresAt)
    expect(await controlDb.findAdminSession('admin-token-hash')).toEqual({ expiresAt })

    await controlDb.deleteAdminSessionByTokenHash('admin-token-hash')
    expect(await controlDb.findAdminSession('admin-token-hash')).toBeNull()
  })
})
