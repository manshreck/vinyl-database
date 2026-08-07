import type { PrismaClient } from '@prisma/client'
import {
  findReleaseHoldings,
  resolveReleaseId,
  type PressingSpecInput,
  type ReleaseHoldings,
  type ReleaseSelection,
} from '@/lib/releaseIntake'

/**
 * Collection operations, independent of how they were requested.
 *
 * Services take an already-authorized `PrismaClient` and typed input, and return a
 * result. They deliberately do not touch `FormData`, cookies, `redirect()` or
 * `notFound()` — those belong to whichever transport called in, and baking them in is
 * what made this logic unreachable from anything but a browser form.
 *
 * Authorization stays with the caller, matching getTenantPrisma's existing contract:
 * resolving *which* tenant a request may touch is a transport concern, and by the time
 * a service has a client that question is settled.
 */

/** Everything about a pressing that a caller supplies, whatever form it arrived in. */
export type PressingDetailsInput = PressingSpecInput & {
  recordCondition: string
  sleeveCondition: string | null
  notes: string | null
  purchasePrice: number | null
  purchaseDate: Date | null
  currentValue: number | null
}

export type CreatePressingInput = {
  selection: ReleaseSelection
  details: PressingDetailsInput
  /** The user has seen the collision and chosen to proceed. */
  confirmDuplicate: boolean
  /** Also clear wishlist entries describing a *different* pressing of this release. */
  removeFromWishlist: boolean
}

export type CreatePressingResult =
  | { status: 'created'; pressingId: number }
  | { status: 'duplicate'; holdings: ReleaseHoldings }

/**
 * Adds a pressing, unless it collides with something the user should see first.
 *
 * The `duplicate` result is not an error: it is the collision reported back so the
 * caller can ask. A second call carrying `confirmDuplicate` proceeds.
 */
export async function createPressing(
  prisma: PrismaClient,
  input: CreatePressingInput
): Promise<CreatePressingResult> {
  const { selection, details, confirmDuplicate, removeFromWishlist } = input

  const holdings = await findReleaseHoldings(prisma, selection, details)

  // Two things are worth saying before saving: you may have forgotten you already own a
  // pressing, and you may not realise this purchase settles a hunt you have open.
  const collides =
    holdings && (holdings.pressings.length > 0 || holdings.wishlistItems.length > 0)
  if (collides && !confirmDuplicate) {
    return { status: 'duplicate', holdings }
  }

  const releaseId = await resolveReleaseId(prisma, selection, holdings?.releaseId ?? null)

  // Buying the pressing you were hunting ends that hunt, so an exact match always goes.
  // Entries for other pressings of the release are separate hunts and stay put unless
  // the caller explicitly chose to clear them too. Ids come from our own query rather
  // than the request, so a stale or doctored client can't widen the delete.
  const wishlistIdsToClear =
    holdings?.wishlistItems
      .filter((w) => w.identical || removeFromWishlist)
      .map((w) => w.wishlistItemId) ?? []

  // One transaction, matching addWishlistItemToCollection: the record never lands in the
  // collection while its wishlist entry survives, and never disappears from the wishlist
  // without landing.
  const pressing = await prisma.$transaction(async (tx) => {
    const created = await tx.pressing.create({
      data: {
        releaseId,
        formatId: details.formatId,
        recordCondition: details.recordCondition as never,
        sleeveCondition: (details.sleeveCondition ?? null) as never,
        pressingYear: details.pressingYear,
        country: details.country,
        label: details.label,
        catalogNumber: details.catalogNumber,
        vinylColor: details.vinylColor,
        discCount: details.discCount,
        notes: details.notes,
        purchasePrice: details.purchasePrice,
        purchaseDate: details.purchaseDate,
        currentValue: details.currentValue,
      },
    })

    if (wishlistIdsToClear.length > 0) {
      await tx.wishlistItem.deleteMany({
        where: { wishlistItemId: { in: wishlistIdsToClear } },
      })
    }
    return created
  })

  return { status: 'created', pressingId: pressing?.pressingId }
}

export type UpdatePressingInput = {
  details: PressingDetailsInput
  /** Applied to the parent release, not the pressing — blank leaves it alone. */
  coverImageUrl: string | null
}

export async function updatePressing(
  prisma: PrismaClient,
  pressingId: number,
  input: UpdatePressingInput
): Promise<void> {
  const { details, coverImageUrl } = input

  const pressing = await prisma.pressing.update({
    where: { pressingId },
    data: {
      formatId: details.formatId,
      recordCondition: details.recordCondition as never,
      sleeveCondition: (details.sleeveCondition ?? null) as never,
      pressingYear: details.pressingYear,
      country: details.country,
      label: details.label,
      catalogNumber: details.catalogNumber,
      vinylColor: details.vinylColor,
      discCount: details.discCount,
      notes: details.notes,
      purchasePrice: details.purchasePrice,
      purchaseDate: details.purchaseDate,
      currentValue: details.currentValue,
    },
  })

  if (coverImageUrl) {
    await prisma.release.update({
      where: { releaseId: pressing.releaseId },
      data: { coverImageUrl },
    })
  }
}

export async function deletePressing(prisma: PrismaClient, pressingId: number): Promise<void> {
  await prisma.pressing.delete({ where: { pressingId } })
}
