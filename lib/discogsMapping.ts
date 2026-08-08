import type { DiscogsReleaseDetail } from './discogs'

const DISCOGS_ARTIST_SUFFIX = /\s\(\d+\)$/

/**
 * Discogs files every compilation under the artist name "Various". Sleeves, shop
 * dividers and every other catalogue say "Various Artists", so that is what this
 * collection stores.
 *
 * Matched exactly rather than by prefix: "Various Production" is a real artist, and
 * so is "Various Artists" itself on some releases — the latter already reads
 * correctly and passes through untouched.
 */
const DISCOGS_COMPILATION_ARTIST = 'various'
const COMPILATION_ARTIST = 'Various Artists'

/**
 * Strips Discogs' numeric disambiguation suffix from artist names, e.g.
 * "Genesis (2)" → "Genesis", and spells out its compilation placeholder.
 */
export function cleanDiscogsArtistName(name: string): string {
  const cleaned = name.replace(DISCOGS_ARTIST_SUFFIX, '').trim()
  return cleaned.toLowerCase() === DISCOGS_COMPILATION_ARTIST ? COMPILATION_ARTIST : cleaned
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

/** Collapses spelling differences so "Hip Hop", "Hip-Hop" and "hip hop" all compare equal. */
function normalizeGenre(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * Discogs genres whose names don't survive normalization onto one of ours, either
 * because they're worded differently ("Stage & Screen" for a soundtrack) or because
 * they bundle several of our genres into one label. Anything not listed here falls
 * through to a normalized name match, which is what makes Discogs' "Hip Hop" reach
 * our "Hip-Hop" without needing an entry.
 */
const DISCOGS_GENRE_MAP: Record<string, string[]> = {
  electronic: ['Electronica'],
  funksoul: ['Funk', 'R&B / Soul'],
  folkworldcountry: ['Folk', 'World', 'Country'],
  stagescreen: ['Soundtrack'],
}

/**
 * Our genres that Discogs files only as styles, never as genres — a punk record is
 * `genres: ["Rock"], styles: ["Punk"]`, and Non-Music is the only genre a spoken word
 * release gets. Without consulting styles these four could never prefill at all.
 *
 * Deliberately narrow: styles are fine-grained and numerous, so mining them wholesale
 * would tag records far more broadly than the genre field implies. Matching is on the
 * normalized substring so Discogs' qualified styles ("Nu Metal", "Post-Punk", "Dark
 * Ambient") still reach the plain genre.
 */
const STYLE_SOURCED_GENRES = ['Ambient', 'Metal', 'Punk', 'Spoken Word']

/**
 * Turns a Discogs release's classification into candidate genre names for our list.
 * Names are candidates rather than ids — `matchGenreIds` resolves them against
 * whatever genres the database actually holds.
 */
export function guessGenreNames(discogsGenres: string[], discogsStyles: string[] = []): string[] {
  const names = new Set<string>()

  for (const genre of discogsGenres) {
    const mapped = DISCOGS_GENRE_MAP[normalizeGenre(genre)]
    if (mapped) mapped.forEach((name) => names.add(name))
    else names.add(genre)
  }

  for (const style of discogsStyles) {
    const normalizedStyle = normalizeGenre(style)
    for (const genre of STYLE_SOURCED_GENRES) {
      if (normalizedStyle.includes(normalizeGenre(genre))) names.add(genre)
    }
  }

  return [...names]
}

/**
 * Resolves candidate genre names against the genres on hand, comparing normalized so
 * a punctuation or spacing difference between the two vocabularies doesn't lose a match.
 */
export function matchGenreIds<T extends { genreId: number; name: string }>(
  candidateNames: string[],
  available: T[]
): number[] {
  const wanted = new Set(candidateNames.map(normalizeGenre))
  return available.filter((g) => wanted.has(normalizeGenre(g.name))).map((g) => g.genreId)
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
    genreNames: guessGenreNames(release.genres, release.styles),
    formatName: guessFormatName(release.formats),
    country: release.country,
    label: release.labels[0]?.name ?? null,
    catalogNumber: release.labels[0]?.catno ?? null,
    discCount: guessDiscCount(release.formats),
    vinylColor: release.vinylColor,
    coverImageUrl: release.coverImageUrl,
  }
}
