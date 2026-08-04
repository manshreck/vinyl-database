'use server'

import { getTenantPrisma } from '@/lib/prisma'
import { requireSession } from '@/lib/session'
import { findReleaseHoldings, resolveReleaseId, type ReleaseHoldings } from '@/lib/releaseIntake'
import { ConditionGrade } from '@prisma/client'
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

  const holdings = await findReleaseHoldings(prisma, formData)

  // Two things are worth saying before saving: you may have forgotten you already own a
  // pressing, and you may not realise this purchase settles a hunt you have open.
  const collides =
    holdings && (holdings.pressings.length > 0 || holdings.wishlistItems.length > 0)
  if (collides && formData.get('confirmDuplicate') !== 'true') {
    return { duplicate: holdings }
  }

  const releaseId = await resolveReleaseId(prisma, formData, holdings?.releaseId ?? null)

  // Buying the pressing you were hunting ends that hunt, so an exact match always goes.
  // Entries for other pressings of the release are separate hunts and stay put unless
  // the user explicitly chose to clear them too. Ids come from our own query rather than
  // the form, so a stale or doctored client can't widen the delete.
  const alsoClearDifferentPressings = formData.get('removeFromWishlist') === 'true'
  const wishlistIdsToClear =
    holdings?.wishlistItems
      .filter((w) => w.identical || alsoClearDifferentPressings)
      .map((w) => w.wishlistItemId) ?? []

  // Parse pressing fields
  const vinylColorRaw = formData.get('vinylColor') as string
  const sleeveConditionRaw = formData.get('sleeveCondition') as string
  const pressingYearRaw = formData.get('pressingYear') as string
  const purchasePriceRaw = formData.get('purchasePrice') as string
  const purchaseDateRaw = formData.get('purchaseDate') as string
  const currentValueRaw = formData.get('currentValue') as string

  // One transaction, matching addWishlistItemToCollection: the record never lands in the
  // collection while its wishlist entry survives, and never disappears from the wishlist
  // without landing.
  await prisma.$transaction(async (tx) => {
    await tx.pressing.create({
      data: {
        releaseId,
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

    if (wishlistIdsToClear.length > 0) {
      await tx.wishlistItem.deleteMany({
        where: { wishlistItemId: { in: wishlistIdsToClear } },
      })
    }
  })

  redirect('/pressings')
}
