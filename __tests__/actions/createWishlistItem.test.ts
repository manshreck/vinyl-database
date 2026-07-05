/**
 * @jest-environment node
 */
import { createWishlistItem } from '@/app/actions/createWishlistItem'

const mockArtistCreate = jest.fn()
const mockReleaseCreate = jest.fn()
const mockWishlistItemCreate = jest.fn()
const mockRedirect = jest.fn()

jest.mock('@/lib/prisma', () => ({
  getTenantPrisma: jest.fn().mockResolvedValue({
    artist: { create: (...args: unknown[]) => mockArtistCreate(...args) },
    release: { create: (...args: unknown[]) => mockReleaseCreate(...args) },
    wishlistItem: { create: (...args: unknown[]) => mockWishlistItemCreate(...args) },
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

const WISHLIST_FIELDS = {
  formatId: '2',
  pressingYear: '1975',
  country: 'US',
  label: 'Island',
  catalogNumber: 'ILPS 9329',
  vinylColor: '',
  discCount: '1',
  notes: '',
}

describe('createWishlistItem', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockArtistCreate.mockResolvedValue({ artistId: 99 })
    mockReleaseCreate.mockResolvedValue({ releaseId: 88 })
    mockWishlistItemCreate.mockResolvedValue({})
  })

  it('skips release and artist creation when using an existing release', async () => {
    const fd = makeFormData({ ...WISHLIST_FIELDS, releaseId: '5' })
    await createWishlistItem(fd)
    expect(mockArtistCreate).not.toHaveBeenCalled()
    expect(mockReleaseCreate).not.toHaveBeenCalled()
    expect(mockWishlistItemCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ releaseId: 5 }) })
    )
  })

  it('creates a new release and artist when none is selected', async () => {
    const fd = makeFormData({
      ...WISHLIST_FIELDS,
      newReleaseTitle: 'Exodus',
      newReleaseYear: '1977',
      newArtistName: 'Bob Marley',
    })
    await createWishlistItem(fd)
    expect(mockArtistCreate).toHaveBeenCalledWith({
      data: { name: 'Bob Marley', sortName: 'Bob Marley' },
    })
    expect(mockWishlistItemCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ releaseId: 88 }) })
    )
  })

  it('does not include cost or condition fields in the create payload', async () => {
    const fd = makeFormData({ ...WISHLIST_FIELDS, releaseId: '5' })
    await createWishlistItem(fd)
    const data = mockWishlistItemCreate.mock.calls[0][0].data
    expect(data).not.toHaveProperty('purchasePrice')
    expect(data).not.toHaveProperty('purchaseDate')
    expect(data).not.toHaveProperty('currentValue')
    expect(data).not.toHaveProperty('recordCondition')
    expect(data).not.toHaveProperty('sleeveCondition')
  })

  it('redirects to /wishlist after creation', async () => {
    const fd = makeFormData({ ...WISHLIST_FIELDS, releaseId: '5' })
    await createWishlistItem(fd)
    expect(mockRedirect).toHaveBeenCalledWith('/wishlist')
  })

  it('passes newReleaseCoverImageUrl through to the release create', async () => {
    const fd = makeFormData({
      ...WISHLIST_FIELDS,
      newReleaseTitle: 'Exodus',
      newReleaseYear: '1977',
      newArtistName: 'Bob Marley',
      newReleaseCoverImageUrl: 'https://i.discogs.com/cover.jpg',
    })
    await createWishlistItem(fd)
    expect(mockReleaseCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ coverImageUrl: 'https://i.discogs.com/cover.jpg' }),
      })
    )
  })

  it('sets coverImageUrl to null when not provided', async () => {
    const fd = makeFormData({
      ...WISHLIST_FIELDS,
      newReleaseTitle: 'Exodus',
      newReleaseYear: '1977',
      newArtistName: 'Bob Marley',
    })
    await createWishlistItem(fd)
    expect(mockReleaseCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ coverImageUrl: null }) })
    )
  })
})
