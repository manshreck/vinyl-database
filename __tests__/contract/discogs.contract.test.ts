/**
 * @jest-environment node
 *
 * Contract test: proves the fake Discogs fixtures (test-support/fakes/fixtures/*.json,
 * served by test-support/fakes/discogsServer.ts) still match the shape of Discogs'
 * real API responses. This is what keeps the fake honest — see swe-test-doubles: a
 * fake cannot detect its own drift, only a contract test against the real thing can.
 *
 * Hits the real network with the shared DISCOGS_TOKEN. Not part of `npm test` or the
 * default `npm run test:integration` run — see TESTING.md §4. Run explicitly via
 * `npm run test:contract` whenever lib/discogs.ts or lib/discogsMapping.ts changes,
 * and otherwise on a schedule once one exists.
 */
import searchFixture from '@/test-support/fakes/fixtures/search-kind-of-blue.json'
import releaseFixture from '@/test-support/fakes/fixtures/release-2825456.json'
import masterFixture from '@/test-support/fakes/fixtures/master-5460.json'

const DISCOGS_API_BASE = 'https://api.discogs.com'
const USER_AGENT = 'VinylDatabase/1.0 +https://github.com/manshreck/vinyl-database'

async function fetchReal<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${DISCOGS_API_BASE}${path}`)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  url.searchParams.set('token', process.env.DISCOGS_TOKEN!)
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
  if (!res.ok) throw new Error(`Discogs request failed: ${res.status} ${path}`)
  return res.json() as Promise<T>
}

/** Reduces a JSON value to a description of its shape: types and key names, not values. */
function shapeOf(value: unknown): unknown {
  if (value === null) return 'null'
  if (Array.isArray(value)) return value.length > 0 ? [shapeOf(value[0])] : []
  if (typeof value === 'object') {
    const shape: Record<string, unknown> = {}
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) shape[key] = shapeOf(v)
    return shape
  }
  return typeof value
}

/**
 * Asserts every field present in the fixture's shape also exists in the real
 * response's shape, with the same type. Extra fields on the real side are fine
 * (Discogs adding fields isn't a breaking change for us); a missing field or a
 * changed type is exactly the drift this test exists to catch.
 */
function assertShapeSubset(expected: unknown, actual: unknown, path: string) {
  if (typeof expected === 'string') {
    expect({ path, shape: actual }).toEqual({ path, shape: expected })
    return
  }
  if (Array.isArray(expected)) {
    expect(Array.isArray(actual)).toBe(true)
    if (expected.length > 0 && Array.isArray(actual) && actual.length > 0) {
      assertShapeSubset(expected[0], actual[0], `${path}[]`)
    }
    return
  }
  const expectedObj = expected as Record<string, unknown>
  const actualObj = (actual ?? {}) as Record<string, unknown>
  for (const key of Object.keys(expectedObj)) {
    expect(Object.prototype.hasOwnProperty.call(actualObj, key)).toBe(true)
    assertShapeSubset(expectedObj[key], actualObj[key], `${path}.${key}`)
  }
}

const maybeDescribe = process.env.DISCOGS_TOKEN ? describe : describe.skip

maybeDescribe('Discogs fixtures vs. the real API (contract)', () => {
  it('search results still have the shape lib/discogs.ts depends on', async () => {
    const real = await fetchReal<{ results: unknown[] }>('/database/search', {
      type: 'release',
      q: 'Kind of Blue Miles Davis',
      per_page: '25',
    })
    expect(real.results.length).toBeGreaterThan(0)
    assertShapeSubset(shapeOf(searchFixture.results[0]), shapeOf(real.results[0]), 'results[0]')
  })

  it('a release response still has the shape lib/discogs.ts depends on', async () => {
    const real = await fetchReal('/releases/2825456')
    assertShapeSubset(shapeOf(releaseFixture), shapeOf(real), 'release')
  })

  it('a master response still has the shape lib/discogs.ts depends on', async () => {
    const real = await fetchReal('/masters/5460')
    assertShapeSubset(shapeOf(masterFixture), shapeOf(real), 'master')
  })
})
