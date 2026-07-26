/**
 * @jest-environment node
 *
 * System integration test: deleteAccount assembling real controlDb.ts + real
 * provisionTenant.ts + a real scratch control database + a real tenant database. See
 * TESTING.md §2.4.
 *
 * Justified by the same two named gaps as registration.system.test.ts, for the
 * inverse operation: **Configuration** (does deleteAccount's own orchestration of two
 * real seams actually remove a real tenant database, not just a row?), and
 * **emergent behavior of assembly** (when the password check fails, does the real
 * assembly genuinely leave *both* the control-db row and the tenant database intact —
 * not just return an error while something was already deleted?). Each seam already
 * has its own seam test (provisionTenant.seam.test.ts, controlDb.seam.test.ts); this
 * test exists only for what emerges from deleteAccount assembling them.
 *
 * `@/lib/session` (needs a Next.js request context for cookies()) and
 * `next/navigation`'s redirect() are doubled — same rationale as
 * registration.system.test.ts. `@/lib/controlDb` and `@/lib/provisionTenant` are real,
 * reloaded fresh (alongside deleteAccount itself) against a scratch control database —
 * see test-support/db/controlDbGlobals.ts. `@/lib/password` is real throughout: this
 * proves the actual hash/verify round-trip, not a stubbed one.
 */
import { hashPassword } from '@/lib/password'
import {
  createScratchDatabase,
  databaseExists,
  dropScratchDatabase,
  generateScratchDatabaseName,
} from '@/test-support/db/scratchDatabase'
import { resetControlDbGlobals } from '@/test-support/db/controlDbGlobals'
import { tenantConnectionString } from '@/lib/dbUrls'

const mockRequireSession = jest.fn()
const mockClearSessionCookie = jest.fn()
const mockRedirect = jest.fn()

jest.mock('@/lib/session', () => ({
  requireSession: (...args: unknown[]) => mockRequireSession(...args),
  clearSessionCookie: (...args: unknown[]) => mockClearSessionCookie(...args),
}))

jest.mock('next/navigation', () => ({
  redirect: (...args: unknown[]) => mockRedirect(...args),
}))

type ControlDbModule = typeof import('@/lib/controlDb')
type ProvisionTenantModule = typeof import('@/lib/provisionTenant')
type DeleteAccountModule = typeof import('@/app/actions/deleteAccount')

function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [key, value] of Object.entries(fields)) fd.append(key, value)
  return fd
}

describe('deleteAccount assembling real controlDb + real provisionTenant (system)', () => {
  let controlDbName: string
  let controlDb: ControlDbModule
  let provisionTenant: ProvisionTenantModule
  let deleteAccount: DeleteAccountModule['deleteAccount']

  beforeAll(async () => {
    controlDbName = generateScratchDatabaseName()
    await createScratchDatabase(controlDbName)

    await resetControlDbGlobals()
    jest.resetModules()
    process.env.CONTROL_DATABASE_URL = tenantConnectionString(controlDbName)

    // Loaded together, in the same (post-reset) module registry, so deleteAccount.ts's
    // own `import ... from '@/lib/controlDb'` resolves to this same controlDb
    // instance — bound to the scratch database above, not the real vinyl_control.
    controlDb = await import('@/lib/controlDb')
    provisionTenant = await import('@/lib/provisionTenant')
    ;({ deleteAccount } = await import('@/app/actions/deleteAccount'))
  }, 30000)

  afterAll(async () => {
    await resetControlDbGlobals()
    await dropScratchDatabase(controlDbName)
  }, 30000)

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('removes both the real user row and the real tenant database', async () => {
    const email = 'system-delete-success@vinyl-test.local'
    const password = 'correct-password-123'
    const databaseName = provisionTenant.generateDatabaseName()

    await provisionTenant.createTenantDatabase(databaseName)
    const user = await controlDb.createUser(email, hashPassword(password), databaseName)
    mockRequireSession.mockResolvedValue({ userId: user.id, email, databaseName })

    await deleteAccount(null, makeFormData({ password }))

    expect(mockClearSessionCookie).toHaveBeenCalled()
    expect(mockRedirect).toHaveBeenCalledWith('/login')
    expect(await controlDb.findUserByEmail(email)).toBeNull()
    expect(await databaseExists(databaseName)).toBe(false)
  }, 30000)

  it('leaves the real user row and tenant database intact when the password is wrong', async () => {
    const email = 'system-delete-wrong-password@vinyl-test.local'
    const password = 'correct-password-123'
    const databaseName = provisionTenant.generateDatabaseName()

    await provisionTenant.createTenantDatabase(databaseName)
    const user = await controlDb.createUser(email, hashPassword(password), databaseName)
    mockRequireSession.mockResolvedValue({ userId: user.id, email, databaseName })

    try {
      const result = await deleteAccount(null, makeFormData({ password: 'totally-wrong' }))

      expect(result).toEqual({ error: 'Incorrect password.' })
      expect(mockRedirect).not.toHaveBeenCalled()
      expect(await controlDb.findUserByEmail(email)).not.toBeNull()
      expect(await databaseExists(databaseName)).toBe(true)
    } finally {
      await provisionTenant.dropTenantDatabase(databaseName)
      await controlDb.deleteUser(user.id)
    }
  }, 30000)
})
