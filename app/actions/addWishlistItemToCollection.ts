'use server'

import { getTenantPrisma } from '@/lib/prisma'
import { requireSession } from '@/lib/session'
import { notFound, redirect } from 'next/navigation'

export async function addWishlistItemToCollection(id: number, formData: FormData) {
  const session = await requireSession()
  const prisma = await getTenantPrisma(session.databaseName)

  const wishlistItem = await prisma.wishlistItem.findUnique({ where: { wishlistItemId: id } })
  if (!wishlistItem) notFound()

  const purchasePriceRaw = formData.get('purchasePrice') as string
  const purchaseDateRaw = formData.get('purchaseDate') as string
  const currentValueRaw = formData.get('currentValue') as string

  const pressing = await prisma.$transaction(async (tx) => {
    const created = await tx.pressing.create({
      data: {
        releaseId: wishlistItem.releaseId,
        formatId: wishlistItem.formatId,
        pressingYear: wishlistItem.pressingYear,
        country: wishlistItem.country,
        label: wishlistItem.label,
        catalogNumber: wishlistItem.catalogNumber,
        vinylColor: wishlistItem.vinylColor,
        discCount: wishlistItem.discCount,
        recordCondition: wishlistItem.recordCondition,
        sleeveCondition: wishlistItem.sleeveCondition,
        notes: wishlistItem.notes,
        purchasePrice: purchasePriceRaw ? Number(purchasePriceRaw) : null,
        purchaseDate: purchaseDateRaw ? new Date(purchaseDateRaw) : null,
        currentValue: currentValueRaw ? Number(currentValueRaw) : null,
      },
    })
    await tx.wishlistItem.delete({ where: { wishlistItemId: id } })
    return created
  })

  redirect(`/pressings/${pressing.pressingId}`)
}
