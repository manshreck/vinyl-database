/**
 * @jest-environment node
 */
import {
  clearSessionCookie,
  createSessionCookie,
  getSession,
  requireSession,
} from '@/lib/session'

const mockCreateSession = jest.fn()
const mockFindSessionByTokenHash = jest.fn()
const mockDeleteSessionByTokenHash = jest.fn()
const mockUpdateLastLogin = jest.fn()
const mockRedirect = jest.fn()

const mockCookieStore = {
  get: jest.fn(),
  set: jest.fn(),
  delete: jest.fn(),
}

jest.mock('@/lib/controlDb', () => ({
  createSession: (...args: unknown[]) => mockCreateSession(...args),
  findSessionByTokenHash: (...args: unknown[]) => mockFindSessionByTokenHash(...args),
  deleteSessionByTokenHash: (...args: unknown[]) => mockDeleteSessionByTokenHash(...args),
  updateLastLogin: (...args: unknown[]) => mockUpdateLastLogin(...args),
}))

jest.mock('next/headers', () => ({
  cookies: jest.fn(() => Promise.resolve(mockCookieStore)),
}))

jest.mock('next/navigation', () => ({
  redirect: (...args: unknown[]) => mockRedirect(...args),
}))

describe('session helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('getSession', () => {
    it('returns null when there is no session cookie', async () => {
      mockCookieStore.get.mockReturnValue(undefined)
      expect(await getSession()).toBeNull()
      expect(mockFindSessionByTokenHash).not.toHaveBeenCalled()
    })

    it('returns null when the token does not match a valid session', async () => {
      mockCookieStore.get.mockReturnValue({ value: 'sometoken' })
      mockFindSessionByTokenHash.mockResolvedValue(null)
      expect(await getSession()).toBeNull()
    })

    it('returns the session when the token is valid', async () => {
      mockCookieStore.get.mockReturnValue({ value: 'sometoken' })
      mockFindSessionByTokenHash.mockResolvedValue({
        userId: 1,
        email: 'a@b.com',
        databaseName: 'vinyl_user_test',
        expiresAt: new Date(),
      })
      expect(await getSession()).toEqual({
        userId: 1,
        email: 'a@b.com',
        databaseName: 'vinyl_user_test',
      })
    })
  })

  describe('requireSession', () => {
    it('redirects to /login when there is no session', async () => {
      mockCookieStore.get.mockReturnValue(undefined)
      mockRedirect.mockImplementation(() => {
        throw new Error('REDIRECT')
      })
      await expect(requireSession()).rejects.toThrow('REDIRECT')
      expect(mockRedirect).toHaveBeenCalledWith('/login')
    })

    it('returns the session without redirecting when valid', async () => {
      mockCookieStore.get.mockReturnValue({ value: 'sometoken' })
      mockFindSessionByTokenHash.mockResolvedValue({
        userId: 1,
        email: 'a@b.com',
        databaseName: 'vinyl_user_test',
        expiresAt: new Date(),
      })
      const session = await requireSession()
      expect(session.databaseName).toBe('vinyl_user_test')
      expect(mockRedirect).not.toHaveBeenCalled()
    })
  })

  describe('createSessionCookie', () => {
    it('creates a control-db session row and sets an httpOnly cookie', async () => {
      await createSessionCookie(1)
      expect(mockCreateSession).toHaveBeenCalledWith(1, expect.any(String), expect.any(Date))
      expect(mockUpdateLastLogin).toHaveBeenCalledWith(1)
      expect(mockCookieStore.set).toHaveBeenCalledWith(
        'session',
        expect.any(String),
        expect.objectContaining({ httpOnly: true, sameSite: 'lax' })
      )
    })
  })

  describe('clearSessionCookie', () => {
    it('deletes the control-db session row and the cookie', async () => {
      mockCookieStore.get.mockReturnValue({ value: 'sometoken' })
      await clearSessionCookie()
      expect(mockDeleteSessionByTokenHash).toHaveBeenCalledWith(expect.any(String))
      expect(mockCookieStore.delete).toHaveBeenCalledWith('session')
    })

    it('does nothing to the control db when there is no cookie', async () => {
      mockCookieStore.get.mockReturnValue(undefined)
      await clearSessionCookie()
      expect(mockDeleteSessionByTokenHash).not.toHaveBeenCalled()
      expect(mockCookieStore.delete).toHaveBeenCalledWith('session')
    })
  })
})
