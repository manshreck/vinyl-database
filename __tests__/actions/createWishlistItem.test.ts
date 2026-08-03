/**
 * @jest-environment node
 */
import { createWishlistItem } from '@/app/actions/createWishlistItem'

const mockArtistFindFirst = jest.fn()
const mockArtistCreate = jest.fn()
const mockReleaseCreate = jest.fn()
const mockReleaseFindFirst = jest.fn()
const mockWishlistItemCreate = jest.fn()
const mockRedirect = jest.fn()

jest.mock('@/lib/prisma', () => ({
  getTenantPrisma: jest.fn().mockResolvedValue({
    artist: {
      findFirst: (...args: unknown[]) => mockArtistFindFirst(...args),
      create: (...args: unknown[]) => mockArtistCreate(...args),
    },
    release: {
      create: (...args: unknown[]) => mockReleaseCreate(...args),
      findFirst: (...args: unknown[]) => mockReleaseFindFirst(...args),
    },
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
    mockArtistFindFirst.mockResolvedValue(null)
    mockArtistCreate.mockResolvedValue({ artistId: 99 })
    mockReleaseCreate.mockResolvedValue({ releaseId: 88 })
    mockReleaseFindFirst.mockResolvedValue(null)
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

  describe('confirmation when the release is already known', () => {
    // Mirrors WISHLIST_FIELDS: format 2, 1975, US, Island, ILPS 9329, no color, 1 disc.
    const STORED_IDENTICAL = {
      wishlistItemId: 3,
      format: { name: '12"' },
      formatId: 2,
      pressingYear: 1975,
      country: 'US',
      label: 'Island',
      catalogNumber: 'ILPS 9329',
      vinylColor: null,
      discCount: 1,
    }
    const STORED_DIFFERENT = { ...STORED_IDENTICAL, wishlistItemId: 4, pressingYear: 2015 }

    const OWNED_PRESSING = {
      pressingId: 9,
      format: { name: 'LP' },
      pressingYear: 1977,
      country: 'JA',
      label: 'Island',
      catalogNumber: 'ILPS 9498',
      vinylColor: null,
      discCount: 1,
      recordCondition: 'VG_PLUS',
      sleeveCondition: null,
      purchaseDate: null,
    }

    function release({ pressings = [], wishlistItems = [] }: {
      pressings?: unknown[]
      wishlistItems?: unknown[]
    }) {
      return {
        releaseId: 42,
        title: 'Exodus',
        originalReleaseYear: 1977,
        coverImageUrl: null,
        artists: [{ artist: { name: 'Bob Marley' } }],
        pressings,
        wishlistItems,
      }
    }

    it('warns when the release is in the collection but not on the wishlist', async () => {
      mockReleaseFindFirst.mockResolvedValue(release({ pressings: [OWNED_PRESSING] }))

      const result = await createWishlistItem(makeFormData({ ...WISHLIST_FIELDS, releaseId: '42' }))

      expect(mockWishlistItemCreate).not.toHaveBeenCalled()
      expect(result?.duplicate.pressings).toHaveLength(1)
      expect(result?.duplicate.wishlistItems).toHaveLength(0)
    })

    it('warns when the wishlist has the release under different pressing details', async () => {
      mockReleaseFindFirst.mockResolvedValue(release({ wishlistItems: [STORED_DIFFERENT] }))

      const result = await createWishlistItem(makeFormData({ ...WISHLIST_FIELDS, releaseId: '42' }))

      expect(mockWishlistItemCreate).not.toHaveBeenCalled()
      expect(result?.duplicate.wishlistItems).toEqual([
        expect.objectContaining({ wishlistItemId: 4, identical: false }),
      ])
    })

    it('flags the wishlist entry as identical when every pressing detail matches', async () => {
      mockReleaseFindFirst.mockResolvedValue(release({ wishlistItems: [STORED_IDENTICAL] }))

      const result = await createWishlistItem(makeFormData({ ...WISHLIST_FIELDS, releaseId: '42' }))

      expect(result?.duplicate.wishlistItems).toEqual([
        expect.objectContaining({ wishlistItemId: 3, identical: true }),
      ])
    })

    it('treats blank, missing and differently-cased text as the same pressing', async () => {
      mockReleaseFindFirst.mockResolvedValue(
        release({
          wishlistItems: [
            { ...STORED_IDENTICAL, label: '  island  ', country: 'us', vinylColor: '' },
          ],
        })
      )

      const result = await createWishlistItem(makeFormData({ ...WISHLIST_FIELDS, releaseId: '42' }))

      expect(result?.duplicate.wishlistItems[0].identical).toBe(true)
    })

    it('does not treat a differing disc count as identical', async () => {
      mockReleaseFindFirst.mockResolvedValue(
        release({ wishlistItems: [{ ...STORED_IDENTICAL, discCount: 2 }] })
      )

      const result = await createWishlistItem(makeFormData({ ...WISHLIST_FIELDS, releaseId: '42' }))

      expect(result?.duplicate.wishlistItems[0].identical).toBe(false)
    })

    it('reports collection and wishlist collisions together', async () => {
      mockReleaseFindFirst.mockResolvedValue(
        release({ pressings: [OWNED_PRESSING], wishlistItems: [STORED_IDENTICAL] })
      )

      const result = await createWishlistItem(makeFormData({ ...WISHLIST_FIELDS, releaseId: '42' }))

      expect(result?.duplicate.pressings).toHaveLength(1)
      expect(result?.duplicate.wishlistItems[0].identical).toBe(true)
    })

    it('creates the item once the user confirms', async () => {
      mockReleaseFindFirst.mockResolvedValue(release({ wishlistItems: [STORED_IDENTICAL] }))

      const fd = makeFormData({ ...WISHLIST_FIELDS, releaseId: '42', confirmDuplicate: 'true' })
      const result = await createWishlistItem(fd)

      expect(result).toBeUndefined()
      expect(mockWishlistItemCreate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ releaseId: 42 }) })
      )
      expect(mockRedirect).toHaveBeenCalledWith('/wishlist')
    })

    it('attaches a confirmed item to the existing release rather than forking a new one', async () => {
      mockReleaseFindFirst.mockResolvedValue(release({ wishlistItems: [STORED_IDENTICAL] }))

      await createWishlistItem(
        makeFormData({
          ...WISHLIST_FIELDS,
          newReleaseTitle: 'Exodus',
          newReleaseYear: '1977',
          newArtistName: 'Bob Marley',
          confirmDuplicate: 'true',
        })
      )

      expect(mockReleaseCreate).not.toHaveBeenCalled()
      expect(mockWishlistItemCreate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ releaseId: 42 }) })
      )
    })

    it('saves without warning when the release exists but is referenced nowhere', async () => {
      mockReleaseFindFirst.mockResolvedValue(release({}))

      const result = await createWishlistItem(makeFormData({ ...WISHLIST_FIELDS, releaseId: '42' }))

      expect(result).toBeUndefined()
      expect(mockWishlistItemCreate).toHaveBeenCalled()
    })
  })
})
