'use server'

import { getTenantPrisma } from '@/lib/prisma'
import { requireSession } from '@/lib/session'
import { resolveReleaseId } from '@/lib/releaseIntake'
import { ConditionGrade } from '@prisma/client'
import { redirect } from 'next/navigation'

export async function createWishlistItem(formData: FormData) {
  const session = await requireSession()
  const prisma = await getTenantPrisma(session.databaseName)

  const releaseId = await resolveReleaseId(prisma, formData)

  const vinylColorRaw = formData.get('vinylColor') as string
  const sleeveConditionRaw = formData.get('sleeveCondition') as string
  const pressingYearRaw = formData.get('pressingYear') as string

  await prisma.wishlistItem.create({
    data: {
      releaseId,
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
    },
  })

  redirect('/wishlist')
}
