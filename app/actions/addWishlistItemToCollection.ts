'use server'

import { getTenantPrisma } from '@/lib/prisma'
import { requireSession } from '@/lib/session'
import * as wishlist from '@/lib/services/wishlist'
import { parseAcquisition } from '@/app/actions/formInput'
import { notFound, redirect } from 'next/navigation'

export async function addWishlistItemToCollection(id: number, formData: FormData) {
  const session = await requireSession()
  const prisma = await getTenantPrisma(session.databaseName)

  const result = await wishlist.addWishlistItemToCollection(prisma, id, parseAcquisition(formData))
  if (result.status === 'not_found') notFound()

  redirect(`/pressings/${result.pressingId}`)
}
