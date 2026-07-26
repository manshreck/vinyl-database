/**
 * @jest-environment node
 */
import { changePassword } from '@/app/actions/changePassword'

const mockFindUserByEmail = jest.fn()
const mockUpdatePasswordHash = jest.fn()
const mockVerifyPassword = jest.fn()
const mockHashPassword = jest.fn()

jest.mock('@/lib/controlDb', () => ({
  findUserByEmail: (...args: unknown[]) => mockFindUserByEmail(...args),
  updatePasswordHash: (...args: unknown[]) => mockUpdatePasswordHash(...args),
}))

jest.mock('@/lib/password', () => ({
  verifyPassword: (...args: unknown[]) => mockVerifyPassword(...args),
  hashPassword: (...args: unknown[]) => mockHashPassword(...args),
}))

jest.mock('@/lib/session', () => ({
  requireSession: jest.fn().mockResolvedValue({ userId: 1, email: 'miles@example.com', databaseName: 'vinyl_user_test' }),
}))

function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [key, value] of Object.entries(fields)) fd.append(key, value)
  return fd
}

const VALID_FIELDS = {
  currentPassword: 'old-password',
  newPassword: 'new-password-123',
  confirmNewPassword: 'new-password-123',
}

describe('changePassword', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockFindUserByEmail.mockResolvedValue({
      id: 1,
      email: 'miles@example.com',
      passwordHash: 'stored-hash',
      databaseName: 'vinyl_user_test',
    })
    mockVerifyPassword.mockReturnValue(true)
    mockHashPassword.mockReturnValue('new-hash')
    mockUpdatePasswordHash.mockResolvedValue(undefined)
  })

  it('rejects when a field is missing', async () => {
    const result = await changePassword(null, makeFormData({ ...VALID_FIELDS, currentPassword: '' }))
    expect(result).toEqual({ error: 'All fields are required.' })
    expect(mockUpdatePasswordHash).not.toHaveBeenCalled()
  })

  it('rejects a new password shorter than 8 characters', async () => {
    const result = await changePassword(
      null,
      makeFormData({ ...VALID_FIELDS, newPassword: 'short', confirmNewPassword: 'short' })
    )
    expect(result).toEqual({ error: 'New password must be at least 8 characters.' })
    expect(mockUpdatePasswordHash).not.toHaveBeenCalled()
  })

  it('rejects mismatched new passwords', async () => {
    const result = await changePassword(
      null,
      makeFormData({ ...VALID_FIELDS, confirmNewPassword: 'different-password' })
    )
    expect(result).toEqual({ error: 'New passwords do not match.' })
    expect(mockUpdatePasswordHash).not.toHaveBeenCalled()
  })

  it('rejects an incorrect current password without changing anything', async () => {
    mockVerifyPassword.mockReturnValue(false)
    const result = await changePassword(null, makeFormData(VALID_FIELDS))
    expect(result).toEqual({ error: 'Current password is incorrect.' })
    expect(mockUpdatePasswordHash).not.toHaveBeenCalled()
  })

  it('rejects when no user is found for the session email', async () => {
    mockFindUserByEmail.mockResolvedValue(null)
    const result = await changePassword(null, makeFormData(VALID_FIELDS))
    expect(result).toEqual({ error: 'Current password is incorrect.' })
    expect(mockUpdatePasswordHash).not.toHaveBeenCalled()
  })

  it('verifies the current password against the session user, not arbitrary input', async () => {
    await changePassword(null, makeFormData(VALID_FIELDS))
    expect(mockFindUserByEmail).toHaveBeenCalledWith('miles@example.com')
    expect(mockVerifyPassword).toHaveBeenCalledWith('old-password', 'stored-hash')
  })

  it('hashes and saves the new password, and returns success', async () => {
    const result = await changePassword(null, makeFormData(VALID_FIELDS))
    expect(mockHashPassword).toHaveBeenCalledWith('new-password-123')
    expect(mockUpdatePasswordHash).toHaveBeenCalledWith(1, 'new-hash')
    expect(result).toEqual({ success: true })
  })
})
