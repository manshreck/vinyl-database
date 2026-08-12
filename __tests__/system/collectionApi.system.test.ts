/**
 * @jest-environment node
 *
 * API contract test for `GET /api/v1/pressings` — the real route handler over the real
 * collection service against a real scratch tenant schema, triggers and all.
 *
 * This is the layer MOBILE_APP_PLAN Phase 3 calls for: the JSON shapes mobile will
 * compile against, asserted against something that actually ran. The shapes here are
 * the ones D6 identifies as the real commitment, because a stale offline build reads
 * them and cannot be told they changed — so drift in this file is a breaking change,
 * not a test failure.
 *
 * `@/lib/session` and `@/lib/prisma` are doubled. The first has no request context in
 * Jest; the second would hand back a globally cached client with a 30-minute eviction
 * timer that keeps the Jest process alive (see AGENTS.md). Neither is what this test
 * targets — the handler, the service, the SQL and the triggers are all real.
 */
import type { PrismaClient } from '@prisma/client'
import { NextRequest } from 'next/server'
import { withScratchTenantSchema } from '@/test-support/db/scratchSchema'

const mockGetSession = jest.fn()
const mockGetTenantPrisma = jest.fn()

jest.mock('@/lib/session', () => ({
  getSession: (...args: unknown[]) => mockGetSession(...args),
}))

jest.mock('@/lib/prisma', () => ({
  getTenantPrisma: (...args: unknown[]) => mockGetTenantPrisma(...args),
}))

import { GET } from '@/app/api/v1/pressings/route'

function get(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost/api/v1/pressings', { headers })
}

describe('GET /api/v1/pressings (system)', () => {
  let scratch: Awaited<ReturnType<typeof withScratchTenantSchema>>
  let prisma: PrismaClient

  beforeAll(async () => {
    scratch = await withScratchTenantSchema()
    prisma = scratch.prisma

    // withScratchTenantSchema applies the DDL only; reference data is provisionTenant's
    // job, so this test seeds the two rows it needs.
    const format = await prisma.format.create({ data: { name: 'LP' } })
    const genre = await prisma.genre.create({ data: { name: 'Jazz' } })

    // Two artists whose filing order differs from their raw names, so the ordering
    // assertion below actually exercises artistSortKey rather than passing by luck.
    const beatles = await prisma.artist.create({
      data: { name: 'The Beatles', sortName: 'The Beatles' },
    })
    const davis = await prisma.artist.create({
      data: { name: 'Miles Davis', sortName: 'Davis, Miles' },
    })

    for (const [artistId, title, year] of [
      [beatles.artistId, 'Revolver', 1966],
      [davis.artistId, 'Kind of Blue', 1959],
    ] as const) {
      const release = await prisma.release.create({
        data: {
          title,
          originalReleaseYear: year,
          coverImageUrl: null,
          artists: { create: [{ artistId, artistOrder: 1 }] },
          genres: { create: [{ genreId: genre.genreId, genreOrder: 1 }] },
        },
      })
      await prisma.pressing.create({
        data: {
          releaseId: release.releaseId,
          formatId: format.formatId,
          recordCondition: 'NM' as never,
          discCount: 1,
          purchasePrice: '12.99',
          currentValue: '0.10',
          purchaseDate: new Date('2024-03-05T00:00:00Z'),
        },
      })
    }
  }, 60000)

  afterAll(async () => {
    await scratch.teardown()
  }, 30000)

  beforeEach(() => {
    jest.clearAllMocks()
    mockGetSession.mockResolvedValue({
      userId: 1,
      email: 'a@b.com',
      databaseName: scratch.schemaName,
      discogsToken: null,
      fullName: null,
      origin: 'mobile',
    })
    mockGetTenantPrisma.mockResolvedValue(prisma)
  })

  it('rejects an unauthenticated request with the D8 envelope', async () => {
    mockGetSession.mockResolvedValue(null)

    const response = await GET(get())
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.error.code).toBe('not_authenticated')
    // Never reaches the database — no session, no tenant client.
    expect(mockGetTenantPrisma).not.toHaveBeenCalled()
  })

  it('returns the whole collection with totals and a version', async () => {
    const response = await GET(get())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.pressings).toHaveLength(2)
    expect(body.totals).toEqual({ pressings: 2, artists: 2 })
    expect(typeof body.version).toBe('string')
    expect(body.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    // The tag describes the body it came with.
    expect(response.headers.get('etag')).toBe(`"${body.version}"`)
  })

  it('files pressings the way the collection does, ignoring leading articles', async () => {
    const { pressings } = await (await GET(get())).json()

    // "The Beatles" files under B, so Revolver precedes Kind of Blue by Miles Davis
    // ("Davis, Miles" → D). Raw-string ordering would put them the other way round.
    expect(pressings.map((p: { title: string }) => p.title)).toEqual([
      'Revolver',
      'Kind of Blue',
    ])
  })

  it('serialises money as decimal strings and dates as day-only', async () => {
    const { pressings } = await (await GET(get())).json()
    const [first] = pressings

    expect(first.purchasePrice).toBe('12.99')
    // Normalized, not fixed-precision: "0.10" comes back "0.1". Pinned because it is
    // observable, and therefore contract whether or not we meant it.
    expect(first.currentValue).toBe('0.1')
    expect(first.purchaseDate).toBe('2024-03-05')
  })

  it('gives artists and genres as arrays, not joined strings', async () => {
    const { pressings } = await (await GET(get())).json()

    // A caller splitting on ", " could not tell two artists from one whose name
    // contains a comma — "Earth, Wind & Fire" being the obvious case.
    expect(Array.isArray(pressings[0].artists)).toBe(true)
    expect(pressings[0].artists).toEqual(['The Beatles'])
    expect(Array.isArray(pressings[0].genres)).toBe(true)
  })

  it('carries enough per pressing for a detail screen to render offline', async () => {
    const { pressings } = await (await GET(get())).json()

    // The point of D5: a client in a shop with no signal must not need a second call.
    expect(Object.keys(pressings[0]).sort()).toEqual(
      [
        'artists', 'catalogNumber', 'country', 'coverImageUrl', 'currentValue',
        'discCount', 'formatName', 'genres', 'label', 'notes', 'originalReleaseYear',
        'pressingId', 'pressingYear', 'purchaseDate', 'purchasePrice',
        'recordCondition', 'sleeveCondition', 'title', 'vinylColor',
      ].sort()
    )
  })

  describe('cache revalidation', () => {
    it('answers 304 with no body when the caller is already current', async () => {
      const first = await GET(get())
      const etag = first.headers.get('etag')!

      const second = await GET(get({ 'if-none-match': etag }))

      expect(second.status).toBe(304)
      expect(await second.text()).toBe('')
      expect(second.headers.get('etag')).toBe(etag)
    })

    it('tolerates a weak validator and a list of tags', async () => {
      const etag = (await GET(get())).headers.get('etag')!

      const weak = await GET(get({ 'if-none-match': `W/${etag}` }))
      const list = await GET(get({ 'if-none-match': `"999999", ${etag}` }))

      expect(weak.status).toBe(304)
      expect(list.status).toBe(304)
    })

    // The reason this mechanism exists at all: a deletion leaves no updated_at, so a
    // timestamp-based check would miss exactly this and serve a stale collection.
    it('changes the version when a wishlist entry is deleted', async () => {
      const before = (await GET(get())).headers.get('etag')!

      const release = await prisma.release.findFirstOrThrow()
      const format = await prisma.format.findFirstOrThrow()
      const item = await prisma.wishlistItem.create({
        data: { releaseId: release.releaseId, formatId: format.formatId, discCount: 1 },
      })
      const afterInsert = (await GET(get())).headers.get('etag')!

      await prisma.wishlistItem.delete({ where: { wishlistItemId: item.wishlistItemId } })
      const afterDelete = (await GET(get())).headers.get('etag')!

      expect(afterInsert).not.toBe(before)
      expect(afterDelete).not.toBe(afterInsert)

      // And a caller holding the pre-delete tag is told to refetch.
      const revalidated = await GET(get({ 'if-none-match': afterInsert }))
      expect(revalidated.status).toBe(200)
    })

    it('changes the version when a pressing is added', async () => {
      const before = (await GET(get())).headers.get('etag')!

      const release = await prisma.release.findFirstOrThrow()
      const format = await prisma.format.findFirstOrThrow()
      await prisma.pressing.create({
        data: {
          releaseId: release.releaseId,
          formatId: format.formatId,
          recordCondition: 'VG' as never,
          discCount: 1,
        },
      })

      expect((await GET(get())).headers.get('etag')).not.toBe(before)
    })
  })
})
