/**
 * @jest-environment node
 */
import { completeSetup } from '@/app/actions/completeSetup'

const mockUpdateFullName = jest.fn()
const mockUpdateDiscogsToken = jest.fn()
const mockRedirect = jest.fn()

jest.mock('@/lib/controlDb', () => ({
  updateFullName: (...args: unknown[]) => mockUpdateFullName(...args),
  updateDiscogsToken: (...args: unknown[]) => mockUpdateDiscogsToken(...args),
}))

jest.mock('@/lib/session', () => ({
  requireSession: jest.fn().mockResolvedValue({
    userId: 1,
    email: 'miles@example.com',
    databaseName: 'vinyl_user_test',
    discogsToken: null,
    fullName: null,
  }),
}))

jest.mock('next/navigation', () => ({
  redirect: (...args: unknown[]) => mockRedirect(...args),
}))

function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [key, value] of Object.entries(fields)) fd.append(key, value)
  return fd
}

describe('completeSetup', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUpdateFullName.mockResolvedValue(undefined)
    mockUpdateDiscogsToken.mockResolvedValue(undefined)
  })

  it('saves the trimmed full name and Discogs token for the session user', async () => {
    await completeSetup(makeFormData({ fullName: '  Miles Davis  ', discogsToken: '  a-token  ' }))

    expect(mockUpdateFullName).toHaveBeenCalledWith(1, 'Miles Davis')
    expect(mockUpdateDiscogsToken).toHaveBeenCalledWith(1, 'a-token')
  })

  it('saves null for both fields when left blank', async () => {
    await completeSetup(makeFormData({ fullName: '   ', discogsToken: '' }))

    expect(mockUpdateFullName).toHaveBeenCalledWith(1, null)
    expect(mockUpdateDiscogsToken).toHaveBeenCalledWith(1, null)
  })

  it('redirects to home after saving', async () => {
    await completeSetup(makeFormData({ fullName: '', discogsToken: '' }))

    expect(mockRedirect).toHaveBeenCalledWith('/')
  })
})
