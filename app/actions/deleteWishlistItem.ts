'use server'

import { getTenantPrisma } from '@/lib/prisma'
import { requireSession } from '@/lib/session'
import { redirect } from 'next/navigation'

export async function deleteWishlistItem(id: number) {
  const session = await requireSession()
  const prisma = await getTenantPrisma(session.databaseName)

  await prisma.wishlistItem.delete({ where: { wishlistItemId: id } })
  redirect('/wishlist')
}
