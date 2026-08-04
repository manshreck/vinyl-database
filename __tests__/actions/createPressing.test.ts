/**
 * @jest-environment node
 */
import { createPressing } from '@/app/actions/createPressing'

const mockArtistFindFirst = jest.fn()
const mockArtistCreate = jest.fn()
const mockReleaseCreate = jest.fn()
const mockReleaseFindFirst = jest.fn()
const mockPressingCreate = jest.fn()
const mockWishlistDeleteMany = jest.fn()
const mockRedirect = jest.fn()

// The action writes the pressing and clears fulfilled wishlist entries in one
// transaction; the fake runs the callback against the same mocks.
const tx = {
  pressing: { create: (...args: unknown[]) => mockPressingCreate(...args) },
  wishlistItem: { deleteMany: (...args: unknown[]) => mockWishlistDeleteMany(...args) },
}

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
    pressing: { create: (...args: unknown[]) => mockPressingCreate(...args) },
    $transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
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
    mockArtistFindFirst.mockResolvedValue(null)
    mockArtistCreate.mockResolvedValue({ artistId: 99 })
    mockReleaseCreate.mockResolvedValue({ releaseId: 88 })
    mockReleaseFindFirst.mockResolvedValue(null)
    mockPressingCreate.mockResolvedValue({})
    mockWishlistDeleteMany.mockResolvedValue({ count: 0 })
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

    it('passes newReleaseCoverImageUrl through to the release create', async () => {
      const fd = makeFormData({
        ...PRESSING_FIELDS,
        newReleaseTitle: 'Exodus',
        newReleaseYear: '1977',
        newArtistName: 'Bob Marley',
        newReleaseCoverImageUrl: 'https://i.discogs.com/cover.jpg',
      })
      await createPressing(fd)
      expect(mockReleaseCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ coverImageUrl: 'https://i.discogs.com/cover.jpg' }),
        })
      )
    })

    it('sets coverImageUrl to null when not provided', async () => {
      const fd = makeFormData({
        ...PRESSING_FIELDS,
        newReleaseTitle: 'Exodus',
        newReleaseYear: '1977',
        newArtistName: 'Bob Marley',
      })
      await createPressing(fd)
      expect(mockReleaseCreate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ coverImageUrl: null }) })
      )
    })
  })

  it('redirects to /pressings after creation', async () => {
    const fd = makeFormData({ ...PRESSING_FIELDS, releaseId: '5' })
    await createPressing(fd)
    expect(mockRedirect).toHaveBeenCalledWith('/pressings')
  })

  describe('when the release already has pressings', () => {
    const NEW_RELEASE_FIELDS = {
      ...PRESSING_FIELDS,
      newReleaseTitle: 'Exodus',
      newReleaseYear: '1977',
      newArtistName: 'Bob Marley',
    }

    function existingRelease(pressings: unknown[], wishlistItems: unknown[] = []) {
      return {
        releaseId: 42,
        title: 'Exodus',
        originalReleaseYear: 1977,
        coverImageUrl: 'https://i.discogs.com/exodus.jpg',
        artists: [{ artist: { name: 'Bob Marley' } }],
        pressings,
        wishlistItems,
      }
    }

    const EXISTING_PRESSING = {
      pressingId: 7,
      format: { name: 'LP' },
      pressingYear: 1977,
      country: 'JA',
      label: 'Island',
      catalogNumber: 'ILPS 9498',
      vinylColor: null,
      discCount: 1,
      recordCondition: 'VG_PLUS',
      sleeveCondition: 'VG',
      purchaseDate: new Date('2021-03-04T00:00:00Z'),
    }

    beforeEach(() => {
      mockReleaseFindFirst.mockResolvedValue(existingRelease([EXISTING_PRESSING]))
    })

    it('returns the duplicate instead of creating the pressing', async () => {
      const result = await createPressing(makeFormData(NEW_RELEASE_FIELDS))
      expect(mockPressingCreate).not.toHaveBeenCalled()
      expect(mockRedirect).not.toHaveBeenCalled()
      expect(result?.duplicate).toMatchObject({ releaseId: 42, title: 'Exodus' })
    })

    it('describes the existing pressing so the dialog can show its particulars', async () => {
      const result = await createPressing(makeFormData(NEW_RELEASE_FIELDS))
      expect(result?.duplicate.pressings).toEqual([
        {
          pressingId: 7,
          formatName: 'LP',
          pressingYear: 1977,
          country: 'JA',
          label: 'Island',
          catalogNumber: 'ILPS 9498',
          vinylColor: null,
          discCount: 1,
          recordCondition: 'VG_PLUS',
          sleeveCondition: 'VG',
          purchaseDate: '2021-03-04',
        },
      ])
    })

    it('matches on title and artist case-insensitively', async () => {
      await createPressing(makeFormData(NEW_RELEASE_FIELDS))
      expect(mockReleaseFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            title: { equals: 'Exodus', mode: 'insensitive' },
            artists: { some: { artist: { name: { equals: 'Bob Marley', mode: 'insensitive' } } } },
          },
        })
      )
    })

    it('creates the pressing once the user confirms', async () => {
      const fd = makeFormData({ ...NEW_RELEASE_FIELDS, confirmDuplicate: 'true' })
      const result = await createPressing(fd)
      expect(result).toBeUndefined()
      expect(mockPressingCreate).toHaveBeenCalled()
      expect(mockRedirect).toHaveBeenCalledWith('/pressings')
    })

    it('attaches the confirmed pressing to the existing release instead of forking a new one', async () => {
      const fd = makeFormData({ ...NEW_RELEASE_FIELDS, confirmDuplicate: 'true' })
      await createPressing(fd)
      expect(mockReleaseCreate).not.toHaveBeenCalled()
      expect(mockPressingCreate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ releaseId: 42 }) })
      )
    })

    it('warns for a release reached by picking it out of the collection search', async () => {
      const result = await createPressing(makeFormData({ ...PRESSING_FIELDS, releaseId: '42' }))
      expect(mockReleaseFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { releaseId: 42 } })
      )
      expect(result?.duplicate.releaseId).toBe(42)
    })
  })

  describe('when the release exists but has no pressings', () => {
    it('reuses it without warning, rather than creating a duplicate release', async () => {
      mockReleaseFindFirst.mockResolvedValue({
        releaseId: 42,
        title: 'Exodus',
        originalReleaseYear: 1977,
        coverImageUrl: null,
        artists: [{ artist: { name: 'Bob Marley' } }],
        pressings: [],
        wishlistItems: [],
      })
      const result = await createPressing(
        makeFormData({
          ...PRESSING_FIELDS,
          newReleaseTitle: 'Exodus',
          newReleaseYear: '1977',
          newArtistName: 'Bob Marley',
        })
      )
      expect(result).toBeUndefined()
      expect(mockReleaseCreate).not.toHaveBeenCalled()
      expect(mockPressingCreate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ releaseId: 42 }) })
      )
    })
  })

  describe('when the release is on the wishlist', () => {
    // Mirrors PRESSING_FIELDS: format 2, 1975, US, Island, ILPS 9329, no color, 1 disc.
    const WANTED_IDENTICAL = {
      wishlistItemId: 3,
      format: { name: '10"' },
      formatId: 2,
      pressingYear: 1975,
      country: 'US',
      label: 'Island',
      catalogNumber: 'ILPS 9329',
      vinylColor: null,
      discCount: 1,
    }
    const WANTED_OTHER = { ...WANTED_IDENTICAL, wishlistItemId: 4, pressingYear: 2015 }

    function releaseWithWishlist(wishlistItems: unknown[], pressings: unknown[] = []) {
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

    it('warns even when no pressing is owned yet', async () => {
      mockReleaseFindFirst.mockResolvedValue(releaseWithWishlist([WANTED_IDENTICAL]))

      const result = await createPressing(makeFormData({ ...PRESSING_FIELDS, releaseId: '42' }))

      expect(mockPressingCreate).not.toHaveBeenCalled()
      expect(result?.duplicate.pressings).toHaveLength(0)
      expect(result?.duplicate.wishlistItems).toEqual([
        expect.objectContaining({ wishlistItemId: 3, identical: true }),
      ])
    })

    it('clears the fulfilled entry once the user confirms', async () => {
      mockReleaseFindFirst.mockResolvedValue(releaseWithWishlist([WANTED_IDENTICAL]))

      await createPressing(
        makeFormData({ ...PRESSING_FIELDS, releaseId: '42', confirmDuplicate: 'true' })
      )

      expect(mockPressingCreate).toHaveBeenCalled()
      expect(mockWishlistDeleteMany).toHaveBeenCalledWith({
        where: { wishlistItemId: { in: [3] } },
      })
    })

    it('keeps entries describing a different pressing by default', async () => {
      mockReleaseFindFirst.mockResolvedValue(releaseWithWishlist([WANTED_OTHER]))

      await createPressing(
        makeFormData({ ...PRESSING_FIELDS, releaseId: '42', confirmDuplicate: 'true' })
      )

      expect(mockPressingCreate).toHaveBeenCalled()
      expect(mockWishlistDeleteMany).not.toHaveBeenCalled()
    })

    it('clears a different-pressing entry when the user opts in', async () => {
      mockReleaseFindFirst.mockResolvedValue(releaseWithWishlist([WANTED_OTHER]))

      await createPressing(
        makeFormData({
          ...PRESSING_FIELDS,
          releaseId: '42',
          confirmDuplicate: 'true',
          removeFromWishlist: 'true',
        })
      )

      expect(mockWishlistDeleteMany).toHaveBeenCalledWith({
        where: { wishlistItemId: { in: [4] } },
      })
    })

    it('clears both kinds when the user opts in and the wishlist holds both', async () => {
      mockReleaseFindFirst.mockResolvedValue(
        releaseWithWishlist([WANTED_IDENTICAL, WANTED_OTHER])
      )

      await createPressing(
        makeFormData({
          ...PRESSING_FIELDS,
          releaseId: '42',
          confirmDuplicate: 'true',
          removeFromWishlist: 'true',
        })
      )

      expect(mockWishlistDeleteMany).toHaveBeenCalledWith({
        where: { wishlistItemId: { in: [3, 4] } },
      })
    })

    it('derives the ids to clear from its own query, not from the form', async () => {
      // A doctored form naming an unrelated wishlist item must not widen the delete.
      mockReleaseFindFirst.mockResolvedValue(releaseWithWishlist([WANTED_OTHER]))

      await createPressing(
        makeFormData({
          ...PRESSING_FIELDS,
          releaseId: '42',
          confirmDuplicate: 'true',
          removeFromWishlist: 'true',
          wishlistItemId: '999',
        })
      )

      expect(mockWishlistDeleteMany).toHaveBeenCalledWith({
        where: { wishlistItemId: { in: [4] } },
      })
    })

    it('clears only the fulfilled entry when the wishlist holds both', async () => {
      mockReleaseFindFirst.mockResolvedValue(
        releaseWithWishlist([WANTED_IDENTICAL, WANTED_OTHER])
      )

      await createPressing(
        makeFormData({ ...PRESSING_FIELDS, releaseId: '42', confirmDuplicate: 'true' })
      )

      expect(mockWishlistDeleteMany).toHaveBeenCalledWith({
        where: { wishlistItemId: { in: [3] } },
      })
    })

    it('writes the pressing and clears the entry in the same transaction', async () => {
      mockReleaseFindFirst.mockResolvedValue(releaseWithWishlist([WANTED_IDENTICAL]))
      const order: string[] = []
      mockPressingCreate.mockImplementation(() => { order.push('create'); return Promise.resolve({}) })
      mockWishlistDeleteMany.mockImplementation(() => { order.push('delete'); return Promise.resolve({ count: 1 }) })

      await createPressing(
        makeFormData({ ...PRESSING_FIELDS, releaseId: '42', confirmDuplicate: 'true' })
      )

      expect(order).toEqual(['create', 'delete'])
    })

    it('leaves the wishlist alone when the release is merely owned', async () => {
      mockReleaseFindFirst.mockResolvedValue(existingReleaseOwnedOnly())

      await createPressing(
        makeFormData({ ...PRESSING_FIELDS, releaseId: '42', confirmDuplicate: 'true' })
      )

      expect(mockWishlistDeleteMany).not.toHaveBeenCalled()
    })

    function existingReleaseOwnedOnly() {
      return releaseWithWishlist([], [
        {
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
        },
      ])
    }
  })

  describe('when the form carries no artist to match on', () => {
    it('skips the duplicate lookup rather than matching on title alone', async () => {
      const fd = makeFormData({
        ...PRESSING_FIELDS,
        newReleaseTitle: 'Greatest Hits',
        newReleaseYear: '1977',
        newArtistName: '',
      })
      const result = await createPressing(fd)
      expect(mockReleaseFindFirst).not.toHaveBeenCalled()
      expect(result).toBeUndefined()
    })
  })
})
