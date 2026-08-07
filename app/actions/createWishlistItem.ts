'use server'

import { getTenantPrisma } from '@/lib/prisma'
import { requireSession } from '@/lib/session'
import * as wishlist from '@/lib/services/wishlist'
import type { ReleaseHoldings } from '@/lib/releaseIntake'
import {
  isConfirmed,
  parseReleaseSelection,
  parseWishlistDetails,
} from '@/app/actions/formInput'
import { redirect } from 'next/navigation'

/**
 * Returned instead of redirecting when the release is already owned or already on the
 * wishlist and the user hasn't confirmed yet. On success the action redirects.
 */
export type CreateWishlistItemResult = { duplicate: ReleaseHoldings }

export async function createWishlistItem(
  formData: FormData
): Promise<CreateWishlistItemResult | undefined> {
  const session = await requireSession()
  const prisma = await getTenantPrisma(session.databaseName)

  const result = await wishlist.createWishlistItem(prisma, {
    selection: parseReleaseSelection(formData),
    details: parseWishlistDetails(formData),
    confirmDuplicate: isConfirmed(formData, 'confirmDuplicate'),
  })

  if (result.status === 'duplicate') return { duplicate: result.holdings }

  redirect('/wishlist')
}
