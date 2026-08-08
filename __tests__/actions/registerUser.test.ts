/**
 * @jest-environment node
 */
import { registerUser } from '@/app/actions/registerUser'

const mockFindUserByEmail = jest.fn()
const mockCreateUser = jest.fn()
const mockDeleteUser = jest.fn()
const mockHashPassword = jest.fn()
const mockCreateTenantSchema = jest.fn()
const mockGenerateSchemaName = jest.fn()
const mockCreateSessionCookie = jest.fn()
const mockRedirect = jest.fn()

jest.mock('@/lib/controlDb', () => ({
  findUserByEmail: (...args: unknown[]) => mockFindUserByEmail(...args),
  createUser: (...args: unknown[]) => mockCreateUser(...args),
  deleteUser: (...args: unknown[]) => mockDeleteUser(...args),
}))

jest.mock('@/lib/password', () => ({
  hashPassword: (...args: unknown[]) => mockHashPassword(...args),
}))

jest.mock('@/lib/provisionTenant', () => ({
  createTenantSchema: (...args: unknown[]) => mockCreateTenantSchema(...args),
  generateSchemaName: (...args: unknown[]) => mockGenerateSchemaName(...args),
}))

jest.mock('@/lib/session', () => ({
  createSessionCookie: (...args: unknown[]) => mockCreateSessionCookie(...args),
}))

jest.mock('next/navigation', () => ({
  redirect: (...args: unknown[]) => mockRedirect(...args),
}))

function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [key, value] of Object.entries(fields)) fd.append(key, value)
  return fd
}

const VALID_FIELDS = {
  email: 'new@example.com',
  password: 'longenoughpassword',
  confirmPassword: 'longenoughpassword',
}

describe('registerUser', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockFindUserByEmail.mockResolvedValue(null)
    mockHashPassword.mockReturnValue('hashed:password')
    mockGenerateSchemaName.mockReturnValue('vinyl_user_abc123abc123')
    mockCreateUser.mockResolvedValue({
      id: 1,
      email: 'new@example.com',
      passwordHash: 'hashed:password',
      databaseName: 'vinyl_user_abc123abc123',
    })
    mockCreateTenantSchema.mockResolvedValue(undefined)
  })

  it('rejects mismatched passwords without touching the database', async () => {
    const result = await registerUser(null, makeFormData({ ...VALID_FIELDS, confirmPassword: 'different' }))
    expect(result).toEqual({ error: 'Passwords do not match.' })
    expect(mockCreateUser).not.toHaveBeenCalled()
  })

  it('rejects a too-short password', async () => {
    const result = await registerUser(
      null,
      makeFormData({ ...VALID_FIELDS, password: 'short', confirmPassword: 'short' })
    )
    expect(result).toEqual({ error: 'Password must be at least 8 characters.' })
  })

  it('rejects when the email is already registered', async () => {
    mockFindUserByEmail.mockResolvedValue({ id: 5 })
    const result = await registerUser(null, makeFormData(VALID_FIELDS))
    expect(result).toEqual({ error: 'An account with that email already exists.' })
    expect(mockCreateUser).not.toHaveBeenCalled()
  })

  it('creates the user, provisions a tenant schema, and starts a session', async () => {
    await registerUser(null, makeFormData(VALID_FIELDS))
    expect(mockCreateUser).toHaveBeenCalledWith('new@example.com', 'hashed:password', 'vinyl_user_abc123abc123')
    expect(mockCreateTenantSchema).toHaveBeenCalledWith('vinyl_user_abc123abc123')
    expect(mockCreateSessionCookie).toHaveBeenCalledWith(1)
    expect(mockRedirect).toHaveBeenCalledWith('/setup')
  })

  it('rolls back the user row when tenant provisioning fails', async () => {
    mockCreateTenantSchema.mockRejectedValue(new Error('provisioning failed'))
    const result = await registerUser(null, makeFormData(VALID_FIELDS))
    expect(mockDeleteUser).toHaveBeenCalledWith(1)
    expect(mockCreateSessionCookie).not.toHaveBeenCalled()
    expect(result).toEqual({ error: 'Could not set up your collection database. Please try again.' })
  })

  // Lower-casing moved into controlDb.normalizeEmail, so that every read and write
  // gets it rather than only the callers that remembered. It is therefore invisible
  // to this test, which doubles controlDb; the canonicalisation itself is verified
  // against real Postgres in __tests__/seam/controlDb.seam.test.ts. What is still
  // registerUser's own job is trimming, because a whitespace-only address has to
  // fail the "required" check rather than reach the database.
  it('trims the email before validating it', async () => {
    const fd = makeFormData({ ...VALID_FIELDS, email: '  New@Example.com  ' })
    await registerUser(null, fd)
    expect(mockCreateUser).toHaveBeenCalledWith(
      'New@Example.com',
      expect.any(String),
      expect.any(String)
    )
  })

  it('rejects a whitespace-only email as missing', async () => {
    const fd = makeFormData({ ...VALID_FIELDS, email: '   ' })

    const result = await registerUser(null, fd)

    expect(result).toEqual({ error: 'Email and password are required.' })
    expect(mockCreateUser).not.toHaveBeenCalled()
  })
})
