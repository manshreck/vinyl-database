/**
 * @jest-environment node
 */
import { GET } from '@/app/api/artists/search/route'
import { NextRequest } from 'next/server'

const mockFindMany = jest.fn()

jest.mock('@/lib/prisma', () => ({
  prisma: {
    artist: { findMany: (...args: unknown[]) => mockFindMany(...args) },
  },
}))

function makeRequest(q: string): NextRequest {
  return new NextRequest(`http://localhost/api/artists/search?q=${encodeURIComponent(q)}`)
}

describe('GET /api/artists/search', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockFindMany.mockResolvedValue([])
  })

  it('returns an empty array when q is shorter than 2 characters', async () => {
    const res = await GET(makeRequest('m'))
    const body = await res.json()
    expect(body).toEqual([])
    expect(mockFindMany).not.toHaveBeenCalled()
  })

  it('returns an empty array when q is empty', async () => {
    const res = await GET(makeRequest(''))
    const body = await res.json()
    expect(body).toEqual([])
    expect(mockFindMany).not.toHaveBeenCalled()
  })

  it('queries artists with a case-insensitive contains filter', async () => {
    await GET(makeRequest('miles'))
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { name: { contains: 'miles', mode: 'insensitive' } },
      })
    )
  })

  it('orders results by sortName', async () => {
    await GET(makeRequest('miles'))
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { sortName: 'asc' } })
    )
  })

  it('returns at most 10 results', async () => {
    await GET(makeRequest('miles'))
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 10 })
    )
  })

  it('returns the artists as JSON', async () => {
    const fakeArtists = [{ artistId: 1, name: 'Miles Davis', sortName: 'Davis, Miles' }]
    mockFindMany.mockResolvedValue(fakeArtists)
    const res = await GET(makeRequest('miles'))
    const body = await res.json()
    expect(body).toEqual(fakeArtists)
  })
})
