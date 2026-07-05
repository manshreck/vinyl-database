'use server'

import { getTenantPrisma } from '@/lib/prisma'
import { requireSession } from '@/lib/session'
import { redirect } from 'next/navigation'

export async function updateRelease(
  releaseId: number,
  returnTo: string,
  formData: FormData
) {
  const session = await requireSession()
  const prisma = await getTenantPrisma(session.databaseName)

  const title = (formData.get('title') as string).trim()
  const originalReleaseYear = Number(formData.get('originalReleaseYear'))
  const notes = (formData.get('notes') as string).trim() || null
  const coverImageUrl = (formData.get('coverImageUrl') as string).trim() || null
  const genreIds = formData.getAll('genreIds').map(Number).filter(Boolean)

  // Collect artist edits: name[artistId] and sortName[artistId]
  const artistIds = formData.getAll('artistIds').map(Number)

  await prisma.$transaction(async (tx) => {
    // Update the release itself
    await tx.release.update({
      where: { releaseId },
      data: { title, originalReleaseYear, notes, coverImageUrl },
    })

    // Update each associated artist's name and sortName
    for (const artistId of artistIds) {
      const name = (formData.get(`name[${artistId}]`) as string).trim()
      const sortName = (formData.get(`sortName[${artistId}]`) as string).trim()
      if (name) {
        await tx.artist.update({
          where: { artistId },
          data: { name, sortName: sortName || name },
        })
      }
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
