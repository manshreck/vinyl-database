/**
 * @jest-environment node
 */
import { logoutAdmin } from '@/app/actions/logoutAdmin'

const mockClearAdminSessionCookie = jest.fn()
const mockRedirect = jest.fn()

jest.mock('@/lib/adminSession', () => ({
  clearAdminSessionCookie: (...args: unknown[]) => mockClearAdminSessionCookie(...args),
}))

jest.mock('next/navigation', () => ({
  redirect: (...args: unknown[]) => mockRedirect(...args),
}))

describe('logoutAdmin', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('clears the admin session and redirects to /admin/login', async () => {
    await logoutAdmin()
    expect(mockClearAdminSessionCookie).toHaveBeenCalled()
    expect(mockRedirect).toHaveBeenCalledWith('/admin/login')
  })
})
