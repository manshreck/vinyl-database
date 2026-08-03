'use client'

import type { ReleaseHoldings } from '@/lib/releaseIntake'
import { collectionPressingDetails, wishlistItemDetails } from '@/app/components/recordDetails'
import DuplicateDialog, { type DialogSection } from '@/app/components/DuplicateDialog'

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many
}

type Props = {
  duplicate: ReleaseHoldings
  pending: boolean
  onConfirm: () => void
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

  const title =
    owned.length > 0
      ? `You already own ${plural(owned.length, 'a pressing', `${owned.length} pressings`)} of this release`
      : 'This release is on your wishlist'

  const body: string[] = []
  if (owned.length > 0) {
    body.push('Add another one only if you really have a second copy.')
  }
  if (fulfilled.length > 0) {
    body.push(
      `Saving clears ${plural(fulfilled.length, 'the matching entry', `${fulfilled.length} matching entries`)} from your wishlist.`
    )
  }
  if (stillWanted.length > 0) {
    body.push(
      `You are still hunting ${plural(stillWanted.length, 'another pressing', 'other pressings')} of this release, so ${plural(stillWanted.length, 'that entry stays', 'those entries stay')} on your wishlist.`
    )
  }

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
      heading: 'On your wishlist — other pressings',
      entries: stillWanted.map((w) => ({
        key: w.wishlistItemId,
        details: wishlistItemDetails(w),
        href: `/wishlist/${w.wishlistItemId}`,
        badge: 'Stays on your wishlist',
        badgeTone: 'neutral' as const,
      })),
    })
  }

  return (
    <DuplicateDialog
      titleId="duplicate-pressing-title"
      title={title}
      body={body}
      confirmLabel={owned.length > 0 ? 'Add anyway' : 'Add to collection'}
      release={duplicate}
      sections={sections}
      pending={pending}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  )
}
