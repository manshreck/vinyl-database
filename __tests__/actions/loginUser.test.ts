/**
 * @jest-environment node
 */
import { loginUser } from '@/app/actions/loginUser'

const mockFindUserByEmail = jest.fn()
const mockVerifyPassword = jest.fn()
const mockCreateSessionCookie = jest.fn()
const mockRedirect = jest.fn()

jest.mock('@/lib/controlDb', () => ({
  findUserByEmail: (...args: unknown[]) => mockFindUserByEmail(...args),
}))

jest.mock('@/lib/password', () => ({
  verifyPassword: (...args: unknown[]) => mockVerifyPassword(...args),
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

describe('loginUser', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('rejects an unknown email without calling verifyPassword', async () => {
    mockFindUserByEmail.mockResolvedValue(null)
    const result = await loginUser(null, makeFormData({ email: 'nope@example.com', password: 'x' }))
    expect(result).toEqual({ error: 'Invalid email or password.' })
    expect(mockVerifyPassword).not.toHaveBeenCalled()
  })

  it('rejects an incorrect password', async () => {
    mockFindUserByEmail.mockResolvedValue({ id: 1, passwordHash: 'hash' })
    mockVerifyPassword.mockReturnValue(false)
    const result = await loginUser(null, makeFormData({ email: 'a@b.com', password: 'wrong' }))
    expect(result).toEqual({ error: 'Invalid email or password.' })
    expect(mockCreateSessionCookie).not.toHaveBeenCalled()
  })

  it('starts a session and redirects on success', async () => {
    mockFindUserByEmail.mockResolvedValue({ id: 1, passwordHash: 'hash' })
    mockVerifyPassword.mockReturnValue(true)
    await loginUser(null, makeFormData({ email: 'a@b.com', password: 'correct' }))
    expect(mockCreateSessionCookie).toHaveBeenCalledWith(1)
    expect(mockRedirect).toHaveBeenCalledWith('/')
  })
})
