import type { PrismaClient } from '@prisma/client'

type Rename = { artistId: number; name: string; sortName: string }

export type UpdateReleaseInput = {
  title: string
  originalReleaseYear: number
  notes: string | null
  coverImageUrl: string | null
  genreIds: number[]
  /** Artist renames applied alongside the release edit. */
  renames: Rename[]
}

export type UpdateReleaseResult =
  | { status: 'updated' }
  | { status: 'artist_name_conflict'; name: string }

/**
 * Artist.name is unique in the schema. Renaming an artist to a name that collides
 * with a *different* existing artist — either one already in the database, or
 * another artist in this same submission — would otherwise crash with an unhandled
 * constraint violation. Unlike creating a release (where a name match means "reuse
 * that artist"), silently merging two already-distinct artist identities on a rename
 * is not a safe default: it's ambiguous whether the user means to merge two records
 * or made a typo, and the caller has no way to signal a merge was intended. So this
 * reports the conflict instead, leaving nothing saved.
 */
async function findArtistNameConflict(
  prisma: PrismaClient,
  renames: Rename[]
): Promise<string | null> {
  const seenNames = new Map<string, number>()
  for (const { artistId, name } of renames) {
    const otherArtistId = seenNames.get(name)
    if (otherArtistId !== undefined && otherArtistId !== artistId) return name
    seenNames.set(name, artistId)
  }

  for (const { artistId, name } of renames) {
    const conflict = await prisma.artist.findFirst({ where: { name, NOT: { artistId } } })
    if (conflict) return name
  }

  return null
}

export async function updateRelease(
  prisma: PrismaClient,
  releaseId: number,
  input: UpdateReleaseInput
): Promise<UpdateReleaseResult> {
  const { title, originalReleaseYear, notes, coverImageUrl, genreIds, renames } = input

  const conflictName = await findArtistNameConflict(prisma, renames)
  if (conflictName) return { status: 'artist_name_conflict', name: conflictName }

  await prisma.$transaction(async (tx) => {
    await tx.release.update({
      where: { releaseId },
      data: { title, originalReleaseYear, notes, coverImageUrl },
    })

    for (const { artistId, name, sortName } of renames) {
      await tx.artist.update({
        where: { artistId },
        data: { name, sortName: sortName || name },
      })
    }

    // Replace genre associations
    await tx.releaseGenre.deleteMany({ where: { releaseId } })
    if (genreIds.length > 0) {
      await tx.releaseGenre.createMany({
        data: genreIds.map((genreId, i) => ({ releaseId, genreId, genreOrder: i + 1 })),
      })
    }
  })

  return { status: 'updated' }
}
