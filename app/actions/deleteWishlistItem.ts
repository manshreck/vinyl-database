'use server'

import { getTenantPrisma } from '@/lib/prisma'
import { requireSession } from '@/lib/session'
import * as wishlist from '@/lib/services/wishlist'
import { redirect } from 'next/navigation'

export async function deleteWishlistItem(id: number) {
  const session = await requireSession()
  const prisma = await getTenantPrisma(session.databaseName)

  await wishlist.deleteWishlistItem(prisma, id)
  redirect('/wishlist')
}
