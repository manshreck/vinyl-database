'use server'

import { getTenantPrisma } from '@/lib/prisma'
import { requireSession } from '@/lib/session'
import { findReleaseHoldings, resolveReleaseId, type ReleaseHoldings } from '@/lib/releaseIntake'
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

  const existing = await findReleaseHoldings(prisma, formData)

  // Worth a word in all three cases: already owned, already wanted in another pressing,
  // or — the one that's almost never intentional — already wanted in this exact pressing.
  const collides =
    existing && (existing.pressings.length > 0 || existing.wishlistItems.length > 0)
  if (collides && formData.get('confirmDuplicate') !== 'true') {
    return { duplicate: existing }
  }

  const releaseId = await resolveReleaseId(prisma, formData, existing?.releaseId ?? null)

  const vinylColorRaw = formData.get('vinylColor') as string
  const pressingYearRaw = formData.get('pressingYear') as string

  await prisma.wishlistItem.create({
    data: {
      releaseId,
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
