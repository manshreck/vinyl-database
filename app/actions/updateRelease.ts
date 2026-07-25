'use server'

import { getTenantPrisma } from '@/lib/prisma'
import { requireSession } from '@/lib/session'
import { redirect } from 'next/navigation'
import type { PrismaClient } from '@prisma/client'

export type FormState = { error: string } | null

type Rename = { artistId: number; name: string }

/**
 * Artist.name is unique in the schema. Renaming an artist to a name that collides
 * with a *different* existing artist — either one already in the database, or
 * another artist in this same submission — would otherwise crash with an unhandled
 * constraint violation. Unlike creating a release (where a name match means "reuse
 * that artist"), silently merging two already-distinct artist identities on a rename
 * is not a safe default: it's ambiguous whether the user means to merge two records
 * or made a typo, and EditReleaseForm has no way to signal a merge was intended. So
 * this rejects with a clear error instead, leaving nothing saved.
 */
async function findArtistNameConflict(prisma: PrismaClient, renames: Rename[]): Promise<string | null> {
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
  releaseId: number,
  returnTo: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const session = await requireSession()
  const prisma = await getTenantPrisma(session.databaseName)

  const title = (formData.get('title') as string).trim()
  const originalReleaseYear = Number(formData.get('originalReleaseYear'))
  const notes = (formData.get('notes') as string).trim() || null
  const coverImageUrl = (formData.get('coverImageUrl') as string).trim() || null
  const genreIds = formData.getAll('genreIds').map(Number).filter(Boolean)

  // Collect artist edits: name[artistId] and sortName[artistId]
  const artistIds = formData.getAll('artistIds').map(Number)
  const renames: Rename[] = artistIds
    .map((artistId) => ({ artistId, name: (formData.get(`name[${artistId}]`) as string).trim() }))
    .filter((r): r is Rename => !!r.name)

  const conflictName = await findArtistNameConflict(prisma, renames)
  if (conflictName) {
    return { error: `An artist named "${conflictName}" already exists. Choose a different name, or edit that artist directly.` }
  }

  await prisma.$transaction(async (tx) => {
    // Update the release itself
    await tx.release.update({
      where: { releaseId },
      data: { title, originalReleaseYear, notes, coverImageUrl },
    })

    // Update each associated artist's name and sortName
    for (const { artistId, name } of renames) {
      const sortName = (formData.get(`sortName[${artistId}]`) as string).trim()
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

  redirect(returnTo)
}
