'use server'

import { getTenantPrisma } from '@/lib/prisma'
import { requireSession } from '@/lib/session'
import { redirect } from 'next/navigation'

export async function updateWishlistItem(id: number, formData: FormData) {
  const session = await requireSession()
  const prisma = await getTenantPrisma(session.databaseName)

  const pressingYearRaw = formData.get('pressingYear') as string
  const vinylColorRaw = formData.get('vinylColor') as string

  await prisma.wishlistItem.update({
    where: { wishlistItemId: id },
    data: {
      formatId: Number(formData.get('formatId')),
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
