import type { ExistingPressingSummary, ExistingWishlistSummary } from '@/lib/releaseIntake'

export const CONDITION_LABELS: Record<string, string> = {
  P: 'P', FR: 'FR', G: 'G', G_PLUS: 'G+', VG_MINUS: 'VG-',
  VG: 'VG', VG_PLUS: 'VG+', NM: 'NM', M: 'M', S: 'S',
}

/** The pressing details shared by collection and wishlist entries, in the order a collector scans them. */
function commonDetails(item: {
  formatName: string
  discCount: number
  pressingYear: number | null
  label: string | null
  catalogNumber: string | null
  country: string | null
  vinylColor: string | null
}): Array<string | null> {
  return [
    item.formatName,
    item.discCount > 1 ? `${item.discCount} discs` : null,
    item.pressingYear ? String(item.pressingYear) : null,
    item.label,
    item.catalogNumber,
    item.country,
    item.vinylColor,
  ]
}

function compact(parts: Array<string | null>): string[] {
  return parts.filter((v): v is string => Boolean(v))
}

/** Describes a pressing you own, including the condition grades a wishlist entry has no room for. */
export function collectionPressingDetails(p: ExistingPressingSummary): string[] {
  return compact([
    ...commonDetails(p),
    `Record ${CONDITION_LABELS[p.recordCondition] ?? p.recordCondition}`,
    p.sleeveCondition ? `Sleeve ${CONDITION_LABELS[p.sleeveCondition] ?? p.sleeveCondition}` : null,
  ])
}

/** Describes a pressing you're hunting for. Wishlist entries carry no condition grades. */
export function wishlistItemDetails(w: ExistingWishlistSummary): string[] {
  return compact(commonDetails(w))
}
