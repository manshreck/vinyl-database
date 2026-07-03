/**
 * @jest-environment node
 */
import { loginAdmin } from '@/app/actions/loginAdmin'

const mockCreateAdminSessionCookie = jest.fn()
const mockRedirect = jest.fn()

jest.mock('@/lib/adminSession', () => ({
  createAdminSessionCookie: (...args: unknown[]) => mockCreateAdminSessionCookie(...args),
}))

jest.mock('next/navigation', () => ({
  redirect: (...args: unknown[]) => mockRedirect(...args),
}))

function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [key, value] of Object.entries(fields)) fd.append(key, value)
  return fd
}

describe('loginAdmin', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('rejects an incorrect username', async () => {
    const result = await loginAdmin(null, makeFormData({ username: 'nope', password: '' }))
    expect(result).toEqual({ error: 'Invalid username or password.' })
    expect(mockCreateAdminSessionCookie).not.toHaveBeenCalled()
  })

  it('rejects a non-blank password (the placeholder password is blank)', async () => {
    const result = await loginAdmin(null, makeFormData({ username: 'admin', password: 'anything' }))
    expect(result).toEqual({ error: 'Invalid username or password.' })
    expect(mockCreateAdminSessionCookie).not.toHaveBeenCalled()
  })

  it('creates an admin session and redirects on success with the blank password', async () => {
    await loginAdmin(null, makeFormData({ username: 'admin', password: '' }))
    expect(mockCreateAdminSessionCookie).toHaveBeenCalled()
    expect(mockRedirect).toHaveBeenCalledWith('/admin')
  })
})
