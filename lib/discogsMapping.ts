import type { DiscogsReleaseDetail } from './discogs'

const DISCOGS_ARTIST_SUFFIX = /\s\(\d+\)$/

/** Strips Discogs' numeric disambiguation suffix from artist names, e.g. "Genesis (2)" → "Genesis". */
export function cleanDiscogsArtistName(name: string): string {
  return name.replace(DISCOGS_ARTIST_SUFFIX, '').trim()
}

const KNOWN_FORMAT_NAMES = ['7"', '10"', '12"', 'LP', 'Box Set', 'Cassette', 'CD']

/**
 * Best-effort match of Discogs format descriptions (e.g. ["LP", "Album", "Reissue"])
 * against our known Format names. Returns null if nothing matches confidently, leaving
 * the format unselected in the form rather than guessing wrong.
 */
export function guessFormatName(formats: Array<{ descriptions: string[] }>): string | null {
  const descriptions = formats.flatMap((f) => f.descriptions)
  for (const known of KNOWN_FORMAT_NAMES) {
    if (descriptions.some((d) => d.toLowerCase() === known.toLowerCase())) return known
  }
  return null
}

const GENRE_ALIASES: Record<string, string> = {
  electronic: 'Electronica',
}

/** Maps Discogs genre names to our Genre names, applying known aliases (Discogs "Electronic" → our "Electronica"). */
export function guessGenreNames(discogsGenres: string[]): string[] {
  return discogsGenres.map((g) => GENRE_ALIASES[g.toLowerCase()] ?? g)
}

/** Derives a disc count from Discogs format quantities (e.g. "2" for a 2xLP box), defaulting to 1. */
export function guessDiscCount(formats: Array<{ qty: string | null }>): number {
  const qty = formats.map((f) => Number(f.qty)).find((n) => Number.isFinite(n) && n > 0)
  return qty ?? 1
}

export type DiscogsInitialValues = {
  title: string
  originalReleaseYear: number
  artistName: string
  genreNames: string[]
  formatName: string | null
  country: string | null
  label: string | null
  catalogNumber: string | null
  discCount: number
  coverImageUrl: string | null
}

/** Assembles a DiscogsReleaseDetail into the plain prefill shape the create-form pages pass to PressingsForm/WishlistForm. */
export function buildDiscogsInitialValues(release: DiscogsReleaseDetail): DiscogsInitialValues {
  return {
    title: release.title,
    originalReleaseYear: release.originalReleaseYear,
    artistName: release.artists[0] ?? '',
    genreNames: guessGenreNames(release.genres),
    formatName: guessFormatName(release.formats),
    country: release.country,
    label: release.labels[0]?.name ?? null,
    catalogNumber: release.labels[0]?.catno ?? null,
    discCount: guessDiscCount(release.formats),
    coverImageUrl: release.coverImageUrl,
  }
}
