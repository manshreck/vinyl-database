import type { PrismaClient } from '@prisma/client'

/**
 * Resolves the releaseId for a create form: reuses an existing release if the
 * form selected one, otherwise creates a new release (and artist, if needed)
 * from the "new release" fields. Shared by createPressing and createWishlistItem.
 */
export async function resolveReleaseId(prisma: PrismaClient, formData: FormData): Promise<number> {
  const existingReleaseId = formData.get('releaseId') ? Number(formData.get('releaseId')) : null
  if (existingReleaseId) return existingReleaseId

  const title = (formData.get('newReleaseTitle') as string).trim()
  const originalReleaseYear = Number(formData.get('newReleaseYear'))
  const artistName = (formData.get('newArtistName') as string).trim()
  const existingArtistId = formData.get('newArtistId') ? Number(formData.get('newArtistId')) : null
  const genreIds = formData.getAll('genreIds').map(Number).filter(Boolean)
  const coverImageUrl = (formData.get('newReleaseCoverImageUrl') as string | null)?.trim() || null

  let artistId = existingArtistId
  if (!artistId) {
    const created = await prisma.artist.create({
      data: { name: artistName, sortName: artistName },
    })
    artistId = created.artistId
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
