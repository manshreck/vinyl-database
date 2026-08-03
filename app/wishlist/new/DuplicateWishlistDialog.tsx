'use client'

import type { ReleaseHoldings } from '@/lib/releaseIntake'
import { collectionPressingDetails, wishlistItemDetails } from '@/app/components/recordDetails'
import DuplicateDialog, { type DialogSection } from '@/app/components/DuplicateDialog'

/**
 * Three collisions are possible, in ascending order of "are you sure?":
 *
 *  - `owned`     — you own a pressing but aren't hunting this release. Wanting a
 *                  different pressing is ordinary, so this is a light touch.
 *  - `wanted`    — the release is on the wishlist under different pressing details.
 *                  Also ordinary: two pressings, two hunts.
 *  - `identical` — the wishlist already lists this release with these exact pressing
 *                  details. Confirming duplicates the entry, which is almost never
 *                  intended, so this case gets blunter wording and a distinct button.
 */
type Severity = 'owned' | 'wanted' | 'identical'

const COPY: Record<Severity, { title: string; body: string; confirm: string }> = {
  owned: {
    title: 'You already own this release',
    body: 'Adding it to your wishlist is perfectly reasonable if you are hunting for a different pressing.',
    confirm: 'Add to wishlist',
  },
  wanted: {
    title: 'This release is already on your wishlist',
    body: 'You are already looking for it in other pressing details. Adding another entry is fine if you want a different pressing.',
    confirm: 'Add to wishlist',
  },
  identical: {
    title: 'This exact pressing is already on your wishlist',
    body:
      'Your wishlist already lists this release with these very same pressing details — same format, year, label, catalog number, color and disc count. ' +
      'Confirming adds a second, identical entry rather than changing the one you have. ' +
      'That is almost never what you want. Only continue if you genuinely intend to buy more than one copy, such as when buying in bulk.',
    confirm: 'Yes, add a second identical entry',
  },
}

type Props = {
  duplicate: ReleaseHoldings
  pending: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function DuplicateWishlistDialog({
  duplicate,
  pending,
  onConfirm,
  onCancel,
}: Props) {
  const exactMatches = duplicate.wishlistItems.filter((w) => w.identical)
  const otherWanted = duplicate.wishlistItems.filter((w) => !w.identical)

  const severity: Severity =
    exactMatches.length > 0 ? 'identical' : duplicate.wishlistItems.length > 0 ? 'wanted' : 'owned'
  const copy = COPY[severity]

  const sections: DialogSection[] = []
  if (exactMatches.length > 0) {
    sections.push({
      heading: 'On your wishlist — same pressing',
      entries: exactMatches.map((w) => ({
        key: w.wishlistItemId,
        details: wishlistItemDetails(w),
        href: `/wishlist/${w.wishlistItemId}`,
        badge: 'Exact match',
      })),
    })
  }
  if (otherWanted.length > 0) {
    sections.push({
      heading: `On your wishlist — ${exactMatches.length > 0 ? 'other pressings' : 'different pressing'}`,
      entries: otherWanted.map((w) => ({
        key: w.wishlistItemId,
        details: wishlistItemDetails(w),
        href: `/wishlist/${w.wishlistItemId}`,
      })),
    })
  }
  if (duplicate.pressings.length > 0) {
    sections.push({
      heading: 'Already in your collection',
      entries: duplicate.pressings.map((p) => ({
        key: p.pressingId,
        details: collectionPressingDetails(p),
        href: `/pressings/${p.pressingId}`,
      })),
    })
  }

  return (
    <DuplicateDialog
      titleId="duplicate-wishlist-title"
      title={copy.title}
      body={[copy.body]}
      escalated={severity === 'identical'}
      confirmLabel={copy.confirm}
      release={duplicate}
      sections={sections}
      pending={pending}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  )
}
