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
const mockTouchSession = jest.fn()
const mockUpdateLastLogin = jest.fn()
const mockRedirect = jest.fn()

const mockCookieStore = {
  get: jest.fn(),
  set: jest.fn(),
  delete: jest.fn(),
}

const mockHeaderStore = { get: jest.fn() }

jest.mock('@/lib/controlDb', () => ({
  createSession: (...args: unknown[]) => mockCreateSession(...args),
  findSessionByTokenHash: (...args: unknown[]) => mockFindSessionByTokenHash(...args),
  deleteSessionByTokenHash: (...args: unknown[]) => mockDeleteSessionByTokenHash(...args),
  touchSession: (...args: unknown[]) => mockTouchSession(...args),
  updateLastLogin: (...args: unknown[]) => mockUpdateLastLogin(...args),
}))

jest.mock('next/headers', () => ({
  cookies: jest.fn(() => Promise.resolve(mockCookieStore)),
  headers: jest.fn(() => Promise.resolve(mockHeaderStore)),
}))

const DAY_MS = 24 * 60 * 60 * 1000

/** A valid control-db session row, overridable per test. */
function sessionRow(overrides: Record<string, unknown> = {}) {
  return {
    userId: 1,
    email: 'a@b.com',
    databaseName: 'vinyl_user_test',
    discogsToken: 'user-discogs-token',
    fullName: 'Miles Davis',
    expiresAt: new Date(Date.now() + 30 * DAY_MS),
    origin: 'web',
    ...overrides,
  }
}

jest.mock('next/navigation', () => ({
  redirect: (...args: unknown[]) => mockRedirect(...args),
}))

describe('session helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // clearAllMocks wipes recorded calls but not return values, so reset the default
    // explicitly: otherwise a bearer token set by one test leaks into the next.
    mockHeaderStore.get.mockReturnValue(null)
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
      mockFindSessionByTokenHash.mockResolvedValue(sessionRow())
      expect(await getSession()).toEqual({
        userId: 1,
        email: 'a@b.com',
        databaseName: 'vinyl_user_test',
        discogsToken: 'user-discogs-token',
        fullName: 'Miles Davis',
        origin: 'web',
      })
    })
  })

  describe('getSession via bearer token', () => {
    it('accepts a token from the Authorization header with no cookie present', async () => {
      mockCookieStore.get.mockReturnValue(undefined)
      mockHeaderStore.get.mockReturnValue('Bearer mobiletoken')
      mockFindSessionByTokenHash.mockResolvedValue(sessionRow({ origin: 'mobile' }))

      const session = await getSession()
      expect(session?.origin).toBe('mobile')
    })

    it('prefers the bearer token over a cookie when both are present', async () => {
      mockCookieStore.get.mockReturnValue({ value: 'cookietoken' })
      mockHeaderStore.get.mockReturnValue('Bearer bearertoken')
      mockFindSessionByTokenHash.mockResolvedValue(sessionRow({ origin: 'mobile' }))

      await getSession()

      // The hash looked up must be the bearer token's, not the cookie's — an ambient
      // cookie must never decide which account an explicit API call runs as.
      const { createHash } = await import('crypto')
      const bearerHash = createHash('sha256').update('bearertoken').digest('hex')
      expect(mockFindSessionByTokenHash).toHaveBeenCalledWith(bearerHash)
      expect(mockFindSessionByTokenHash).toHaveBeenCalledTimes(1)
    })

    it('ignores an Authorization header that is not a Bearer scheme', async () => {
      mockCookieStore.get.mockReturnValue(undefined)
      mockHeaderStore.get.mockReturnValue('Basic dXNlcjpwYXNz')

      expect(await getSession()).toBeNull()
      expect(mockFindSessionByTokenHash).not.toHaveBeenCalled()
    })
  })

  // The lifetime policy is the security-relevant half of the mobile transport: an
  // active device should never be signed out, an idle one should lapse on schedule.
  describe('sliding renewal', () => {
    it('extends a mobile session once it has burned through a day of its window', async () => {
      mockCookieStore.get.mockReturnValue({ value: 'sometoken' })
      mockFindSessionByTokenHash.mockResolvedValue(
        sessionRow({ origin: 'mobile', expiresAt: new Date(Date.now() + 20 * DAY_MS) })
      )

      await getSession()

      expect(mockTouchSession).toHaveBeenCalledWith(expect.any(String), expect.any(Date))
      const newExpiry = mockTouchSession.mock.calls[0][1] as Date
      expect(newExpiry.getTime() - Date.now()).toBeGreaterThan(29 * DAY_MS)
    })

    it('does not write on every request — a freshly issued mobile session is left alone', async () => {
      mockCookieStore.get.mockReturnValue({ value: 'sometoken' })
      mockFindSessionByTokenHash.mockResolvedValue(
        sessionRow({ origin: 'mobile', expiresAt: new Date(Date.now() + 30 * DAY_MS - 1000) })
      )

      await getSession()

      expect(mockTouchSession).not.toHaveBeenCalled()
    })

    it('never extends a web session, however old', async () => {
      mockCookieStore.get.mockReturnValue({ value: 'sometoken' })
      mockFindSessionByTokenHash.mockResolvedValue(
        sessionRow({ origin: 'web', expiresAt: new Date(Date.now() + 1000) })
      )

      await getSession()

      expect(mockTouchSession).not.toHaveBeenCalled()
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
        discogsToken: null,
        fullName: null,
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
      expect(mockCreateSession).toHaveBeenCalledWith(
        1,
        expect.any(String),
        expect.any(Date),
        'web'
      )
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

  // Component test: createSessionCookie and getSession tested independently above
  // only prove each operation's own logic against a hardcoded stub. This chains them
  // through the *same* cookie-store state to verify the cross-operation invariant the
  // module actually depends on: the token createSessionCookie writes into the cookie
  // hashes to the same value getSession looks up. (Discovered gap: nothing previously
  // verified this pairing — each operation always had its hash faked independently.)
  describe('createSessionCookie then getSession (lifecycle round-trip)', () => {
    it('a session created by createSessionCookie is readable by getSession via the same cookie', async () => {
      let issuedToken: string | undefined
      let storedHash: string | undefined
      mockCookieStore.set.mockImplementation((_name: string, token: string) => {
        issuedToken = token
      })
      mockCreateSession.mockImplementation((_userId: number, hash: string) => {
        storedHash = hash
      })

      await createSessionCookie(1)
      expect(issuedToken).toBeDefined()

      // Simulate the browser sending the cookie createSessionCookie just set.
      mockCookieStore.get.mockReturnValue({ value: issuedToken })
      // findSessionByTokenHash only "finds" the row if getSession hashes the cookie
      // token the same way createSessionCookie did when it stored it.
      mockFindSessionByTokenHash.mockImplementation((hash: string) => {
        if (hash !== storedHash) return null
        return sessionRow({ discogsToken: null, fullName: null })
      })

      const session = await getSession()
      expect(session).toEqual({
        userId: 1,
        email: 'a@b.com',
        databaseName: 'vinyl_user_test',
        discogsToken: null,
        fullName: null,
        origin: 'web',
      })
    })
  })
})
