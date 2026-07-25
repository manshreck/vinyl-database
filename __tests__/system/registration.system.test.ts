/**
 * @jest-environment node
 *
 * System integration test: registerUser assembling real controlDb.ts + real
 * provisionTenant.ts + a real scratch control database + a real tenant database. See
 * TESTING.md §2.4.
 *
 * Justified by two named gaps from swe-system-integration-testing that no seam test
 * covers pairwise: **Configuration** (does registerUser's own orchestration of two
 * real seams — not either seam alone — actually produce a queryable, working tenant
 * database, using the real prisma/tenant-schema.sql and reference-data seeding?), and
 * **emergent behavior of assembly** (when the second seam fails, does registerUser's
 * own rollback genuinely delete the row it created in the *first* seam — not just
 * call a function that's supposed to?). Each seam already has its own seam test
 * (provisionTenant.seam.test.ts, controlDb.seam.test.ts); this test exists only for
 * what emerges from registerUser assembling them.
 *
 * `@/lib/session` (which needs a Next.js request context for cookies()) and
 * `next/navigation`'s redirect() are doubled — same as registerUser.test.ts's unit
 * test — because they aren't part of either seam this test targets. `@/lib/controlDb`
 * and `@/lib/provisionTenant` are real, reloaded fresh (alongside registerUser itself)
 * against a scratch control database the same way controlDb.seam.test.ts reloads
 * controlDb.ts alone — see test-support/db/controlDbGlobals.ts.
 */
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import {
  createScratchDatabase,
  dropScratchDatabase,
  generateScratchDatabaseName,
} from '@/test-support/db/scratchDatabase'
import { resetControlDbGlobals } from '@/test-support/db/controlDbGlobals'
import { tenantConnectionString } from '@/lib/dbUrls'

const mockCreateSessionCookie = jest.fn()
const mockRedirect = jest.fn()

jest.mock('@/lib/session', () => ({
  createSessionCookie: (...args: unknown[]) => mockCreateSessionCookie(...args),
}))

jest.mock('next/navigation', () => ({
  redirect: (...args: unknown[]) => mockRedirect(...args),
}))

type ControlDbModule = typeof import('@/lib/controlDb')
type ProvisionTenantModule = typeof import('@/lib/provisionTenant')
type RegisterUserModule = typeof import('@/app/actions/registerUser')

const TEST_PASSWORD = 'longenoughpassword'

function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [key, value] of Object.entries(fields)) fd.append(key, value)
  return fd
}

describe('registerUser assembling real controlDb + real provisionTenant (system)', () => {
  let controlDbName: string
  let controlDb: ControlDbModule
  let provisionTenant: ProvisionTenantModule
  let registerUser: RegisterUserModule['registerUser']

  beforeAll(async () => {
    controlDbName = generateScratchDatabaseName()
    await createScratchDatabase(controlDbName)

    await resetControlDbGlobals()
    jest.resetModules()
    process.env.CONTROL_DATABASE_URL = tenantConnectionString(controlDbName)

    // Loaded together, in the same (post-reset) module registry, so registerUser.ts's
    // own `import ... from '@/lib/controlDb'` resolves to this same controlDb
    // instance — bound to the scratch database above, not the real vinyl_control.
    controlDb = await import('@/lib/controlDb')
    provisionTenant = await import('@/lib/provisionTenant')
    ;({ registerUser } = await import('@/app/actions/registerUser'))
  }, 30000)

  afterAll(async () => {
    await resetControlDbGlobals()
    await dropScratchDatabase(controlDbName)
  }, 30000)

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('creates a real user row and a working, queryable tenant database', async () => {
    const email = 'system-register-success@vinyl-test.local'
    const fd = makeFormData({ email, password: TEST_PASSWORD, confirmPassword: TEST_PASSWORD })

    await registerUser(null, fd)

    expect(mockCreateSessionCookie).toHaveBeenCalledWith(expect.any(Number))
    expect(mockRedirect).toHaveBeenCalledWith('/')

    const user = await controlDb.findUserByEmail(email)
    expect(user).not.toBeNull()

    // The tenant database registerUser just provisioned is real and immediately
    // queryable through the real generated Prisma Client — not just "a row exists".
    const adapter = new PrismaPg({ connectionString: tenantConnectionString(user!.databaseName) })
    const tenantPrisma = new PrismaClient({ adapter })
    try {
      const formats = await tenantPrisma.format.findMany()
      const genres = await tenantPrisma.genre.findMany()
      expect(formats.length).toBeGreaterThan(0)
      expect(genres.length).toBeGreaterThan(0)
    } finally {
      await tenantPrisma.$disconnect()
      await provisionTenant.dropTenantDatabase(user!.databaseName)
    }
  }, 30000)

  it('rolls back the real user row when tenant provisioning fails', async () => {
    // SWC compiles named exports as non-configurable, so jest.spyOn can't stub
    // createTenantDatabase directly here (unlike registerUser.test.ts's mocked
    // module). Forcing a genuine connection failure — DATABASE_URL pointed at an
    // unreachable address for just this call — triggers createTenantDatabase's real
    // failure path instead: CONTROL_DATABASE_URL is untouched, so createUser and the
    // eventual deleteUser still hit the real scratch control database throughout.
    const email = 'system-register-failure@vinyl-test.local'
    const originalDatabaseUrl = process.env.DATABASE_URL
    process.env.DATABASE_URL = 'postgresql://baduser:badpass@127.0.0.1:59999/nonexistent_db'

    try {
      const fd = makeFormData({ email, password: TEST_PASSWORD, confirmPassword: TEST_PASSWORD })
      const result = await registerUser(null, fd)

      expect(result).toEqual({ error: 'Could not set up your collection database. Please try again.' })
      expect(mockCreateSessionCookie).not.toHaveBeenCalled()

      // The point of this test: not that deleteUser was *called* (registerUser.test.ts
      // already proves that with a mock) but that the row is genuinely gone from a
      // real database afterward — proving that mock's assumption correct.
      const user = await controlDb.findUserByEmail(email)
      expect(user).toBeNull()
    } finally {
      process.env.DATABASE_URL = originalDatabaseUrl
    }
  }, 30000)
})
