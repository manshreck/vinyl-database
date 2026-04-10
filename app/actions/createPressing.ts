'use server'

import { prisma } from '@/lib/prisma'
import { ConditionGrade } from '@prisma/client'
import { redirect } from 'next/navigation'

export async function createPressing(formData: FormData) {
  const existingReleaseId = formData.get('releaseId')
    ? Number(formData.get('releaseId'))
    : null

  let releaseId = existingReleaseId

  // Create a new release if no existing one was selected
  if (!releaseId) {
    const title = (formData.get('newReleaseTitle') as string).trim()
    const originalReleaseYear = Number(formData.get('newReleaseYear'))
    const artistName = (formData.get('newArtistName') as string).trim()
    const existingArtistId = formData.get('newArtistId')
      ? Number(formData.get('newArtistId'))
      : null
    const genreIds = formData.getAll('genreIds').map(Number).filter(Boolean)

    // Find or create the artist
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

    releaseId = release.releaseId
  }

  // Parse pressing fields
  const vinylColorRaw = formData.get('vinylColor') as string
  const sleeveConditionRaw = formData.get('sleeveCondition') as string
  const pressingYearRaw = formData.get('pressingYear') as string
  const purchasePriceRaw = formData.get('purchasePrice') as string
  const purchaseDateRaw = formData.get('purchaseDate') as string
  const currentValueRaw = formData.get('currentValue') as string

  await prisma.pressing.create({
    data: {
      releaseId: releaseId!,
      formatId: Number(formData.get('formatId')),
      recordCondition: formData.get('recordCondition') as ConditionGrade,
      sleeveCondition: sleeveConditionRaw ? (sleeveConditionRaw as ConditionGrade) : null,
      pressingYear: pressingYearRaw ? Number(pressingYearRaw) : null,
      country: (formData.get('country') as string).trim() || null,
      label: (formData.get('label') as string).trim() || null,
      catalogNumber: (formData.get('catalogNumber') as string).trim() || null,
      vinylColor: vinylColorRaw.trim() || null,
      discCount: Number(formData.get('discCount')) || 1,
      notes: (formData.get('notes') as string).trim() || null,
      purchasePrice: purchasePriceRaw ? Number(purchasePriceRaw) : null,
      purchaseDate: purchaseDateRaw ? new Date(purchaseDateRaw) : null,
      currentValue: currentValueRaw ? Number(currentValueRaw) : null,
    },
  })

  redirect('/pressings')
}
