import type { PrismaClient } from '@prisma/client'

/**
 * Resolves the releaseId for a create form: reuses an existing release if the
 * form selected one, otherwise creates a new release (and artist, if needed)
 * from the "new release" fields. Shared by createPressing and createWishlistItem.
 *
 * Contract for artist resolution when no releaseId/newArtistId is supplied: never
 * attempts to create an artist whose name already exists — Artist.name is unique in
 * the schema, so a blind create would violate that constraint whenever the typed
 * name matches an existing artist exactly (e.g. the user typed a name instead of
 * picking it from the autocomplete dropdown). Reuses the existing artist by exact
 * name match in that case instead of creating a duplicate.
 */
export async function resolveReleaseId(prisma: PrismaClient, formData: FormData): Promise<number> {
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
