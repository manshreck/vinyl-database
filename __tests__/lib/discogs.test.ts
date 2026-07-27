/**
 * @jest-environment node
 */
import { searchDiscogsReleases, getDiscogsRelease, resolveDiscogsToken, DiscogsApiError } from '@/lib/discogs'

const mockFetch = jest.fn()
const TOKEN = 'test-token'

beforeEach(() => {
  jest.resetAllMocks()
  global.fetch = mockFetch as unknown as typeof fetch
})

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: () => Promise.resolve(body) }
}

describe('resolveDiscogsToken', () => {
  const originalEnvToken = process.env.DISCOGS_TOKEN

  afterEach(() => {
    if (originalEnvToken === undefined) delete process.env.DISCOGS_TOKEN
    else process.env.DISCOGS_TOKEN = originalEnvToken
  })

  it('prefers the user token over the shared env token', () => {
    process.env.DISCOGS_TOKEN = 'shared-token'
    expect(resolveDiscogsToken('user-token')).toBe('user-token')
  })

  it('falls back to the shared env token when the user has none', () => {
    process.env.DISCOGS_TOKEN = 'shared-token'
    expect(resolveDiscogsToken(null)).toBe('shared-token')
  })

  it('returns null when neither a user token nor the env token is set', () => {
    delete process.env.DISCOGS_TOKEN
    expect(resolveDiscogsToken(null)).toBeNull()
  })
})

describe('searchDiscogsReleases', () => {
  it('requests the search endpoint with type=release, the query, and the token attached', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ results: [] }))

    await searchDiscogsReleases('Kind of Blue', TOKEN)

    const calledUrl = new URL(mockFetch.mock.calls[0][0])
    expect(calledUrl.pathname).toBe('/database/search')
    expect(calledUrl.searchParams.get('type')).toBe('release')
    expect(calledUrl.searchParams.get('q')).toBe('Kind of Blue')
    expect(calledUrl.searchParams.get('token')).toBe(TOKEN)

    const options = mockFetch.mock.calls[0][1]
    expect(options.headers['User-Agent']).toMatch(/VinylDatabase/)
  })

  it('maps raw results to the clean search-result shape', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        results: [
          {
            id: 2825456,
            title: 'Miles Davis - Kind Of Blue',
            year: '2010',
            country: 'US',
            label: ['Columbia', 'Legacy'],
            catno: '88697680571',
            format: ['Vinyl', 'LP', 'Album'],
            formats: [{ text: 'Blue, 180g' }],
            thumb: 'https://i.discogs.com/thumb.jpg',
          },
        ],
      })
    )

    const results = await searchDiscogsReleases('Kind of Blue', TOKEN)

    expect(results).toEqual([
      {
        id: 2825456,
        title: 'Miles Davis - Kind Of Blue',
        year: '2010',
        country: 'US',
        label: 'Columbia',
        catno: '88697680571',
        formats: ['Vinyl', 'LP', 'Album'],
        vinylColor: 'Blue',
        thumb: 'https://i.discogs.com/thumb.jpg',
      },
    ])
  })

  it('sets vinylColor to null when the format text has no color info', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        results: [
          {
            id: 1,
            title: 'Some Release',
            format: ['Vinyl', 'LP'],
            formats: [{ text: 'Terre Haute Pressing' }],
          },
        ],
      })
    )

    const [result] = await searchDiscogsReleases('x', TOKEN)
    expect(result.vinylColor).toBeNull()
  })

  it('sets vinylColor to null when formats is absent from the raw result', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ results: [{ id: 1, title: 'Some Release', format: ['Vinyl', 'LP'] }] })
    )

    const [result] = await searchDiscogsReleases('x', TOKEN)
    expect(result.vinylColor).toBeNull()
  })

  it('throws a DiscogsApiError when no token is passed', async () => {
    await expect(searchDiscogsReleases('x', null)).rejects.toThrow(DiscogsApiError)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('marks 429 responses as rate limited', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({}, false, 429))
    await expect(searchDiscogsReleases('x', TOKEN)).rejects.toMatchObject({
      status: 429,
      rateLimited: true,
    })
  })

  it('throws a generic DiscogsApiError on other non-2xx responses', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({}, false, 500))
    await expect(searchDiscogsReleases('x', TOKEN)).rejects.toMatchObject({
      status: 500,
      rateLimited: false,
    })
  })
})

describe('getDiscogsRelease', () => {
  it('uses the master release year as originalReleaseYear when a master exists', async () => {
    mockFetch
      .mockResolvedValueOnce(
        jsonResponse({
          id: 2825456,
          title: 'Kind Of Blue',
          year: 2010,
          country: 'US',
          master_id: 5460,
          artists: [{ name: 'Miles Davis' }],
          genres: ['Jazz'],
          labels: [{ name: 'Columbia', catno: '88697680571' }],
          formats: [{ name: 'Vinyl', qty: '1', descriptions: ['LP', 'Album'], text: 'Blue, 180g' }],
          notes: 'Some notes',
          images: [{ type: 'primary', uri: 'https://i.discogs.com/full.jpg' }],
        })
      )
      .mockResolvedValueOnce(jsonResponse({ id: 5460, title: 'Kind Of Blue', year: 1959 }))

    const release = await getDiscogsRelease(2825456, TOKEN)

    expect(release.pressingYear).toBe(2010)
    expect(release.originalReleaseYear).toBe(1959)
    expect(release.artists).toEqual(['Miles Davis'])
    expect(release.coverImageUrl).toBe('https://i.discogs.com/full.jpg')
    expect(release.vinylColor).toBe('Blue')
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('falls back to the release year when there is no master', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        id: 1,
        title: 'Some Release',
        year: 1999,
        artists: [],
        genres: [],
        labels: [],
        formats: [],
        images: [],
      })
    )

    const release = await getDiscogsRelease(1, TOKEN)

    expect(release.originalReleaseYear).toBe(1999)
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('falls back to the release year when the master lookup fails', async () => {
    mockFetch
      .mockResolvedValueOnce(
        jsonResponse({
          id: 1,
          title: 'Some Release',
          year: 1999,
          master_id: 42,
          artists: [],
          genres: [],
          labels: [],
          formats: [],
          images: [],
        })
      )
      .mockResolvedValueOnce(jsonResponse({}, false, 500))

    const release = await getDiscogsRelease(1, TOKEN)

    expect(release.originalReleaseYear).toBe(1999)
  })

  it('cleans Discogs disambiguation suffixes from artist names', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        id: 1,
        title: 'Some Release',
        year: 1999,
        artists: [{ name: 'Genesis (2)' }],
        genres: [],
        labels: [],
        formats: [],
        images: [],
      })
    )

    const release = await getDiscogsRelease(1, TOKEN)

    expect(release.artists).toEqual(['Genesis'])
  })

  it('throws a DiscogsApiError when no token is passed', async () => {
    await expect(getDiscogsRelease(1, null)).rejects.toThrow(DiscogsApiError)
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
