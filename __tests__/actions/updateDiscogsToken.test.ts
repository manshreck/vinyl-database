/**
 * @jest-environment node
 */
import { updateDiscogsToken } from '@/app/actions/updateDiscogsToken'

const mockUpdateDiscogsTokenInDb = jest.fn()

jest.mock('@/lib/controlDb', () => ({
  updateDiscogsToken: (...args: unknown[]) => mockUpdateDiscogsTokenInDb(...args),
}))

jest.mock('@/lib/session', () => ({
  requireSession: jest.fn().mockResolvedValue({
    userId: 1,
    email: 'miles@example.com',
    databaseName: 'vinyl_user_test',
    discogsToken: null,
  }),
}))

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}))

function makeFormData(discogsToken: string): FormData {
  const fd = new FormData()
  fd.append('discogsToken', discogsToken)
  return fd
}

describe('updateDiscogsToken', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUpdateDiscogsTokenInDb.mockResolvedValue(undefined)
  })

  it('saves a trimmed token for the session user and returns success', async () => {
    const result = await updateDiscogsToken(null, makeFormData('  my-token-123  '))

    expect(mockUpdateDiscogsTokenInDb).toHaveBeenCalledWith(1, 'my-token-123')
    expect(result).toEqual({ success: true })
  })

  it('clears the token when submitted blank', async () => {
    const result = await updateDiscogsToken(null, makeFormData('   '))

    expect(mockUpdateDiscogsTokenInDb).toHaveBeenCalledWith(1, null)
    expect(result).toEqual({ success: true })
  })
})
