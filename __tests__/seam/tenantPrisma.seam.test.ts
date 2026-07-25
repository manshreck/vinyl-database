/**
 * @jest-environment node
 *
 * Seam integration test: the generated Prisma Client ↔ a database built from
 * prisma/tenant-schema.sql. See TESTING_PLAN.md §2.3.
 *
 * schema.prisma (what the generated client expects) and tenant-schema.sql (what
 * actually provisions a tenant database, via provisionTenant.ts) are maintained by
 * hand as two separate files describing the same schema, and nothing today notices
 * if they drift apart. This test writes real rows through the real generated client
 * against a database built the same way provisionTenant.ts builds one, then reads
 * them back — a divergence between the two schema definitions (a renamed column, a
 * changed type, a dropped constraint) would surface here as a real Prisma error or a
 * mismatched read, not silently in production.
 *
 * Deliberately narrower than contract/fakePrismaClient.contract.test.ts, which runs
 * this same real-client-against-real-scratch-database path as one half of a larger
 * fake-vs-real comparison. That test already exercises this path as a side effect of
 * proving the fake faithful; this one exists on its own so the schema-drift gap keeps
 * a dedicated test even if the fake or its contract test is ever removed.
 */
import { withScratchTenantDatabase, type ScratchTenantDatabase } from '@/test-support/db/scratchDatabase'

describe('generated Prisma Client ↔ tenant-schema.sql database (seam)', () => {
  let scratch: ScratchTenantDatabase

  beforeAll(async () => {
    scratch = await withScratchTenantDatabase()
  }, 30000)

  afterAll(async () => {
    await scratch.teardown()
  })

  it('writes a release, artist, and pressing through the real client and reads them back unchanged', async () => {
    const { prisma } = scratch

    const genre = await prisma.genre.create({ data: { name: 'Jazz' } })
    const format = await prisma.format.create({ data: { name: 'LP', description: 'Long-playing record' } })
    const artist = await prisma.artist.create({ data: { name: 'Miles Davis', sortName: 'Davis, Miles' } })

    const release = await prisma.release.create({
      data: {
        title: 'Kind Of Blue',
        originalReleaseYear: 1959,
        coverImageUrl: null,
        artists: { create: [{ artistId: artist.artistId, artistOrder: 1 }] },
        genres: { create: [{ genreId: genre.genreId, genreOrder: 1 }] },
      },
    })

    const pressing = await prisma.pressing.create({
      data: {
        releaseId: release.releaseId,
        formatId: format.formatId,
        pressingYear: 1959,
        country: 'US',
        label: 'Columbia',
        catalogNumber: 'CS 8163',
        vinylColor: null,
        discCount: 1,
        recordCondition: 'VG_PLUS',
        sleeveCondition: null,
        notes: null,
        purchasePrice: null,
        purchaseDate: null,
        currentValue: null,
      },
    })

    const readBack = await prisma.pressing.findUnique({
      where: { pressingId: pressing.pressingId },
      include: {
        format: true,
        release: {
          include: {
            artists: { include: { artist: true }, orderBy: { artistOrder: 'asc' } },
            genres: { include: { genre: true }, orderBy: { genreOrder: 'asc' } },
          },
        },
      },
    })

    expect(readBack?.recordCondition).toBe('VG_PLUS')
    expect(readBack?.country).toBe('US')
    expect(readBack?.format.name).toBe('LP')
    expect(readBack?.release.title).toBe('Kind Of Blue')
    expect(readBack?.release.artists.map((a) => a.artist.name)).toEqual(['Miles Davis'])
    expect(readBack?.release.genres.map((g) => g.genre.name)).toEqual(['Jazz'])
  }, 30000)
})
