import type { ReleaseSelection } from '@/lib/releaseIntake'
import type { PressingDetailsInput } from '@/lib/services/pressings'
import type { WishlistDetailsInput } from '@/lib/services/wishlist'
import type { AcquisitionInput } from '@/lib/services/wishlist'

/**
 * FormData → typed service input.
 *
 * Deliberately here rather than in `lib/`: FormData is how *this* transport happens to
 * carry a request, and the services must not know that. A JSON API parses its own body
 * into the same shapes and calls the same services.
 *
 * No `'use server'` in this file — these are ordinary helpers, not server actions, and
 * marking them as actions would export every one as a callable endpoint.
 */

function text(formData: FormData, key: string): string {
  return ((formData.get(key) as string | null) ?? '').trim()
}

/** Blank means "not provided", which for every optional column here means NULL. */
function optionalText(formData: FormData, key: string): string | null {
  return text(formData, key) || null
}

function optionalNumber(formData: FormData, key: string): number | null {
  const raw = text(formData, key)
  return raw ? Number(raw) : null
}

function optionalDate(formData: FormData, key: string): Date | null {
  const raw = text(formData, key)
  return raw ? new Date(raw) : null
}

/**
 * Which release the form refers to.
 *
 * A `releaseId` means the user picked one out of the collection search; its absence
 * means the "new release" fields describe one, which may still turn out to match
 * something already stored — that is findReleaseHoldings' job, not this one's.
 */
export function parseReleaseSelection(formData: FormData): ReleaseSelection {
  const releaseId = optionalNumber(formData, 'releaseId')
  if (releaseId) return { kind: 'existing', releaseId }

  return {
    kind: 'new',
    title: text(formData, 'newReleaseTitle'),
    originalReleaseYear: Number(formData.get('newReleaseYear')),
    artistId: optionalNumber(formData, 'newArtistId'),
    artistName: text(formData, 'newArtistName'),
    genreIds: formData.getAll('genreIds').map(Number).filter(Boolean),
    coverImageUrl: optionalText(formData, 'newReleaseCoverImageUrl'),
  }
}

/** The pressing fields shared by the collection and wishlist forms. */
function parseSpec(formData: FormData) {
  return {
    formatId: Number(formData.get('formatId')),
    pressingYear: optionalNumber(formData, 'pressingYear'),
    country: optionalText(formData, 'country'),
    label: optionalText(formData, 'label'),
    catalogNumber: optionalText(formData, 'catalogNumber'),
    vinylColor: optionalText(formData, 'vinylColor'),
    discCount: Number(formData.get('discCount')) || 1,
  }
}

export function parsePressingDetails(formData: FormData): PressingDetailsInput {
  return {
    ...parseSpec(formData),
    recordCondition: text(formData, 'recordCondition'),
    sleeveCondition: optionalText(formData, 'sleeveCondition'),
    notes: optionalText(formData, 'notes'),
    purchasePrice: optionalNumber(formData, 'purchasePrice'),
    purchaseDate: optionalDate(formData, 'purchaseDate'),
    currentValue: optionalNumber(formData, 'currentValue'),
  }
}

export function parseWishlistDetails(formData: FormData): WishlistDetailsInput {
  return {
    ...parseSpec(formData),
    notes: optionalText(formData, 'notes'),
  }
}

export function parseAcquisition(formData: FormData): AcquisitionInput {
  return {
    recordCondition: text(formData, 'recordCondition'),
    sleeveCondition: optionalText(formData, 'sleeveCondition'),
    purchasePrice: optionalNumber(formData, 'purchasePrice'),
    purchaseDate: optionalDate(formData, 'purchaseDate'),
    currentValue: optionalNumber(formData, 'currentValue'),
  }
}

export function parseCoverImageUrl(formData: FormData): string | null {
  return optionalText(formData, 'coverImageUrl')
}

export function isConfirmed(formData: FormData, key: string): boolean {
  return formData.get(key) === 'true'
}

/** Artist renames arrive as parallel `name[id]` / `sortName[id]` fields. */
export function parseArtistRenames(formData: FormData) {
  return formData
    .getAll('artistIds')
    .map(Number)
    .map((artistId) => ({
      artistId,
      name: text(formData, `name[${artistId}]`),
      sortName: text(formData, `sortName[${artistId}]`),
    }))
    .filter((r) => !!r.name)
}
