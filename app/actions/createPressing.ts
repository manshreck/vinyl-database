'use server'

import { getTenantPrisma } from '@/lib/prisma'
import { requireSession } from '@/lib/session'
import * as pressings from '@/lib/services/pressings'
import type { ReleaseHoldings } from '@/lib/releaseIntake'
import {
  isConfirmed,
  parsePressingDetails,
  parseReleaseSelection,
} from '@/app/actions/formInput'
import { redirect } from 'next/navigation'

/**
 * Returned instead of redirecting when the release is already owned or already on the
 * wishlist and the user hasn't confirmed yet. On success the action redirects.
 */
export type CreatePressingResult = { duplicate: ReleaseHoldings }

export async function createPressing(
  formData: FormData
): Promise<CreatePressingResult | undefined> {
  const session = await requireSession()
  const prisma = await getTenantPrisma(session.databaseName)

  const result = await pressings.createPressing(prisma, {
    selection: parseReleaseSelection(formData),
    details: parsePressingDetails(formData),
    confirmDuplicate: isConfirmed(formData, 'confirmDuplicate'),
    removeFromWishlist: isConfirmed(formData, 'removeFromWishlist'),
  })

  if (result.status === 'duplicate') return { duplicate: result.holdings }

  redirect('/pressings')
}
