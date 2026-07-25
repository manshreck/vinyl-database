/**
 * @jest-environment node
 */
import type { PrismaClient } from '@prisma/client'
import { resolveReleaseId } from '@/lib/releaseIntake'

const mockArtistCreate = jest.fn()
const mockReleaseCreate = jest.fn()

const mockPrisma = {
  artist: { create: (...args: unknown[]) => mockArtistCreate(...args) },
  release: { create: (...args: unknown[]) => mockReleaseCreate(...args) },
} as unknown as PrismaClient

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

describe('resolveReleaseId', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockArtistCreate.mockResolvedValue({ artistId: 99 })
    mockReleaseCreate.mockResolvedValue({ releaseId: 77 })
  })

  it('returns the existing releaseId without touching prisma when one is provided', async () => {
    const fd = makeFormData({ releaseId: '42' })
    const result = await resolveReleaseId(mockPrisma, fd)
    expect(result).toBe(42)
    expect(mockArtistCreate).not.toHaveBeenCalled()
    expect(mockReleaseCreate).not.toHaveBeenCalled()
  })

  it('creates a new artist and release when no releaseId is given', async () => {
    const fd = makeFormData({
      newReleaseTitle: 'Kind Of Blue',
      newReleaseYear: '1959',
      newArtistName: 'Miles Davis',
    })
    const result = await resolveReleaseId(mockPrisma, fd)

    expect(mockArtistCreate).toHaveBeenCalledWith({
      data: { name: 'Miles Davis', sortName: 'Miles Davis' },
    })
    expect(mockReleaseCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: 'Kind Of Blue',
        originalReleaseYear: 1959,
        coverImageUrl: null,
        artists: { create: [{ artistId: 99, artistOrder: 1 }] },
      }),
    })
    expect(result).toBe(77)
  })

  it('uses an existing artist id instead of creating one when newArtistId is provided', async () => {
    const fd = makeFormData({
      newReleaseTitle: 'Kind Of Blue',
      newReleaseYear: '1959',
      newArtistName: 'Miles Davis',
      newArtistId: '12',
    })
    await resolveReleaseId(mockPrisma, fd)

    expect(mockArtistCreate).not.toHaveBeenCalled()
    expect(mockReleaseCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        artists: { create: [{ artistId: 12, artistOrder: 1 }] },
      }),
    })
  })

  it('includes an ordered genres block when genreIds are provided', async () => {
    const fd = makeFormData({
      newReleaseTitle: 'Kind Of Blue',
      newReleaseYear: '1959',
      newArtistName: 'Miles Davis',
      genreIds: ['3', '7'],
    })
    await resolveReleaseId(mockPrisma, fd)

    expect(mockReleaseCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        genres: {
          create: [
            { genreId: 3, genreOrder: 1 },
            { genreId: 7, genreOrder: 2 },
          ],
        },
      }),
    })
  })

  it('omits the genres field entirely when no genreIds are provided', async () => {
    const fd = makeFormData({
      newReleaseTitle: 'Kind Of Blue',
      newReleaseYear: '1959',
      newArtistName: 'Miles Davis',
    })
    await resolveReleaseId(mockPrisma, fd)

    const callData = mockReleaseCreate.mock.calls[0][0].data
    expect(callData).not.toHaveProperty('genres')
  })

  it('passes newReleaseCoverImageUrl through when provided', async () => {
    const fd = makeFormData({
      newReleaseTitle: 'Kind Of Blue',
      newReleaseYear: '1959',
      newArtistName: 'Miles Davis',
      newReleaseCoverImageUrl: 'https://i.discogs.com/cover.jpg',
    })
    await resolveReleaseId(mockPrisma, fd)

    expect(mockReleaseCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ coverImageUrl: 'https://i.discogs.com/cover.jpg' }),
    })
  })

  it('trims whitespace from title and artist name', async () => {
    const fd = makeFormData({
      newReleaseTitle: '  Kind Of Blue  ',
      newReleaseYear: '1959',
      newArtistName: '  Miles Davis  ',
    })
    await resolveReleaseId(mockPrisma, fd)

    expect(mockArtistCreate).toHaveBeenCalledWith({
      data: { name: 'Miles Davis', sortName: 'Miles Davis' },
    })
    expect(mockReleaseCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ title: 'Kind Of Blue' }),
    })
  })

  // Regression: pressing Enter in the release search box (before a release is
  // selected or "New release" is started) used to submit the form with none of
  // the newRelease* fields present at all, crashing on `.trim()` of null.
  it('does not throw when newReleaseTitle is entirely absent from the form data', async () => {
    const fd = makeFormData({
      newReleaseYear: '1959',
      newArtistName: 'Miles Davis',
    })
    await expect(resolveReleaseId(mockPrisma, fd)).resolves.toBe(77)
    expect(mockReleaseCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ title: '' }),
    })
  })

  it('does not throw when newArtistName is entirely absent from the form data', async () => {
    const fd = makeFormData({
      newReleaseTitle: 'Kind Of Blue',
      newReleaseYear: '1959',
    })
    await expect(resolveReleaseId(mockPrisma, fd)).resolves.toBe(77)
    expect(mockArtistCreate).toHaveBeenCalledWith({
      data: { name: '', sortName: '' },
    })
  })
})
