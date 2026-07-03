/**
 * @jest-environment node
 */
import {
  clearAdminSessionCookie,
  createAdminSessionCookie,
  getAdminSession,
  requireAdminSession,
} from '@/lib/adminSession'

const mockCreateAdminSession = jest.fn()
const mockFindAdminSession = jest.fn()
const mockDeleteAdminSessionByTokenHash = jest.fn()
const mockRedirect = jest.fn()

const mockCookieStore = {
  get: jest.fn(),
  set: jest.fn(),
  delete: jest.fn(),
}

jest.mock('@/lib/controlDb', () => ({
  createAdminSession: (...args: unknown[]) => mockCreateAdminSession(...args),
  findAdminSession: (...args: unknown[]) => mockFindAdminSession(...args),
  deleteAdminSessionByTokenHash: (...args: unknown[]) => mockDeleteAdminSessionByTokenHash(...args),
}))

jest.mock('next/headers', () => ({
  cookies: jest.fn(() => Promise.resolve(mockCookieStore)),
}))

jest.mock('next/navigation', () => ({
  redirect: (...args: unknown[]) => mockRedirect(...args),
}))

describe('admin session helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('getAdminSession', () => {
    it('returns false when there is no admin session cookie', async () => {
      mockCookieStore.get.mockReturnValue(undefined)
      expect(await getAdminSession()).toBe(false)
      expect(mockFindAdminSession).not.toHaveBeenCalled()
    })

    it('returns false when the token does not match a valid session', async () => {
      mockCookieStore.get.mockReturnValue({ value: 'sometoken' })
      mockFindAdminSession.mockResolvedValue(null)
      expect(await getAdminSession()).toBe(false)
    })

    it('returns true when the token is valid', async () => {
      mockCookieStore.get.mockReturnValue({ value: 'sometoken' })
      mockFindAdminSession.mockResolvedValue({ expiresAt: new Date() })
      expect(await getAdminSession()).toBe(true)
    })
  })

  describe('requireAdminSession', () => {
    it('redirects to /admin/login when there is no valid session', async () => {
      mockCookieStore.get.mockReturnValue(undefined)
      mockRedirect.mockImplementation(() => {
        throw new Error('REDIRECT')
      })
      await expect(requireAdminSession()).rejects.toThrow('REDIRECT')
      expect(mockRedirect).toHaveBeenCalledWith('/admin/login')
    })

    it('does not redirect when the session is valid', async () => {
      mockCookieStore.get.mockReturnValue({ value: 'sometoken' })
      mockFindAdminSession.mockResolvedValue({ expiresAt: new Date() })
      await requireAdminSession()
      expect(mockRedirect).not.toHaveBeenCalled()
    })
  })

  describe('createAdminSessionCookie', () => {
    it('creates a control-db admin session row and sets an httpOnly cookie', async () => {
      await createAdminSessionCookie()
      expect(mockCreateAdminSession).toHaveBeenCalledWith(expect.any(String), expect.any(Date))
      expect(mockCookieStore.set).toHaveBeenCalledWith(
        'admin_session',
        expect.any(String),
        expect.objectContaining({ httpOnly: true, sameSite: 'lax' })
      )
    })
  })

  describe('clearAdminSessionCookie', () => {
    it('deletes the control-db admin session row and the cookie', async () => {
      mockCookieStore.get.mockReturnValue({ value: 'sometoken' })
      await clearAdminSessionCookie()
      expect(mockDeleteAdminSessionByTokenHash).toHaveBeenCalledWith(expect.any(String))
      expect(mockCookieStore.delete).toHaveBeenCalledWith('admin_session')
    })
  })
})
