'use server'

import { getTenantPrisma } from '@/lib/prisma'
import { requireSession } from '@/lib/session'
import * as wishlist from '@/lib/services/wishlist'
import { parseCoverImageUrl, parseWishlistDetails } from '@/app/actions/formInput'
import { redirect } from 'next/navigation'

export async function updateWishlistItem(id: number, formData: FormData) {
  const session = await requireSession()
  const prisma = await getTenantPrisma(session.databaseName)

  await wishlist.updateWishlistItem(prisma, id, {
    details: parseWishlistDetails(formData),
    coverImageUrl: parseCoverImageUrl(formData),
  })

  redirect('/wishlist')
}
