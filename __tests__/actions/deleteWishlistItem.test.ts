/**
 * @jest-environment node
 */
import { deleteWishlistItem } from '@/app/actions/deleteWishlistItem'

const mockDelete = jest.fn()
const mockRedirect = jest.fn()

jest.mock('@/lib/prisma', () => ({
  getTenantPrisma: jest.fn().mockResolvedValue({
    wishlistItem: { delete: (...args: unknown[]) => mockDelete(...args) },
  }),
}))

jest.mock('@/lib/session', () => ({
  requireSession: jest.fn().mockResolvedValue({ userId: 1, email: 'a@b.com', databaseName: 'vinyl_user_test' }),
}))

jest.mock('next/navigation', () => ({
  redirect: (...args: unknown[]) => mockRedirect(...args),
}))

describe('deleteWishlistItem', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockDelete.mockResolvedValue({})
  })

  it('deletes the wishlist item with the given id', async () => {
    await deleteWishlistItem(42)
    expect(mockDelete).toHaveBeenCalledWith({ where: { wishlistItemId: 42 } })
  })

  it('redirects to /wishlist after deletion', async () => {
    await deleteWishlistItem(42)
    expect(mockRedirect).toHaveBeenCalledWith('/wishlist')
  })
})
