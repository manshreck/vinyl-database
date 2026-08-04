import { cleanDiscogsArtistName, guessVinylColorFromFormatText } from './discogsMapping'

const DISCOGS_API_BASE = 'https://api.discogs.com'
const USER_AGENT = 'VinylDatabase/1.0 +https://github.com/manshreck/vinyl-database'

/** A user's own Discogs token takes priority; the shared env token is the fallback. */
export function resolveDiscogsToken(userToken: string | null | undefined): string | null {
  return userToken ?? process.env.DISCOGS_TOKEN ?? null
}

export class DiscogsApiError extends Error {
  status: number
  rateLimited: boolean

  constructor(message: string, status: number, rateLimited = false) {
    super(message)
    this.name = 'DiscogsApiError'
    this.status = status
    this.rateLimited = rateLimited
  }
}

async function discogsFetch<T>(
  path: string,
  token: string | null,
  params: Record<string, string> = {}
): Promise<T> {
  if (!token) {
    throw new DiscogsApiError('Discogs search is not configured (missing a Discogs token).', 0)
  }

  const url = new URL(`${DISCOGS_API_BASE}${path}`)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  url.searchParams.set('token', token)

  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
  })

  if (!response.ok) {
    if (response.status === 429) {
      throw new DiscogsApiError(
        'Discogs search is rate-limited right now. Please try again in a minute.',
        429,
        true
      )
    }
    throw new DiscogsApiError(`Discogs API request failed (${response.status}).`, response.status)
  }

  return response.json() as Promise<T>
}

type RawSearchResult = {
  id: number
  title: string
  year?: string
  country?: string
  label?: string[]
  catno?: string
  format?: string[]
  formats?: Array<{ text?: string }>
  thumb?: string
}

export type DiscogsSearchResult = {
  id: number
  title: string
  year: string | null
  country: string | null
  label: string | null
  catno: string | null
  formats: string[]
  vinylColor: string | null
  thumb: string | null
}

/** Searches Discogs' release catalog. Shows only the first page (25 results) — no pagination UI yet. */
export async function searchDiscogsReleases(
  query: string,
  token: string | null
): Promise<DiscogsSearchResult[]> {
  const data = await discogsFetch<{ results: RawSearchResult[] }>('/database/search', token, {
    type: 'release',
    q: query,
    per_page: '25',
  })

  return data.results.map((r) => ({
    id: r.id,
    title: r.title,
    year: r.year ?? null,
    country: r.country ?? null,
    label: r.label?.[0] ?? null,
    catno: r.catno ?? null,
    formats: r.format ?? [],
    vinylColor: guessVinylColorFromFormatText(r.formats?.[0]?.text),
    thumb: r.thumb || null,
  }))
}

type RawRelease = {
  id: number
  title: string
  year?: number
  country?: string
  notes?: string
  master_id?: number
  artists?: Array<{ name: string }>
  genres?: string[]
  styles?: string[]
  labels?: Array<{ name: string; catno?: string }>
  formats?: Array<{ name: string; qty?: string; descriptions?: string[]; text?: string }>
  images?: Array<{ type: string; uri: string }>
}

type RawMaster = {
  year?: number
}

export type DiscogsReleaseDetail = {
  id: number
  title: string
  artists: string[]
  pressingYear: number | null
  originalReleaseYear: number
  country: string | null
  genres: string[]
  /** Discogs' finer-grained classification; several of our genres appear only here. */
  styles: string[]
  labels: Array<{ name: string; catno: string | null }>
  formats: Array<{ name: string; qty: string | null; descriptions: string[] }>
  vinylColor: string | null
  notes: string | null
  coverImageUrl: string | null
}

/**
 * Fetches a single Discogs release's full detail. Discogs' release-level `year` is the
 * pressing year, not the original release year — when the release belongs to a master,
 * the master's `year` (the earliest/original release) is used for `originalReleaseYear`
 * instead, falling back to the release's own year if there's no master or the lookup fails.
 */
export async function getDiscogsRelease(id: number, token: string | null): Promise<DiscogsReleaseDetail> {
  const release = await discogsFetch<RawRelease>(`/releases/${id}`, token)

  let originalReleaseYear = release.year ?? 0
  if (release.master_id) {
    try {
      const master = await discogsFetch<RawMaster>(`/masters/${release.master_id}`, token)
      if (master.year) originalReleaseYear = master.year
    } catch {
      // Fall back to the release's own year if the master lookup fails
    }
  }

  const images = release.images ?? []
  const primaryImage = images.find((img) => img.type === 'primary') ?? images[0]

  return {
    id: release.id,
    title: release.title,
    artists: (release.artists ?? []).map((a) => cleanDiscogsArtistName(a.name)),
    pressingYear: release.year ?? null,
    originalReleaseYear,
    country: release.country ?? null,
    genres: release.genres ?? [],
    styles: release.styles ?? [],
    labels: (release.labels ?? []).map((l) => ({ name: l.name, catno: l.catno ?? null })),
    formats: (release.formats ?? []).map((f) => ({
      name: f.name,
      qty: f.qty ?? null,
      descriptions: f.descriptions ?? [],
    })),
    vinylColor: guessVinylColorFromFormatText(release.formats?.[0]?.text),
    notes: release.notes ?? null,
    coverImageUrl: primaryImage?.uri ?? null,
  }
}
