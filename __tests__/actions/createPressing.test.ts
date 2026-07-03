/**
 * @jest-environment node
 */
import { createPressing } from '@/app/actions/createPressing'

const mockArtistCreate = jest.fn()
const mockReleaseCreate = jest.fn()
const mockPressingCreate = jest.fn()
const mockRedirect = jest.fn()

jest.mock('@/lib/prisma', () => ({
  getTenantPrisma: jest.fn().mockResolvedValue({
    artist: { create: (...args: unknown[]) => mockArtistCreate(...args) },
    release: { create: (...args: unknown[]) => mockReleaseCreate(...args) },
    pressing: { create: (...args: unknown[]) => mockPressingCreate(...args) },
  }),
}))

jest.mock('@/lib/session', () => ({
  requireSession: jest.fn().mockResolvedValue({ userId: 1, email: 'a@b.com', databaseName: 'vinyl_user_test' }),
}))

jest.mock('next/navigation', () => ({
  redirect: (...args: unknown[]) => mockRedirect(...args),
}))

function makeFormData(fields: Record<string, string | string[]>): FormData {
  const fd = new FormData()
  for (const [key, value] of Object.entries(fields)) {
    if (Array.isArray(value)) {
      value.forEach((v) => fd.append(key, v))
    } else {
      fd.append(key, value)
    }
  }
  return fd
}

const PRESSING_FIELDS = {
  formatId: '2',
  recordCondition: 'NM',
  sleeveCondition: '',
  pressingYear: '1975',
  country: 'US',
  label: 'Island',
  catalogNumber: 'ILPS 9329',
  vinylColor: '',
  discCount: '1',
  notes: '',
  purchasePrice: '',
  purchaseDate: '',
  currentValue: '',
}

describe('createPressing', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockArtistCreate.mockResolvedValue({ artistId: 99 })
    mockReleaseCreate.mockResolvedValue({ releaseId: 88 })
    mockPressingCreate.mockResolvedValue({})
  })

  describe('when using an existing release', () => {
    it('skips release and artist creation', async () => {
      const fd = makeFormData({ ...PRESSING_FIELDS, releaseId: '5' })
      await createPressing(fd)
      expect(mockArtistCreate).not.toHaveBeenCalled()
      expect(mockReleaseCreate).not.toHaveBeenCalled()
    })

    it('creates the pressing with the existing releaseId', async () => {
      const fd = makeFormData({ ...PRESSING_FIELDS, releaseId: '5' })
      await createPressing(fd)
      expect(mockPressingCreate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ releaseId: 5 }) })
      )
    })
  })

  describe('when creating a new release', () => {
    it('creates a new artist when no artistId is provided', async () => {
      const fd = makeFormData({
        ...PRESSING_FIELDS,
        newReleaseTitle: 'Exodus',
        newReleaseYear: '1977',
        newArtistName: 'Bob Marley',
      })
      await createPressing(fd)
      expect(mockArtistCreate).toHaveBeenCalledWith({
        data: { name: 'Bob Marley', sortName: 'Bob Marley' },
      })
    })

    it('uses an existing artist when newArtistId is provided', async () => {
      const fd = makeFormData({
        ...PRESSING_FIELDS,
        newReleaseTitle: 'Exodus',
        newReleaseYear: '1977',
        newArtistName: 'Bob Marley',
        newArtistId: '12',
      })
      await createPressing(fd)
      expect(mockArtistCreate).not.toHaveBeenCalled()
      expect(mockReleaseCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            artists: { create: [{ artistId: 12, artistOrder: 1 }] },
          }),
        })
      )
    })

    it('creates the release with genres when genreIds are provided', async () => {
      const fd = makeFormData({
        ...PRESSING_FIELDS,
        newReleaseTitle: 'Exodus',
        newReleaseYear: '1977',
        newArtistName: 'Bob Marley',
        genreIds: ['3', '4'],
      })
      await createPressing(fd)
      expect(mockReleaseCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            genres: {
              create: [
                { genreId: 3, genreOrder: 1 },
                { genreId: 4, genreOrder: 2 },
              ],
            },
          }),
        })
      )
    })

    it('creates the release without a genres field when none are provided', async () => {
      const fd = makeFormData({
        ...PRESSING_FIELDS,
        newReleaseTitle: 'Exodus',
        newReleaseYear: '1977',
        newArtistName: 'Bob Marley',
      })
      await createPressing(fd)
      const callData = mockReleaseCreate.mock.calls[0][0].data
      expect(callData).not.toHaveProperty('genres')
    })

    it('creates the pressing linked to the new release', async () => {
      const fd = makeFormData({
        ...PRESSING_FIELDS,
        newReleaseTitle: 'Exodus',
        newReleaseYear: '1977',
        newArtistName: 'Bob Marley',
      })
      await createPressing(fd)
      expect(mockPressingCreate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ releaseId: 88 }) })
      )
    })
  })

  it('redirects to /pressings after creation', async () => {
    const fd = makeFormData({ ...PRESSING_FIELDS, releaseId: '5' })
    await createPressing(fd)
    expect(mockRedirect).toHaveBeenCalledWith('/pressings')
  })
})
