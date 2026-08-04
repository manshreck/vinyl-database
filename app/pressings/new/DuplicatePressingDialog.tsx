'use client'

import type { ReleaseHoldings } from '@/lib/releaseIntake'
import { collectionPressingDetails, wishlistItemDetails } from '@/app/components/recordDetails'
import DuplicateDialog, {
  type DialogAction,
  type DialogSection,
} from '@/app/components/DuplicateDialog'

const REMOVE_LABEL = 'Add to Collection (Remove from Wishlist)'
const KEEP_LABEL = 'Add to Collection, Keep on Wishlist'

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many
}

type Props = {
  duplicate: ReleaseHoldings
  pending: boolean
  /** `removeFromWishlist` also clears entries describing a different pressing. */
  onConfirm: (removeFromWishlist?: boolean) => void
  onCancel: () => void
}

export default function DuplicatePressingDialog({
  duplicate,
  pending,
  onConfirm,
  onCancel,
}: Props) {
  const owned = duplicate.pressings
  // Buying the pressing you were hunting settles that entry; entries describing other
  // pressings are separate hunts and survive the purchase.
  const fulfilled = duplicate.wishlistItems.filter((w) => w.identical)
  const stillWanted = duplicate.wishlistItems.filter((w) => !w.identical)

  // Only the wishlist entries that describe a different pressing are in question — an
  // exact match is always cleared, so it needs no choice offered.
  const offersWishlistChoice = stillWanted.length > 0

  let title: string
  if (owned.length > 0) {
    title = `You already own ${plural(owned.length, 'a pressing', `${owned.length} pressings`)} of this release`
  } else if (offersWishlistChoice && fulfilled.length === 0) {
    title = 'This release (but not this pressing) is on your wishlist'
  } else {
    title = 'This release is on your wishlist'
  }

  const body: string[] = []
  if (owned.length > 0) {
    body.push('Add another one only if you really have a second copy.')
  }
  if (fulfilled.length > 0) {
    body.push(
      `Saving clears ${plural(fulfilled.length, 'the matching entry', `${fulfilled.length} matching entries`)} from your wishlist.`
    )
  }
  if (offersWishlistChoice) {
    body.push(
      `If you wish to also remove it from your wishlist, click “${REMOVE_LABEL}” below.`
    )
  }

  const actions: DialogAction[] = offersWishlistChoice
    ? [
        { label: REMOVE_LABEL, onClick: () => onConfirm(true), variant: 'secondary' },
        { label: KEEP_LABEL, onClick: () => onConfirm(false) },
      ]
    : [
        {
          label: owned.length > 0 ? 'Add anyway' : 'Add to collection',
          onClick: () => onConfirm(false),
        },
      ]

  const sections: DialogSection[] = []
  if (owned.length > 0) {
    sections.push({
      heading: 'Already in your collection',
      entries: owned.map((p) => ({
        key: p.pressingId,
        details: collectionPressingDetails(p),
        href: `/pressings/${p.pressingId}`,
        note: p.purchaseDate ? `Purchased ${p.purchaseDate}` : null,
      })),
    })
  }
  if (fulfilled.length > 0) {
    sections.push({
      heading: 'On your wishlist — this purchase fulfills it',
      entries: fulfilled.map((w) => ({
        key: w.wishlistItemId,
        details: wishlistItemDetails(w),
        href: `/wishlist/${w.wishlistItemId}`,
        badge: 'Will be removed',
      })),
    })
  }
  if (stillWanted.length > 0) {
    sections.push({
      heading: 'On your wishlist — a different pressing',
      entries: stillWanted.map((w) => ({
        key: w.wishlistItemId,
        details: wishlistItemDetails(w),
        href: `/wishlist/${w.wishlistItemId}`,
      })),
    })
  }

  return (
    <DuplicateDialog
      titleId="duplicate-pressing-title"
      title={title}
      body={body}
      actions={actions}
      release={duplicate}
      sections={sections}
      pending={pending}
      onCancel={onCancel}
    />
  )
}
