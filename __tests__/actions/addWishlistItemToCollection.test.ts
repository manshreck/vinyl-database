/**
 * @jest-environment node
 */
import { addWishlistItemToCollection } from '@/app/actions/addWishlistItemToCollection'

const mockFindUnique = jest.fn()
const mockPressingCreate = jest.fn()
const mockWishlistItemDelete = jest.fn()
const mockRedirect = jest.fn()
const mockNotFound = jest.fn(() => {
  throw new Error('NEXT_NOT_FOUND')
})

const tx = {
  pressing: { create: (...args: unknown[]) => mockPressingCreate(...args) },
  wishlistItem: { delete: (...args: unknown[]) => mockWishlistItemDelete(...args) },
}

jest.mock('@/lib/prisma', () => ({
  getTenantPrisma: jest.fn().mockResolvedValue({
    wishlistItem: { findUnique: (...args: unknown[]) => mockFindUnique(...args) },
    $transaction: (fn: (tx: unknown) => unknown) => fn(tx),
  }),
}))

jest.mock('@/lib/session', () => ({
  requireSession: jest.fn().mockResolvedValue({ userId: 1, email: 'a@b.com', databaseName: 'vinyl_user_test' }),
}))

jest.mock('next/navigation', () => ({
  redirect: (...args: unknown[]) => mockRedirect(...args),
  notFound: () => mockNotFound(),
}))

const WISHLIST_ITEM = {
  wishlistItemId: 7,
  releaseId: 5,
  formatId: 2,
  pressingYear: 1975,
  country: 'US',
  label: 'Island',
  catalogNumber: 'ILPS 9329',
  vinylColor: null,
  discCount: 1,
  notes: null,
}

const BASE_FORM_FIELDS = {
  recordCondition: 'NM',
  sleeveCondition: '',
  purchaseDate: '2026-07-05',
  purchasePrice: '',
  currentValue: '',
}

function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [key, value] of Object.entries(fields)) fd.append(key, value)
  return fd
}

describe('addWishlistItemToCollection', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockFindUnique.mockResolvedValue(WISHLIST_ITEM)
    mockPressingCreate.mockResolvedValue({ pressingId: 123 })
    mockWishlistItemDelete.mockResolvedValue({})
  })

  it('creates a pressing carrying over the wishlist item fields', async () => {
    const fd = makeFormData(BASE_FORM_FIELDS)
    await addWishlistItemToCollection(7, fd)
    expect(mockPressingCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        releaseId: 5,
        formatId: 2,
        catalogNumber: 'ILPS 9329',
      }),
    })
  })

  it('sets the record and sleeve condition from the form', async () => {
    const fd = makeFormData({ ...BASE_FORM_FIELDS, recordCondition: 'VG_PLUS', sleeveCondition: 'NM' })
    await addWishlistItemToCollection(7, fd)
    const data = mockPressingCreate.mock.calls[0][0].data
    expect(data.recordCondition).toBe('VG_PLUS')
    expect(data.sleeveCondition).toBe('NM')
  })

  it('sets sleeveCondition to null when blank', async () => {
    const fd = makeFormData({ ...BASE_FORM_FIELDS, sleeveCondition: '' })
    await addWishlistItemToCollection(7, fd)
    const data = mockPressingCreate.mock.calls[0][0].data
    expect(data.sleeveCondition).toBeNull()
  })

  it('sets the purchase date, price, and current value from the form', async () => {
    const fd = makeFormData({ ...BASE_FORM_FIELDS, purchasePrice: '29.99', currentValue: '50' })
    await addWishlistItemToCollection(7, fd)
    const data = mockPressingCreate.mock.calls[0][0].data
    expect(data.purchaseDate).toEqual(new Date('2026-07-05'))
    expect(data.purchasePrice).toBe(29.99)
    expect(data.currentValue).toBe(50)
  })

  it('deletes the wishlist item after creating the pressing', async () => {
    const fd = makeFormData(BASE_FORM_FIELDS)
    await addWishlistItemToCollection(7, fd)
    expect(mockWishlistItemDelete).toHaveBeenCalledWith({ where: { wishlistItemId: 7 } })
  })

  it('redirects to the new pressing detail page', async () => {
    const fd = makeFormData(BASE_FORM_FIELDS)
    await addWishlistItemToCollection(7, fd)
    expect(mockRedirect).toHaveBeenCalledWith('/pressings/123')
  })

  it('calls notFound when the wishlist item does not exist', async () => {
    mockFindUnique.mockResolvedValue(null)
    const fd = makeFormData(BASE_FORM_FIELDS)
    await expect(addWishlistItemToCollection(999, fd)).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mockPressingCreate).not.toHaveBeenCalled()
  })
})
