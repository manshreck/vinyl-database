/**
 * @jest-environment node
 */
import { updateRelease } from '@/app/actions/updateRelease'

const mockArtistFindFirst = jest.fn()
const mockReleaseUpdate = jest.fn()
const mockArtistUpdate = jest.fn()
const mockDeleteMany = jest.fn()
const mockCreateMany = jest.fn()
const mockTransaction = jest.fn()
const mockRedirect = jest.fn()

jest.mock('@/lib/prisma', () => ({
  getTenantPrisma: jest.fn().mockResolvedValue({
    artist: { findFirst: (...args: unknown[]) => mockArtistFindFirst(...args) },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  }),
}))

jest.mock('@/lib/session', () => ({
  requireSession: jest.fn().mockResolvedValue({ userId: 1, email: 'a@b.com', databaseName: 'vinyl_user_test' }),
}))

jest.mock('next/navigation', () => ({
  redirect: (...args: unknown[]) => mockRedirect(...args),
}))

// Make $transaction actually invoke its callback with a mock tx object
const mockTx = {
  release: { update: (...args: unknown[]) => mockReleaseUpdate(...args) },
  artist: { update: (...args: unknown[]) => mockArtistUpdate(...args) },
  releaseGenre: {
    deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
    createMany: (...args: unknown[]) => mockCreateMany(...args),
  },
}

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

describe('updateRelease', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockArtistFindFirst.mockResolvedValue(null)
    mockReleaseUpdate.mockResolvedValue({})
    mockArtistUpdate.mockResolvedValue({})
    mockDeleteMany.mockResolvedValue({})
    mockCreateMany.mockResolvedValue({})
    mockTransaction.mockImplementation(async (fn: (tx: typeof mockTx) => Promise<void>) => fn(mockTx))
  })

  it('updates release title, year, notes and cover image inside a transaction', async () => {
    const fd = makeFormData({
      title: 'Kind of Blue',
      originalReleaseYear: '1959',
      notes: 'Classic',
      coverImageUrl: 'https://i.discogs.com/cover.jpg',
      artistIds: ['10'],
      'name[10]': 'Miles Davis',
      'sortName[10]': 'Davis, Miles',
    })

    await updateRelease(5, '/pressings', null, fd)

    expect(mockReleaseUpdate).toHaveBeenCalledWith({
      where: { releaseId: 5 },
      data: {
        title: 'Kind of Blue',
        originalReleaseYear: 1959,
        notes: 'Classic',
        coverImageUrl: 'https://i.discogs.com/cover.jpg',
      },
    })
  })

  it('sets notes to null when blank', async () => {
    const fd = makeFormData({
      title: 'Kind of Blue',
      originalReleaseYear: '1959',
      notes: '',
      coverImageUrl: '',
      artistIds: [],
    })

    await updateRelease(5, '/pressings', null, fd)

    expect(mockReleaseUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ notes: null }) })
    )
  })

  it('sets coverImageUrl to null when blank', async () => {
    const fd = makeFormData({
      title: 'Kind of Blue',
      originalReleaseYear: '1959',
      notes: '',
      coverImageUrl: '',
      artistIds: [],
    })

    await updateRelease(5, '/pressings', null, fd)

    expect(mockReleaseUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ coverImageUrl: null }) })
    )
  })

  it('updates each artist name and sortName', async () => {
    const fd = makeFormData({
      title: 'Kind of Blue',
      originalReleaseYear: '1959',
      notes: '',
      coverImageUrl: '',
      artistIds: ['10'],
      'name[10]': 'Miles Davis',
      'sortName[10]': 'Davis, Miles',
    })

    await updateRelease(5, '/pressings', null, fd)

    expect(mockArtistFindFirst).toHaveBeenCalledWith({ where: { name: 'Miles Davis', NOT: { artistId: 10 } } })
    expect(mockArtistUpdate).toHaveBeenCalledWith({
      where: { artistId: 10 },
      data: { name: 'Miles Davis', sortName: 'Davis, Miles' },
    })
  })

  it('falls back to name when sortName is blank', async () => {
    const fd = makeFormData({
      title: 'Kind of Blue',
      originalReleaseYear: '1959',
      notes: '',
      coverImageUrl: '',
      artistIds: ['10'],
      'name[10]': 'Miles Davis',
      'sortName[10]': '',
    })

    await updateRelease(5, '/pressings', null, fd)

    expect(mockArtistUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ sortName: 'Miles Davis' }) })
    )
  })

  it('deletes existing genres and creates new ones', async () => {
    const fd = makeFormData({
      title: 'Kind of Blue',
      originalReleaseYear: '1959',
      notes: '',
      coverImageUrl: '',
      artistIds: [],
      genreIds: ['3', '7'],
    })

    await updateRelease(5, '/pressings', null, fd)

    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { releaseId: 5 } })
    expect(mockCreateMany).toHaveBeenCalledWith({
      data: [
        { releaseId: 5, genreId: 3, genreOrder: 1 },
        { releaseId: 5, genreId: 7, genreOrder: 2 },
      ],
    })
  })

  it('skips createMany when no genres selected', async () => {
    const fd = makeFormData({
      title: 'Kind of Blue',
      originalReleaseYear: '1959',
      notes: '',
      coverImageUrl: '',
      artistIds: [],
    })

    await updateRelease(5, '/pressings', null, fd)

    expect(mockDeleteMany).toHaveBeenCalled()
    expect(mockCreateMany).not.toHaveBeenCalled()
  })

  it('redirects to returnTo after the transaction', async () => {
    const fd = makeFormData({
      title: 'Kind of Blue',
      originalReleaseYear: '1959',
      notes: '',
      coverImageUrl: '',
      artistIds: [],
    })

    await updateRelease(5, '/artists/10', null, fd)

    expect(mockRedirect).toHaveBeenCalledWith('/artists/10')
  })

  it('does not flag a conflict when an artist keeps their own name', async () => {
    // findFirst excludes the artist's own id via NOT, so mocking it to always
    // return null here simulates "no *other* artist has this name" correctly.
    const fd = makeFormData({
      title: 'Kind of Blue',
      originalReleaseYear: '1959',
      notes: '',
      coverImageUrl: '',
      artistIds: ['10'],
      'name[10]': 'Miles Davis',
      'sortName[10]': '',
    })

    await updateRelease(5, '/pressings', null, fd)

    expect(mockArtistUpdate).toHaveBeenCalledWith({
      where: { artistId: 10 },
      data: { name: 'Miles Davis', sortName: 'Miles Davis' },
    })
    expect(mockRedirect).toHaveBeenCalledWith('/pressings')
  })

  // Regression: renaming an artist to a name that already belongs to a *different*
  // existing artist used to crash with an unhandled unique-constraint violation on
  // Artist.name. Must reject with a clear error instead, and save nothing.
  it('returns an error and saves nothing when the new name matches a different existing artist', async () => {
    mockArtistFindFirst.mockResolvedValue({ artistId: 99, name: 'Radiohead', sortName: 'Radiohead' })
    const fd = makeFormData({
      title: 'Kind of Blue',
      originalReleaseYear: '1959',
      notes: '',
      coverImageUrl: '',
      artistIds: ['10'],
      'name[10]': 'Radiohead',
      'sortName[10]': '',
    })

    const result = await updateRelease(5, '/pressings', null, fd)

    expect(result).toEqual({
      error: 'An artist named "Radiohead" already exists. Choose a different name, or edit that artist directly.',
    })
    expect(mockTransaction).not.toHaveBeenCalled()
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it('returns an error when two artists in the same submission are renamed to the same name', async () => {
    const fd = makeFormData({
      title: 'Various Artists Comp',
      originalReleaseYear: '1959',
      notes: '',
      coverImageUrl: '',
      artistIds: ['10', '11'],
      'name[10]': 'Same Name',
      'sortName[10]': '',
      'name[11]': 'Same Name',
      'sortName[11]': '',
    })

    const result = await updateRelease(5, '/pressings', null, fd)

    expect(result).toEqual({
      error: 'An artist named "Same Name" already exists. Choose a different name, or edit that artist directly.',
    })
    expect(mockTransaction).not.toHaveBeenCalled()
  })
})
