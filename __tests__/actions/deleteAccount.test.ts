/**
 * @jest-environment node
 */
import { deleteAccount } from '@/app/actions/deleteAccount'

const mockFindUserByEmail = jest.fn()
const mockDeleteUser = jest.fn()
const mockVerifyPassword = jest.fn()
const mockDropTenantSchema = jest.fn()
const mockClearSessionCookie = jest.fn()
const mockRedirect = jest.fn()

jest.mock('@/lib/controlDb', () => ({
  findUserByEmail: (...args: unknown[]) => mockFindUserByEmail(...args),
  deleteUser: (...args: unknown[]) => mockDeleteUser(...args),
}))

jest.mock('@/lib/password', () => ({
  verifyPassword: (...args: unknown[]) => mockVerifyPassword(...args),
}))

jest.mock('@/lib/provisionTenant', () => ({
  dropTenantSchema: (...args: unknown[]) => mockDropTenantSchema(...args),
}))

jest.mock('@/lib/session', () => ({
  requireSession: jest.fn().mockResolvedValue({ userId: 1, email: 'miles@example.com', databaseName: 'vinyl_user_test' }),
  clearSessionCookie: (...args: unknown[]) => mockClearSessionCookie(...args),
}))

jest.mock('next/navigation', () => ({
  redirect: (...args: unknown[]) => mockRedirect(...args),
}))

function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [key, value] of Object.entries(fields)) fd.append(key, value)
  return fd
}

describe('deleteAccount', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockFindUserByEmail.mockResolvedValue({
      id: 1,
      email: 'miles@example.com',
      passwordHash: 'stored-hash',
      databaseName: 'vinyl_user_test',
    })
    mockVerifyPassword.mockReturnValue(true)
    mockDropTenantSchema.mockResolvedValue(undefined)
    mockDeleteUser.mockResolvedValue(undefined)
    mockClearSessionCookie.mockResolvedValue(undefined)
  })

  it('rejects an incorrect password without deleting anything', async () => {
    mockVerifyPassword.mockReturnValue(false)
    const result = await deleteAccount(null, makeFormData({ password: 'wrong-password' }))

    expect(result).toEqual({ error: 'Incorrect password.' })
    expect(mockDropTenantSchema).not.toHaveBeenCalled()
    expect(mockDeleteUser).not.toHaveBeenCalled()
    expect(mockClearSessionCookie).not.toHaveBeenCalled()
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it('rejects when no user is found for the session email', async () => {
    mockFindUserByEmail.mockResolvedValue(null)
    const result = await deleteAccount(null, makeFormData({ password: 'anything' }))

    expect(result).toEqual({ error: 'Incorrect password.' })
    expect(mockDropTenantSchema).not.toHaveBeenCalled()
  })

  it('verifies the password against the session user, not arbitrary input', async () => {
    await deleteAccount(null, makeFormData({ password: 'correct-password' }))
    expect(mockFindUserByEmail).toHaveBeenCalledWith('miles@example.com')
    expect(mockVerifyPassword).toHaveBeenCalledWith('correct-password', 'stored-hash')
  })

  it('drops the tenant schema, deletes the user, clears the session, and redirects', async () => {
    await deleteAccount(null, makeFormData({ password: 'correct-password' }))

    expect(mockDropTenantSchema).toHaveBeenCalledWith('vinyl_user_test')
    expect(mockDeleteUser).toHaveBeenCalledWith(1)
    expect(mockClearSessionCookie).toHaveBeenCalled()
    expect(mockRedirect).toHaveBeenCalledWith('/login')
  })

  it('drops the tenant schema before deleting the user row', async () => {
    const order: string[] = []
    mockDropTenantSchema.mockImplementation(async () => { order.push('dropTenantSchema') })
    mockDeleteUser.mockImplementation(async () => { order.push('deleteUser') })

    await deleteAccount(null, makeFormData({ password: 'correct-password' }))

    expect(order).toEqual(['dropTenantSchema', 'deleteUser'])
  })
})
