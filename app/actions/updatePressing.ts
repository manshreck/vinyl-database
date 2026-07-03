'use server'

import { getTenantPrisma } from '@/lib/prisma'
import { requireSession } from '@/lib/session'
import { ConditionGrade } from '@prisma/client'
import { redirect } from 'next/navigation'

export async function updatePressing(id: number, formData: FormData) {
  const session = await requireSession()
  const prisma = await getTenantPrisma(session.databaseName)

  const sleeveConditionRaw = formData.get('sleeveCondition') as string
  const pressingYearRaw = formData.get('pressingYear') as string
  const purchasePriceRaw = formData.get('purchasePrice') as string
  const purchaseDateRaw = formData.get('purchaseDate') as string
  const currentValueRaw = formData.get('currentValue') as string
  const vinylColorRaw = formData.get('vinylColor') as string

  await prisma.pressing.update({
    where: { pressingId: id },
    data: {
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
