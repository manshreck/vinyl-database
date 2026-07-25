/**
 * @jest-environment node
 *
 * Contract test: proves fakePrismaClient agrees with the real generated Prisma
 * Client, for the operations the fake implements — see swe-test-doubles (a fake
 * cannot detect its own drift from the real thing; only a contract test can) and
 * TESTING.md §1.2/§2.3.
 *
 * Runs the identical script of operations against the fake and against a real,
 * disposable scratch tenant database (a "proxy" — see swe-test-doubles), then
 * compares the results. Needs a local Postgres — not part of `npm test`, run via
 * `npm run test:integration`. Re-run this whenever fakePrismaClient.ts or
 * prisma/schema.prisma changes.
 */
import type { PrismaClient } from '@prisma/client'
import { createFakePrismaClient, type FakePrismaClient } from '@/test-support/fakes/fakePrismaClient'
import { withScratchTenantDatabase, type ScratchTenantDatabase } from '@/test-support/db/scratchDatabase'

// The fake's $transaction signature and the real client's overloaded one aren't
// structurally compatible enough for TypeScript to unify FakePrismaClient|PrismaClient
// as one callable type. This is the minimal shape runScenario actually calls — both
// real implementations satisfy it; that structural agreement is exactly what this
// test verifies at runtime, so a loose contract type here is deliberate, not lazy.
type AnyRecord = Record<string, unknown>
type TestPrismaLike = {
  genre: { create(args: AnyRecord): Promise<AnyRecord> }
  format: { create(args: AnyRecord): Promise<AnyRecord> }
  artist: { create(args: AnyRecord): Promise<AnyRecord> }
  release: {
    create(args: AnyRecord): Promise<AnyRecord>
    findUnique(args: AnyRecord): Promise<AnyRecord | null>
    update(args: AnyRecord): Promise<AnyRecord>
  }
  pressing: {
    create(args: AnyRecord): Promise<AnyRecord>
    findUnique(args: AnyRecord): Promise<AnyRecord | null>
    update(args: AnyRecord): Promise<AnyRecord>
    delete(args: AnyRecord): Promise<AnyRecord>
    findMany(args: AnyRecord): Promise<AnyRecord[]>
  }
  wishlistItem: {
    create(args: AnyRecord): Promise<AnyRecord>
    update(args: AnyRecord): Promise<AnyRecord>
    delete(args: AnyRecord): Promise<AnyRecord>
  }
  releaseGenre: {
    deleteMany(args: AnyRecord): Promise<AnyRecord>
  }
  $transaction<T>(fn: (tx: TestPrismaLike) => Promise<T>): Promise<T>
}

function asTestPrisma(client: FakePrismaClient | PrismaClient): TestPrismaLike {
  return client as unknown as TestPrismaLike
}

/** Replaces Date values with a fixed sentinel so timestamp-only differences don't fail the comparison. */
function normalize(value: unknown): unknown {
  if (value instanceof Date) return '<date>'
  if (Array.isArray(value)) return value.map(normalize)
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = normalize(v)
    return out
  }
  return value
}

/**
 * The same script of operations run against both clients — this is the contract
 * under test. Deliberately leaves purchasePrice/currentValue/purchaseDate null: the
 * fake doesn't model Prisma's Decimal type (see fakePrismaClient.ts's doc comment),
 * so those fields are out of scope for this comparison.
 */
async function runScenario(prisma: TestPrismaLike) {
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

  const releaseWithRelations = await prisma.release.findUnique({
    where: { releaseId: release.releaseId },
    include: {
      artists: { include: { artist: true }, orderBy: { artistOrder: 'asc' } },
      genres: { include: { genre: true }, orderBy: { genreOrder: 'asc' } },
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

  const pressingWithRelations = await prisma.pressing.findUnique({
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

  const updatedPressing = await prisma.pressing.update({
    where: { pressingId: pressing.pressingId },
    data: { country: 'UK' },
  })

  const filteredByArtist = await prisma.pressing.findMany({
    where: { release: { artists: { some: { artistId: artist.artistId } } } },
  })

  await prisma.pressing.delete({ where: { pressingId: pressing.pressingId } })
  const afterDelete = await prisma.pressing.findMany({})

  const wishlistItem = await prisma.wishlistItem.create({
    data: {
      releaseId: release.releaseId,
      formatId: format.formatId,
      pressingYear: null,
      country: null,
      label: null,
      catalogNumber: null,
      vinylColor: null,
      discCount: 1,
      notes: 'Looking for a clean copy',
    },
  })

  const updatedWishlistItem = await prisma.wishlistItem.update({
    where: { wishlistItemId: wishlistItem.wishlistItemId },
    data: { notes: 'Found one' },
  })

  await prisma.wishlistItem.delete({ where: { wishlistItemId: wishlistItem.wishlistItemId } })

  // Mirrors updateRelease.ts's transaction: update the release, replace its genres.
  await prisma.$transaction(async (tx) => {
    await tx.release.update({ where: { releaseId: release.releaseId }, data: { notes: 'Classic' } })
    await tx.releaseGenre.deleteMany({ where: { releaseId: release.releaseId } })
  })
  const releaseAfterTransaction = await prisma.release.findUnique({
    where: { releaseId: release.releaseId },
    include: { genres: { include: { genre: true }, orderBy: { genreOrder: 'asc' } } },
  })

  return {
    genre,
    format,
    artist,
    release,
    releaseWithRelations,
    pressing,
    pressingWithRelations,
    updatedPressing,
    filteredByArtistCount: filteredByArtist.length,
    afterDeleteCount: afterDelete.length,
    wishlistItem,
    updatedWishlistItem,
    releaseAfterTransaction,
  }
}

describe('fakePrismaClient vs. the real generated Prisma Client (contract)', () => {
  let scratch: ScratchTenantDatabase

  beforeAll(async () => {
    scratch = await withScratchTenantDatabase()
  }, 30000)

  afterAll(async () => {
    await scratch.teardown()
  })

  it('produces the same results as the real client for the same script of operations', async () => {
    const fakeResult = await runScenario(asTestPrisma(createFakePrismaClient()))
    const realResult = await runScenario(asTestPrisma(scratch.prisma))

    expect(normalize(fakeResult)).toEqual(normalize(realResult))
  })
})
