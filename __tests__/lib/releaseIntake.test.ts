/**
 * @jest-environment node
 */
import type { PrismaClient } from '@prisma/client'
import { resolveReleaseId, type ReleaseSelection } from '@/lib/releaseIntake'

const mockArtistFindFirst = jest.fn()
const mockArtistCreate = jest.fn()
const mockReleaseCreate = jest.fn()

const mockPrisma = {
  artist: {
    findFirst: (...args: unknown[]) => mockArtistFindFirst(...args),
    create: (...args: unknown[]) => mockArtistCreate(...args),
  },
  release: { create: (...args: unknown[]) => mockReleaseCreate(...args) },
} as unknown as PrismaClient

type NewRelease = Extract<ReleaseSelection, { kind: 'new' }>

/**
 * Defaults for the fields a case doesn't care about, so each test states only what it
 * varies. Deliberately uses ReleaseSelection's own field names rather than the form
 * field names these once arrived as: translating form input into this shape is
 * parseReleaseSelection's job, and it is tested directly (see
 * __tests__/actions/formInput.test.ts). A second translation living here would be an
 * untested reimplementation that could drift from the real one while still passing.
 */
function newRelease(overrides: Partial<Omit<NewRelease, 'kind'>> = {}): ReleaseSelection {
  return {
    kind: 'new',
    title: '',
    originalReleaseYear: 0,
    artistId: null,
    artistName: '',
    genreIds: [],
    coverImageUrl: null,
    ...overrides,
  }
}

function existingRelease(releaseId: number): ReleaseSelection {
  return { kind: 'existing', releaseId }
}

describe('resolveReleaseId', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockArtistFindFirst.mockResolvedValue(null)
    mockArtistCreate.mockResolvedValue({ artistId: 99 })
    mockReleaseCreate.mockResolvedValue({ releaseId: 77 })
  })

  it('returns the existing releaseId without touching prisma when one is provided', async () => {
    const result = await resolveReleaseId(mockPrisma, existingRelease(42))
    expect(result).toBe(42)
    expect(mockArtistCreate).not.toHaveBeenCalled()
    expect(mockReleaseCreate).not.toHaveBeenCalled()
  })

  it('creates a new artist and release when no releaseId is given and no artist matches by name', async () => {
    const selection = newRelease({
      title: 'Kind Of Blue',
      originalReleaseYear: 1959,
      artistName: 'Miles Davis',
    })
    const result = await resolveReleaseId(mockPrisma, selection)

    expect(mockArtistFindFirst).toHaveBeenCalledWith({ where: { name: 'Miles Davis' } })
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

  // Regression: typing an artist's name without picking it from the autocomplete
  // dropdown (no newArtistId) used to always call artist.create, which crashed with
  // a unique-constraint violation whenever the typed name matched an existing artist
  // exactly. Must reuse the existing artist instead of trying to create a duplicate.
  it('reuses an existing artist by exact name match instead of creating a duplicate', async () => {
    mockArtistFindFirst.mockResolvedValue({ artistId: 5, name: 'Miles Davis', sortName: 'Davis, Miles' })
    const selection = newRelease({
      title: 'Someone Else Made This',
      originalReleaseYear: 1959,
      artistName: 'Miles Davis',
    })
    await resolveReleaseId(mockPrisma, selection)

    expect(mockArtistCreate).not.toHaveBeenCalled()
    expect(mockReleaseCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        artists: { create: [{ artistId: 5, artistOrder: 1 }] },
      }),
    })
  })

  it('uses an existing artist id instead of creating one when newArtistId is provided', async () => {
    const selection = newRelease({
      title: 'Kind Of Blue',
      originalReleaseYear: 1959,
      artistName: 'Miles Davis',
      artistId: 12,
    })
    await resolveReleaseId(mockPrisma, selection)

    expect(mockArtistFindFirst).not.toHaveBeenCalled()
    expect(mockArtistCreate).not.toHaveBeenCalled()
    expect(mockReleaseCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        artists: { create: [{ artistId: 12, artistOrder: 1 }] },
      }),
    })
  })

  it('includes an ordered genres block when genreIds are provided', async () => {
    const selection = newRelease({
      title: 'Kind Of Blue',
      originalReleaseYear: 1959,
      artistName: 'Miles Davis',
      genreIds: [3, 7],
    })
    await resolveReleaseId(mockPrisma, selection)

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
    const selection = newRelease({
      title: 'Kind Of Blue',
      originalReleaseYear: 1959,
      artistName: 'Miles Davis',
    })
    await resolveReleaseId(mockPrisma, selection)

    const callData = mockReleaseCreate.mock.calls[0][0].data
    expect(callData).not.toHaveProperty('genres')
  })

  it('passes newReleaseCoverImageUrl through when provided', async () => {
    const selection = newRelease({
      title: 'Kind Of Blue',
      originalReleaseYear: 1959,
      artistName: 'Miles Davis',
      coverImageUrl: 'https://i.discogs.com/cover.jpg',
    })
    await resolveReleaseId(mockPrisma, selection)

    expect(mockReleaseCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ coverImageUrl: 'https://i.discogs.com/cover.jpg' }),
    })
  })

  it('trims whitespace from title and artist name', async () => {
    const selection = newRelease({
      title: '  Kind Of Blue  ',
      originalReleaseYear: 1959,
      artistName: '  Miles Davis  ',
    })
    await resolveReleaseId(mockPrisma, selection)

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
    const selection = newRelease({
      originalReleaseYear: 1959,
      artistName: 'Miles Davis',
    })
    await expect(resolveReleaseId(mockPrisma, selection)).resolves.toBe(77)
    expect(mockReleaseCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ title: '' }),
    })
  })

  it('does not throw when newArtistName is entirely absent from the form data', async () => {
    const selection = newRelease({
      title: 'Kind Of Blue',
      originalReleaseYear: 1959,
    })
    await expect(resolveReleaseId(mockPrisma, selection)).resolves.toBe(77)
    expect(mockArtistCreate).toHaveBeenCalledWith({
      data: { name: '', sortName: '' },
    })
  })
})
