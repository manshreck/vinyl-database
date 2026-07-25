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

const VINYL_COLOR_KEYWORDS = [
  'black', 'white', 'red', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink',
  'grey', 'gray', 'brown', 'gold', 'silver', 'bronze', 'copper', 'clear',
  'transparent', 'translucent', 'marbled', 'marble', 'splatter', 'swirl',
  'splash', 'smoke', 'smokey', 'glow', 'neon', 'picture disc', 'picture',
  'multicolor', 'multi-color', 'tri-color', 'glitter', 'metallic', 'opaque', 'milky',
]

/**
 * Discogs' format "text" field is a free-text note (e.g. "Blue, 180g", "Orange Transparent",
 * "Terre Haute Pressing") that isn't always about color. Splits on commas and keeps only the
 * segments that look like a vinyl color/finish, dropping unrelated pressing-plant notes.
 * Returns null when nothing looks like a color, rather than guessing wrong.
 */
export function guessVinylColorFromFormatText(text: string | null | undefined): string | null {
  if (!text) return null
  const colorSegments = text
    .split(',')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
    .filter((segment) =>
      VINYL_COLOR_KEYWORDS.some((keyword) => segment.toLowerCase().includes(keyword))
    )
  return colorSegments.length > 0 ? colorSegments.join(', ') : null
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
  pressingYear: number | null
  artistName: string
  genreNames: string[]
  formatName: string | null
  country: string | null
  label: string | null
  catalogNumber: string | null
  discCount: number
  vinylColor: string | null
  coverImageUrl: string | null
}

/** Assembles a DiscogsReleaseDetail into the plain prefill shape the create-form pages pass to PressingsForm/WishlistForm. */
export function buildDiscogsInitialValues(release: DiscogsReleaseDetail): DiscogsInitialValues {
  return {
    title: release.title,
    originalReleaseYear: release.originalReleaseYear,
    pressingYear: release.pressingYear,
    artistName: release.artists[0] ?? '',
    genreNames: guessGenreNames(release.genres),
    formatName: guessFormatName(release.formats),
    country: release.country,
    label: release.labels[0]?.name ?? null,
    catalogNumber: release.labels[0]?.catno ?? null,
    discCount: guessDiscCount(release.formats),
    vinylColor: release.vinylColor,
    coverImageUrl: release.coverImageUrl,
  }
}
