import type { PrismaClient } from '@prisma/client'
import { artistSortKey } from '@/lib/artistSort'

/**
 * The collection as a client caches it (MOBILE_APP_PLAN D5).
 *
 * One request returns everything, because the use case is "do I already own this?"
 * in a shop with one bar of signal — a client that has to fetch a second time to
 * render a detail screen cannot answer that. So these are complete pressings, not a
 * list projection, and `GET /pressings/:id` is a deep-link convenience rather than a
 * necessity.
 *
 * This is also the shape D6 identifies as the real commitment: a stale build reads it
 * offline, and a client that cannot reach us cannot be told it changed.
 */

/** A pressing with everything both the list and the detail screen need. */
export type CollectionPressing = {
  pressingId: number
  title: string
  /** Names in credit order. An array, not a joined string — a caller that has to
   *  split on ", " cannot tell a two-artist record from one with a comma in its name. */
  artists: string[]
  genres: string[]
  originalReleaseYear: number
  coverImageUrl: string | null
  formatName: string
  pressingYear: number | null
  country: string | null
  label: string | null
  catalogNumber: string | null
  vinylColor: string | null
  discCount: number
  recordCondition: string
  sleeveCondition: string | null
  notes: string | null
  /** Decimal string, e.g. "12.99" — never a JSON number. Normalized: "0.10" is "0.1". */
  purchasePrice: string | null
  currentValue: string | null
  /** Date only, "YYYY-MM-DD". A datetime would drift a day across the phone's timezone. */
  purchaseDate: string | null
}

export type Collection = {
  /** Opaque token. Compare for equality only — never order or do arithmetic on it. */
  version: string
  generatedAt: string
  totals: { pressings: number; artists: number }
  /**
   * Ordered by filing name (leading articles ignored), then title. Sorting here rather
   * than leaving it to callers keeps `artistSortKey` in one place: a client that
   * reimplemented it would drift, and every client would have to.
   */
  pressings: CollectionPressing[]
}

/** Postgres `date` arrives as UTC midnight, so the ISO prefix is the stored day. */
function toDateOnly(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null
}

/**
 * The tenant's change counter, bumped by trigger on every mutation
 * (prisma/tenant-triggers.sql). Cheap enough to read before deciding whether the
 * caller's cached copy is still current.
 */
export async function getCollectionVersion(prisma: PrismaClient): Promise<string> {
  const row = await prisma.collectionVersion.findFirst()
  // A tenant provisioned before the counter existed reports version 0 until its first
  // mutation, which is honest: we cannot know what it missed, so nothing may be assumed
  // fresh.
  return row ? row.version.toString() : '0'
}

export async function getCollection(prisma: PrismaClient): Promise<Collection> {
  // One snapshot for the counter and the rows together. Read separately, a mutation
  // landing between them would produce a version that does not describe the payload —
  // and the dangerous direction is a version *newer* than the data, which a client
  // would cache and then believe was current.
  const { version, rows, artistCount } = await prisma.$transaction(
    async (tx) => ({
      version: await getCollectionVersion(tx as PrismaClient),
      rows: await tx.pressing.findMany({
        include: {
          format: true,
          release: {
            include: {
              artists: { include: { artist: true }, orderBy: { artistOrder: 'asc' } },
              genres: { include: { genre: true }, orderBy: { genreOrder: 'asc' } },
            },
          },
        },
      }),
      // Artists actually represented in the collection, matching what /pressings shows.
      artistCount: await tx.artist.count({
        where: { releases: { some: { release: { pressings: { some: {} } } } } },
      }),
    }),
    { isolationLevel: 'RepeatableRead' }
  )

  const pressings: CollectionPressing[] = rows.map((p) => ({
    pressingId: p.pressingId,
    title: p.release.title,
    artists: p.release.artists.map((ra) => ra.artist.name),
    genres: p.release.genres.map((rg) => rg.genre.name),
    originalReleaseYear: p.release.originalReleaseYear,
    coverImageUrl: p.release.coverImageUrl,
    formatName: p.format.name,
    pressingYear: p.pressingYear,
    country: p.country,
    label: p.label,
    catalogNumber: p.catalogNumber,
    vinylColor: p.vinylColor,
    discCount: p.discCount,
    recordCondition: p.recordCondition,
    sleeveCondition: p.sleeveCondition,
    notes: p.notes,
    purchasePrice: p.purchasePrice?.toString() ?? null,
    currentValue: p.currentValue?.toString() ?? null,
    purchaseDate: toDateOnly(p.purchaseDate),
  }))

  const sortKeyFor = new Map(
    rows.map((p) => [p.pressingId, artistSortKey(p.release.artists[0]?.artist.sortName ?? '')])
  )
  pressings.sort((a, b) => {
    const artistCmp = sortKeyFor.get(a.pressingId)!.localeCompare(sortKeyFor.get(b.pressingId)!)
    return artistCmp !== 0 ? artistCmp : a.title.localeCompare(b.title)
  })

  return {
    version,
    generatedAt: new Date().toISOString(),
    totals: { pressings: pressings.length, artists: artistCount },
    pressings,
  }
}
