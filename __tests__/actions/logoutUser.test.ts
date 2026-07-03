/**
 * @jest-environment node
 */
import { logoutUser } from '@/app/actions/logoutUser'

const mockClearSessionCookie = jest.fn()
const mockRedirect = jest.fn()

jest.mock('@/lib/session', () => ({
  clearSessionCookie: (...args: unknown[]) => mockClearSessionCookie(...args),
}))

jest.mock('next/navigation', () => ({
  redirect: (...args: unknown[]) => mockRedirect(...args),
}))

describe('logoutUser', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('clears the session and redirects to /login', async () => {
    await logoutUser()
    expect(mockClearSessionCookie).toHaveBeenCalled()
    expect(mockRedirect).toHaveBeenCalledWith('/login')
  })
})
