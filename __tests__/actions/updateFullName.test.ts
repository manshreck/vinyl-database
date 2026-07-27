/**
 * @jest-environment node
 */
import { updateFullName } from '@/app/actions/updateFullName'

const mockUpdateFullNameInDb = jest.fn()

jest.mock('@/lib/controlDb', () => ({
  updateFullName: (...args: unknown[]) => mockUpdateFullNameInDb(...args),
}))

jest.mock('@/lib/session', () => ({
  requireSession: jest.fn().mockResolvedValue({
    userId: 1,
    email: 'miles@example.com',
    databaseName: 'vinyl_user_test',
    fullName: null,
  }),
}))

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}))

function makeFormData(fullName: string): FormData {
  const fd = new FormData()
  fd.append('fullName', fullName)
  return fd
}

describe('updateFullName', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUpdateFullNameInDb.mockResolvedValue(undefined)
  })

  it('saves a trimmed name for the session user and returns success', async () => {
    const result = await updateFullName(null, makeFormData('  Miles Davis  '))

    expect(mockUpdateFullNameInDb).toHaveBeenCalledWith(1, 'Miles Davis')
    expect(result).toEqual({ success: true })
  })

  it('clears the name when submitted blank', async () => {
    const result = await updateFullName(null, makeFormData('   '))

    expect(mockUpdateFullNameInDb).toHaveBeenCalledWith(1, null)
    expect(result).toEqual({ success: true })
  })
})
