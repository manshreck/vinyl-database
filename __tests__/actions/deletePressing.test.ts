/**
 * @jest-environment node
 */
import { deletePressing } from '@/app/actions/deletePressing'

const mockDelete = jest.fn()
const mockRedirect = jest.fn()

jest.mock('@/lib/prisma', () => ({
  prisma: {
    pressing: { delete: (...args: unknown[]) => mockDelete(...args) },
  },
}))

jest.mock('next/navigation', () => ({
  redirect: (...args: unknown[]) => mockRedirect(...args),
}))

describe('deletePressing', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockDelete.mockResolvedValue({})
  })

  it('deletes the pressing with the given id', async () => {
    await deletePressing(42)
    expect(mockDelete).toHaveBeenCalledWith({ where: { pressingId: 42 } })
  })

  it('redirects to /pressings after deletion', async () => {
    await deletePressing(42)
    expect(mockRedirect).toHaveBeenCalledWith('/pressings')
  })

  it('redirects even for different pressing ids', async () => {
    await deletePressing(99)
    expect(mockDelete).toHaveBeenCalledWith({ where: { pressingId: 99 } })
    expect(mockRedirect).toHaveBeenCalledWith('/pressings')
  })
})
