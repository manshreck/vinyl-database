/**
 * @jest-environment node
 */
import { updateWishlistItem } from '@/app/actions/updateWishlistItem'

const mockUpdate = jest.fn()
const mockRedirect = jest.fn()

jest.mock('@/lib/prisma', () => ({
  getTenantPrisma: jest.fn().mockResolvedValue({
    wishlistItem: { update: (...args: unknown[]) => mockUpdate(...args) },
  }),
}))

jest.mock('@/lib/session', () => ({
  requireSession: jest.fn().mockResolvedValue({ userId: 1, email: 'a@b.com', databaseName: 'vinyl_user_test' }),
}))

jest.mock('next/navigation', () => ({
  redirect: (...args: unknown[]) => mockRedirect(...args),
}))

function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [key, value] of Object.entries(fields)) fd.append(key, value)
  return fd
}

const BASE_FIELDS = {
  formatId: '1',
  pressingYear: '1973',
  country: 'US',
  label: 'Columbia',
  catalogNumber: 'PC 32340',
  vinylColor: '',
  discCount: '1',
  notes: '',
}

describe('updateWishlistItem', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUpdate.mockResolvedValue({})
  })

  it('calls prisma.wishlistItem.update with the correct id', async () => {
    await updateWishlistItem(7, makeFormData(BASE_FIELDS))
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { wishlistItemId: 7 } })
    )
  })

  it('maps form fields to the correct data shape', async () => {
    await updateWishlistItem(7, makeFormData(BASE_FIELDS))
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          formatId: 1,
          pressingYear: 1973,
          country: 'US',
          label: 'Columbia',
          catalogNumber: 'PC 32340',
        }),
      })
    )
  })

  it('sets pressingYear to null when blank', async () => {
    await updateWishlistItem(7, makeFormData({ ...BASE_FIELDS, pressingYear: '' }))
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ pressingYear: null }) })
    )
  })

  it('trims whitespace from text fields', async () => {
    await updateWishlistItem(7, makeFormData({ ...BASE_FIELDS, label: '  Blue Note  ', country: '  JP  ' }))
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ label: 'Blue Note', country: 'JP' }),
      })
    )
  })

  it('sets label to null when empty after trim', async () => {
    await updateWishlistItem(7, makeFormData({ ...BASE_FIELDS, label: '   ' }))
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ label: null }) })
    )
  })

  it('does not include cost or condition fields in the update payload', async () => {
    await updateWishlistItem(7, makeFormData(BASE_FIELDS))
    const data = mockUpdate.mock.calls[0][0].data
    expect(data).not.toHaveProperty('purchasePrice')
    expect(data).not.toHaveProperty('purchaseDate')
    expect(data).not.toHaveProperty('currentValue')
    expect(data).not.toHaveProperty('recordCondition')
    expect(data).not.toHaveProperty('sleeveCondition')
  })

  it('redirects to /wishlist after update', async () => {
    await updateWishlistItem(7, makeFormData(BASE_FIELDS))
    expect(mockRedirect).toHaveBeenCalledWith('/wishlist')
  })
})
