/**
 * @jest-environment node
 */
import { GET } from '@/app/api/releases/search/route'
import { NextRequest } from 'next/server'

const mockFindMany = jest.fn()

jest.mock('@/lib/prisma', () => ({
  prisma: {
    release: { findMany: (...args: unknown[]) => mockFindMany(...args) },
  },
}))

function makeRequest(q: string): NextRequest {
  return new NextRequest(`http://localhost/api/releases/search?q=${encodeURIComponent(q)}`)
}

describe('GET /api/releases/search', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockFindMany.mockResolvedValue([])
  })

  it('returns an empty array when q is shorter than 2 characters', async () => {
    const res = await GET(makeRequest('a'))
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

  it('queries releases with a case-insensitive contains filter', async () => {
    await GET(makeRequest('kind'))
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { title: { contains: 'kind', mode: 'insensitive' } },
      })
    )
  })

  it('returns at most 10 results', async () => {
    await GET(makeRequest('blue'))
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 10 })
    )
  })

  it('returns the releases as JSON', async () => {
    const fakeReleases = [{ releaseId: 1, title: 'Kind of Blue', artists: [] }]
    mockFindMany.mockResolvedValue(fakeReleases)
    const res = await GET(makeRequest('kind'))
    const body = await res.json()
    expect(body).toEqual(fakeReleases)
  })
})
