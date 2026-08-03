import { Prisma, type PrismaClient } from '@prisma/client'

/** A pressing already in the collection, flattened into a serializable shape for the client. */
export type ExistingPressingSummary = {
  pressingId: number
  formatName: string
  pressingYear: number | null
  country: string | null
  label: string | null
  catalogNumber: string | null
  vinylColor: string | null
  discCount: number
  recordCondition: string
  sleeveCondition: string | null
  purchaseDate: string | null
}

/** A wishlist entry for a release, flattened for the client. */
export type ExistingWishlistSummary = {
  wishlistItemId: number
  formatName: string
  pressingYear: number | null
  country: string | null
  label: string | null
  catalogNumber: string | null
  vinylColor: string | null
  discCount: number
  /** True when every pressing detail matches the one being submitted. */
  identical: boolean
}

/**
 * Everything the database already holds for a release: what you own and what you're
 * hunting. Both create forms warn against the same picture, they just read it
 * differently — the collection form treats an `identical` wishlist entry as a hunt
 * this purchase ends, while the wishlist form treats one as a hunt listed twice.
 */
export type ReleaseHoldings = {
  releaseId: number
  title: string
  originalReleaseYear: number
  coverImageUrl: string | null
  artistNames: string[]
  pressings: ExistingPressingSummary[]
  wishlistItems: ExistingWishlistSummary[]
}

/**
 * Narrows to the release a "new release" form would duplicate: same title and same
 * artist, both matched case-insensitively. Returns null when the form doesn't carry
 * enough to match on — matching on title alone would collide across artists
 * (countless albums are called "Greatest Hits").
 */
function buildNewReleaseWhere(formData: FormData): Prisma.ReleaseWhereInput | null {
  const title = ((formData.get('newReleaseTitle') as string) ?? '').trim()
  if (!title) return null

  const artistId = formData.get('newArtistId') ? Number(formData.get('newArtistId')) : null
  const artistName = ((formData.get('newArtistName') as string) ?? '').trim()

  const artistMatch: Prisma.ReleaseArtistWhereInput | null = artistId
    ? { artistId }
    : artistName
      ? { artist: { name: { equals: artistName, mode: Prisma.QueryMode.insensitive } } }
      : null
  if (!artistMatch) return null

  return {
    title: { equals: title, mode: Prisma.QueryMode.insensitive },
    artists: { some: artistMatch },
  }
}

/** The pressing details that decide whether two entries describe the same physical record. */
type PressingSpec = {
  formatId: number
  pressingYear: number | null
  country: string
  label: string
  catalogNumber: string
  vinylColor: string
  discCount: number
}

/** Free text is compared case- and whitespace-insensitively; blank and null are the same thing. */
function normalizeText(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

function pressingSpecFromForm(formData: FormData): PressingSpec {
  const pressingYearRaw = (formData.get('pressingYear') as string) ?? ''
  return {
    formatId: Number(formData.get('formatId')),
    pressingYear: pressingYearRaw.trim() ? Number(pressingYearRaw) : null,
    country: normalizeText(formData.get('country') as string),
    label: normalizeText(formData.get('label') as string),
    catalogNumber: normalizeText(formData.get('catalogNumber') as string),
    vinylColor: normalizeText(formData.get('vinylColor') as string),
    discCount: Number(formData.get('discCount')) || 1,
  }
}

/**
 * Whether a stored entry describes the same pressing as the one being submitted.
 * Notes are excluded deliberately — they're the user's own commentary ("check the
 * matrix", "under $40"), not part of what identifies the record.
 */
function sameSpec(
  item: {
    formatId: number
    pressingYear: number | null
    country: string | null
    label: string | null
    catalogNumber: string | null
    vinylColor: string | null
    discCount: number
  },
  spec: PressingSpec
): boolean {
  return (
    item.formatId === spec.formatId &&
    item.pressingYear === spec.pressingYear &&
    normalizeText(item.country) === spec.country &&
    normalizeText(item.label) === spec.label &&
    normalizeText(item.catalogNumber) === spec.catalogNumber &&
    normalizeText(item.vinylColor) === spec.vinylColor &&
    item.discCount === spec.discCount
  )
}

/**
 * Finds the release a create form refers to, along with everything already held
 * against it — pressings owned, wishlist entries open, each wishlist entry flagged
 * for whether it's an exact pressing match.
 *
 * Two paths reach the same release: the user picked it out of the search (a
 * `releaseId` in the form), or they arrived from Discogs and the form carries only
 * title/artist text. The second path is the one that silently forked duplicate Release
 * rows before — Discogs never supplies our internal id, so every add looked new.
 *
 * Returns null when the release is genuinely new, which is the signal to create one.
 */
export async function findReleaseHoldings(
  prisma: PrismaClient,
  formData: FormData
): Promise<ReleaseHoldings | null> {
  const explicitReleaseId = formData.get('releaseId') ? Number(formData.get('releaseId')) : null
  const where = explicitReleaseId ? { releaseId: explicitReleaseId } : buildNewReleaseWhere(formData)
  if (!where) return null

  const release = await prisma.release.findFirst({
    where,
    include: {
      artists: { include: { artist: true }, orderBy: { artistOrder: 'asc' } },
      pressings: { include: { format: true }, orderBy: { pressingId: 'asc' } },
      wishlistItems: { include: { format: true }, orderBy: { wishlistItemId: 'asc' } },
    },
  })
  if (!release) return null

  const spec = pressingSpecFromForm(formData)

  return {
    releaseId: release.releaseId,
    title: release.title,
    originalReleaseYear: release.originalReleaseYear,
    coverImageUrl: release.coverImageUrl,
    artistNames: release.artists.map((a) => a.artist.name),
    // Decimal and Date don't survive the server-action boundary — flatten to primitives.
    pressings: release.pressings.map((p) => ({
      pressingId: p.pressingId,
      formatName: p.format.name,
      pressingYear: p.pressingYear,
      country: p.country,
      label: p.label,
      catalogNumber: p.catalogNumber,
      vinylColor: p.vinylColor,
      discCount: p.discCount,
      recordCondition: p.recordCondition,
      sleeveCondition: p.sleeveCondition,
      purchaseDate: p.purchaseDate ? p.purchaseDate.toISOString().slice(0, 10) : null,
    })),
    wishlistItems: release.wishlistItems.map((w) => ({
      wishlistItemId: w.wishlistItemId,
      formatName: w.format.name,
      pressingYear: w.pressingYear,
      country: w.country,
      label: w.label,
      catalogNumber: w.catalogNumber,
      vinylColor: w.vinylColor,
      discCount: w.discCount,
      identical: sameSpec(w, spec),
    })),
  }
}

/**
 * Resolves the releaseId for a create form: reuses an existing release if the
 * form selected one, otherwise creates a new release (and artist, if needed)
 * from the "new release" fields. Shared by createPressing and createWishlistItem.
 *
 * Pass `matchedReleaseId` (from `findReleaseHoldings`) to attach to a release the
 * caller already matched by title/artist, so a second pressing of an album hangs off
 * the Release row we have rather than forking a duplicate one.
 *
 * Contract for artist resolution when no releaseId/newArtistId is supplied: never
 * attempts to create an artist whose name already exists — Artist.name is unique in
 * the schema, so a blind create would violate that constraint whenever the typed
 * name matches an existing artist exactly (e.g. the user typed a name instead of
 * picking it from the autocomplete dropdown). Reuses the existing artist by exact
 * name match in that case instead of creating a duplicate.
 */
export async function resolveReleaseId(
  prisma: PrismaClient,
  formData: FormData,
  matchedReleaseId: number | null = null
): Promise<number> {
  if (matchedReleaseId) return matchedReleaseId

  const existingReleaseId = formData.get('releaseId') ? Number(formData.get('releaseId')) : null
  if (existingReleaseId) return existingReleaseId

  const title = ((formData.get('newReleaseTitle') as string) ?? '').trim()
  const originalReleaseYear = Number(formData.get('newReleaseYear'))
  const artistName = ((formData.get('newArtistName') as string) ?? '').trim()
  const existingArtistId = formData.get('newArtistId') ? Number(formData.get('newArtistId')) : null
  const genreIds = formData.getAll('genreIds').map(Number).filter(Boolean)
  const coverImageUrl = (formData.get('newReleaseCoverImageUrl') as string | null)?.trim() || null

  let artistId = existingArtistId
  if (!artistId) {
    const existingArtist = await prisma.artist.findFirst({ where: { name: artistName } })
    if (existingArtist) {
      artistId = existingArtist.artistId
    } else {
      const created = await prisma.artist.create({
        data: { name: artistName, sortName: artistName },
      })
      artistId = created.artistId
    }
  }

  const release = await prisma.release.create({
    data: {
      title,
      originalReleaseYear,
      coverImageUrl,
      artists: {
        create: [{ artistId, artistOrder: 1 }],
      },
      ...(genreIds.length > 0 && {
        genres: {
          create: genreIds.map((genreId, i) => ({ genreId, genreOrder: i + 1 })),
        },
      }),
    },
  })

  return release.releaseId
}
