import type { PrismaClient } from '@prisma/client'
import {
  findReleaseHoldings,
  resolveReleaseId,
  type PressingSpecInput,
  type ReleaseHoldings,
  type ReleaseSelection,
} from '@/lib/releaseIntake'

/** Wishlist entries carry no condition grades or purchase data — that is the difference. */
export type WishlistDetailsInput = PressingSpecInput & {
  notes: string | null
}

export type CreateWishlistItemInput = {
  selection: ReleaseSelection
  details: WishlistDetailsInput
  confirmDuplicate: boolean
}

export type CreateWishlistItemResult =
  | { status: 'created'; wishlistItemId: number }
  | { status: 'duplicate'; holdings: ReleaseHoldings }

export async function createWishlistItem(
  prisma: PrismaClient,
  input: CreateWishlistItemInput
): Promise<CreateWishlistItemResult> {
  const { selection, details, confirmDuplicate } = input

  const holdings = await findReleaseHoldings(prisma, selection, details)

  // Worth a word in all three cases: already owned, already wanted in another pressing,
  // or — the one that's almost never intentional — already wanted in this exact pressing.
  const collides =
    holdings && (holdings.pressings.length > 0 || holdings.wishlistItems.length > 0)
  if (collides && !confirmDuplicate) {
    return { status: 'duplicate', holdings }
  }

  const releaseId = await resolveReleaseId(prisma, selection, holdings?.releaseId ?? null)

  const item = await prisma.wishlistItem.create({
    data: {
      releaseId,
      formatId: details.formatId,
      pressingYear: details.pressingYear,
      country: details.country,
      label: details.label,
      catalogNumber: details.catalogNumber,
      vinylColor: details.vinylColor,
      discCount: details.discCount,
      notes: details.notes,
    },
  })

  return { status: 'created', wishlistItemId: item.wishlistItemId }
}

export type UpdateWishlistItemInput = {
  details: WishlistDetailsInput
  coverImageUrl: string | null
}

export async function updateWishlistItem(
  prisma: PrismaClient,
  wishlistItemId: number,
  input: UpdateWishlistItemInput
): Promise<void> {
  const { details, coverImageUrl } = input

  const item = await prisma.wishlistItem.update({
    where: { wishlistItemId },
    data: {
      formatId: details.formatId,
      pressingYear: details.pressingYear,
      country: details.country,
      label: details.label,
      catalogNumber: details.catalogNumber,
      vinylColor: details.vinylColor,
      discCount: details.discCount,
      notes: details.notes,
    },
  })

  if (coverImageUrl) {
    await prisma.release.update({
      where: { releaseId: item.releaseId },
      data: { coverImageUrl },
    })
  }
}

export async function deleteWishlistItem(
  prisma: PrismaClient,
  wishlistItemId: number
): Promise<void> {
  await prisma.wishlistItem.delete({ where: { wishlistItemId } })
}

/** Condition and cost, which a wishlist entry never had, supplied on acquisition. */
export type AcquisitionInput = {
  recordCondition: string
  sleeveCondition: string | null
  purchasePrice: number | null
  purchaseDate: Date | null
  currentValue: number | null
}

export type AddToCollectionResult =
  | { status: 'added'; pressingId: number }
  | { status: 'not_found' }

/**
 * Turns a wishlist entry into a pressing: the record was found and bought.
 *
 * `not_found` is returned rather than thrown so the caller decides what a missing id
 * means — a 404 page on the web, a 404 status over HTTP.
 */
export async function addWishlistItemToCollection(
  prisma: PrismaClient,
  wishlistItemId: number,
  acquisition: AcquisitionInput
): Promise<AddToCollectionResult> {
  const wishlistItem = await prisma.wishlistItem.findUnique({ where: { wishlistItemId } })
  if (!wishlistItem) return { status: 'not_found' }

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
        recordCondition: acquisition.recordCondition as never,
        sleeveCondition: (acquisition.sleeveCondition ?? null) as never,
        notes: wishlistItem.notes,
        purchasePrice: acquisition.purchasePrice,
        purchaseDate: acquisition.purchaseDate,
        currentValue: acquisition.currentValue,
      },
    })
    await tx.wishlistItem.delete({ where: { wishlistItemId } })
    return created
  })

  return { status: 'added', pressingId: pressing.pressingId }
}
