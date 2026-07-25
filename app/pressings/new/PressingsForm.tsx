'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { createPressing } from '@/app/actions/createPressing'

const CONDITIONS = [
  { value: 'P', label: 'P — Poor' },
  { value: 'FR', label: 'FR — Fair' },
  { value: 'G', label: 'G — Good' },
  { value: 'G_PLUS', label: 'G+ — Good Plus' },
  { value: 'VG_MINUS', label: 'VG- — Very Good Minus' },
  { value: 'VG', label: 'VG — Very Good' },
  { value: 'VG_PLUS', label: 'VG+ — Very Good Plus' },
  { value: 'NM', label: 'NM — Near Mint' },
  { value: 'M', label: 'M — Mint' },
  { value: 'S', label: 'S — Sealed' },
]

type ReleaseResult = {
  releaseId: number
  title: string
  originalReleaseYear: number
  coverImageUrl: string | null
  artists: Array<{ artist: { name: string } }>
}

type ArtistResult = {
  artistId: number
  name: string
}

type Format = { formatId: number; name: string }
type Genre = { genreId: number; name: string }

export type PressingInitialValues = {
  title: string
  originalReleaseYear: number
  pressingYear: number | null
  artistName: string
  genreIds: number[]
  formatId: number | null
  country: string | null
  label: string | null
  catalogNumber: string | null
  discCount: number
  vinylColor: string | null
  coverImageUrl: string | null
}

type Props = {
  formats: Format[]
  genres: Genre[]
  initialValues?: PressingInitialValues
}

function useDebounce(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

export default function PressingsForm({ formats, genres, initialValues }: Props) {
  const router = useRouter()

  // Release search
  const [releaseQuery, setReleaseQuery] = useState(initialValues?.title ?? '')
  const [releaseResults, setReleaseResults] = useState<ReleaseResult[]>([])
  const [selectedRelease, setSelectedRelease] = useState<ReleaseResult | null>(null)
  const [creatingRelease, setCreatingRelease] = useState(Boolean(initialValues))
  const [discogsQuery, setDiscogsQuery] = useState('')
  const debouncedReleaseQuery = useDebounce(releaseQuery, 300)

  // New release / artist fields
  const [artistQuery, setArtistQuery] = useState(initialValues?.artistName ?? '')
  const [artistResults, setArtistResults] = useState<ArtistResult[]>([])
  const [selectedArtist, setSelectedArtist] = useState<ArtistResult | null>(null)
  const debouncedArtistQuery = useDebounce(artistQuery, 300)

  const [selectedGenres, setSelectedGenres] = useState<number[]>(initialValues?.genreIds ?? [])
  const [pending, setPending] = useState(false)

  const [coverImageUrl, setCoverImageUrl] = useState(initialValues?.coverImageUrl ?? null)
  const [retrievingImage, setRetrievingImage] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)

  // Fields never auto-populated from Discogs — flagged red until the user fills them in
  const [recordConditionTouched, setRecordConditionTouched] = useState(false)
  const [sleeveConditionTouched, setSleeveConditionTouched] = useState(false)
  const [purchasePriceTouched, setPurchasePriceTouched] = useState(false)
  const [purchaseDateTouched, setPurchaseDateTouched] = useState(false)
  const [currentValueTouched, setCurrentValueTouched] = useState(false)
  const [currentValue, setCurrentValue] = useState('')

  const releaseDropdownRef = useRef<HTMLDivElement>(null)
  const artistDropdownRef = useRef<HTMLDivElement>(null)

  // Search releases
  useEffect(() => {
    if (debouncedReleaseQuery.length < 2) { setReleaseResults([]); return }
    fetch(`/api/releases/search?q=${encodeURIComponent(debouncedReleaseQuery)}`)
      .then((r) => r.json())
      .then(setReleaseResults)
  }, [debouncedReleaseQuery])

  // Search artists
  useEffect(() => {
    if (debouncedArtistQuery.length < 2) { setArtistResults([]); return }
    fetch(`/api/artists/search?q=${encodeURIComponent(debouncedArtistQuery)}`)
      .then((r) => r.json())
      .then(setArtistResults)
  }, [debouncedArtistQuery])

  // Close dropdowns on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (releaseDropdownRef.current && !releaseDropdownRef.current.contains(e.target as Node)) {
        setReleaseResults([])
      }
      if (artistDropdownRef.current && !artistDropdownRef.current.contains(e.target as Node)) {
        setArtistResults([])
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function selectRelease(r: ReleaseResult) {
    setSelectedRelease(r)
    setReleaseQuery('')
    setReleaseResults([])
    setCreatingRelease(false)
  }

  function startCreatingRelease() {
    setSelectedRelease(null)
    setCreatingRelease(true)
    setReleaseResults([])
  }

  function goToDiscogsSearch() {
    const q = discogsQuery.trim()
    router.push(`/discogs${q ? `?q=${encodeURIComponent(q)}` : ''}`)
  }

  async function retrieveCoverImage() {
    setRetrievingImage(true)
    setImageError(null)
    try {
      const params = new URLSearchParams({ title: releaseQuery, artist: artistQuery })
      const res = await fetch(`/api/discogs/cover-image?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not retrieve a cover image.')
      if (data.coverImageUrl) {
        setCoverImageUrl(data.coverImageUrl)
      } else {
        setImageError('No cover image found on Discogs for this release.')
      }
    } catch (err) {
      setImageError(err instanceof Error ? err.message : 'Could not retrieve a cover image.')
    } finally {
      setRetrievingImage(false)
    }
  }

  function selectArtist(a: ArtistResult) {
    setSelectedArtist(a)
    setArtistQuery(a.name)
    setArtistResults([])
  }

  function toggleGenre(id: number) {
    setSelectedGenres((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]
    )
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!releaseSelected) return
    setPending(true)
    const data = new FormData(e.currentTarget)
    await createPressing(data)
  }

  const releaseSelected = selectedRelease || creatingRelease

  return (
    <form onSubmit={handleSubmit} className="space-y-8">

      {/* ── Release section ── */}
      <section className="space-y-4">
        <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">Add Pressing for Existing Release</h2>

        {selectedRelease ? (
          <div className="flex items-center justify-between rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 px-4 py-3">
            <div className="flex items-center gap-4">
              {selectedRelease.coverImageUrl && (
                <Image
                  src={selectedRelease.coverImageUrl}
                  alt=""
                  width={64}
                  height={64}
                  className="rounded-lg object-cover flex-shrink-0"
                  unoptimized
                />
              )}
              <div>
                <p className="font-medium text-zinc-900 dark:text-zinc-50">
                  {selectedRelease.title}
                  <span className="ml-2 text-sm text-zinc-400">({selectedRelease.originalReleaseYear})</span>
                </p>
                <p className="text-sm text-zinc-500">
                  {selectedRelease.artists.map((a) => a.artist.name).join(', ')}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => { setSelectedRelease(null); setCreatingRelease(false) }}
              className="text-sm text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
            >
              Change
            </button>
            <input type="hidden" name="releaseId" value={selectedRelease.releaseId} />
          </div>
        ) : creatingRelease ? (
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">New release</p>
              <button
                type="button"
                onClick={() => setCreatingRelease(false)}
                className="text-sm text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
              >
                Cancel
              </button>
            </div>

            <div className="flex items-center gap-4">
              {coverImageUrl ? (
                <Image
                  src={coverImageUrl}
                  alt=""
                  width={64}
                  height={64}
                  className="rounded-lg object-cover flex-shrink-0"
                  unoptimized
                />
              ) : (
                <div className="flex flex-col items-start gap-1 flex-shrink-0">
                  <div className="w-16 h-16 rounded-lg bg-zinc-100 dark:bg-zinc-800" />
                  <button
                    type="button"
                    onClick={retrieveCoverImage}
                    disabled={retrievingImage}
                    className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 underline disabled:opacity-50"
                  >
                    {retrievingImage ? 'Retrieving…' : 'Retrieve cover image'}
                  </button>
                </div>
              )}
              {imageError && <p className="text-xs text-red-600 dark:text-red-400">{imageError}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className={labelClass}>Title</label>
                <input name="newReleaseTitle" required className={inputClass} defaultValue={releaseQuery} />
              </div>
              <div>
                <label className={labelClass}>Original release year</label>
                <input
                  name="newReleaseYear"
                  type="number"
                  min={1877}
                  max={2200}
                  required
                  className={inputClass}
                  defaultValue={initialValues?.originalReleaseYear ?? ''}
                />
              </div>
            </div>

            {coverImageUrl && (
              <input type="hidden" name="newReleaseCoverImageUrl" value={coverImageUrl} />
            )}

            {/* Artist search */}
            <div ref={artistDropdownRef} className="relative">
              <label className={labelClass}>Artist</label>
              <input
                className={inputClass}
                placeholder="Search or enter artist name…"
                value={artistQuery}
                onChange={(e) => { setArtistQuery(e.target.value); setSelectedArtist(null) }}
                required
              />
              {/* Hidden inputs for server action */}
              {selectedArtist && <input type="hidden" name="newArtistId" value={selectedArtist.artistId} />}
              <input type="hidden" name="newArtistName" value={artistQuery} />

              {artistResults.length > 0 && (
                <div className={dropdownClass}>
                  {artistResults.map((a) => (
                    <button
                      key={a.artistId}
                      type="button"
                      onClick={() => selectArtist(a)}
                      className={dropdownItemClass}
                    >
                      {a.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Genre checkboxes */}
            <div>
              <label className={labelClass}>Genres</label>
              <div className="flex flex-wrap gap-2 mt-1">
                {genres.map((g) => (
                  <label key={g.genreId} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      name="genreIds"
                      value={g.genreId}
                      checked={selectedGenres.includes(g.genreId)}
                      onChange={() => toggleGenre(g.genreId)}
                      className="rounded border-zinc-300 text-zinc-900"
                    />
                    <span className="text-sm text-zinc-700 dark:text-zinc-300">{g.name}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div ref={releaseDropdownRef} className="relative">
            <input
              className={inputClass}
              placeholder="Search by title…"
              value={releaseQuery}
              onChange={(e) => setReleaseQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault() }}
            />
            {releaseResults.length > 0 && (
              <div className={dropdownClass}>
                {releaseResults.map((r) => (
                  <button
                    key={r.releaseId}
                    type="button"
                    onClick={() => selectRelease(r)}
                    className={dropdownItemClass}
                  >
                    <span className="font-medium">{r.title}</span>
                    <span className="ml-2 text-zinc-400 text-xs">({r.originalReleaseYear})</span>
                    <span className="ml-2 text-zinc-500 text-sm">
                      {r.artists.map((a) => a.artist.name).join(', ')}
                    </span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={startCreatingRelease}
                  className="w-full px-4 py-2 text-left text-sm text-zinc-500 border-t border-zinc-100 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                >
                  + Create new release for &ldquo;{releaseQuery}&rdquo;
                </button>
              </div>
            )}
            {releaseQuery.length >= 2 && releaseResults.length === 0 && (
              <button
                type="button"
                onClick={startCreatingRelease}
                className="mt-2 text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 underline"
              >
                No results — create new release for &ldquo;{releaseQuery}&rdquo;
              </button>
            )}

            <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-700">
              <label className={labelClass}>Search for Release on Discogs</label>
              <div className="flex items-center gap-2">
                <input
                  className={inputClass}
                  placeholder="e.g. Kind of Blue, Miles Davis"
                  value={discogsQuery}
                  onChange={(e) => setDiscogsQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); goToDiscogsSearch() } }}
                />
                <button
                  type="button"
                  onClick={goToDiscogsSearch}
                  className="rounded-full border border-zinc-200 dark:border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors whitespace-nowrap"
                >
                  Search
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ── Pressing details ── */}
      {releaseSelected && (
        <section className="space-y-4">
          <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">Pressing details</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Format</label>
              <select name="formatId" required className={inputClass} defaultValue={initialValues?.formatId ?? ''}>
                <option value="">Select…</option>
                {formats.map((f) => (
                  <option key={f.formatId} value={f.formatId}>{f.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>Number of discs</label>
              <input
                name="discCount"
                type="number"
                min={1}
                max={50}
                defaultValue={initialValues?.discCount ?? 1}
                required
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Record condition</label>
              <select
                name="recordCondition"
                required
                className={attentionInputClass(recordConditionTouched)}
                onChange={() => setRecordConditionTouched(true)}
              >
                <option value="">Select…</option>
                {CONDITIONS.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>Sleeve condition</label>
              <select
                name="sleeveCondition"
                className={attentionInputClass(sleeveConditionTouched)}
                onChange={() => setSleeveConditionTouched(true)}
              >
                <option value="">None / unknown</option>
                {CONDITIONS.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>Pressing year</label>
              <input
                name="pressingYear"
                type="number"
                min={1877}
                max={2200}
                className={inputClass}
                placeholder="e.g. 1972"
                defaultValue={initialValues?.pressingYear ?? ''}
              />
            </div>

            <div>
              <label className={labelClass}>Country</label>
              <input name="country" className={inputClass} placeholder="e.g. UK" defaultValue={initialValues?.country ?? ''} />
            </div>

            <div>
              <label className={labelClass}>Label</label>
              <input name="label" className={inputClass} placeholder="e.g. Parlophone" defaultValue={initialValues?.label ?? ''} />
            </div>

            <div>
              <label className={labelClass}>Catalog number</label>
              <input
                name="catalogNumber"
                className={inputClass}
                placeholder="e.g. PCS 7088"
                defaultValue={initialValues?.catalogNumber ?? ''}
              />
            </div>

            <div>
              <label className={labelClass}>Vinyl color</label>
              <input
              name="vinylColor"
              className={inputClass}
              placeholder="e.g. Clear, Red, Blue/White Splatter (leave blank for standard black)"
              defaultValue={initialValues?.vinylColor ?? ''}
            />
            </div>

            <div>
              <label className={labelClass}>Purchase price</label>
              <input
                name="purchasePrice"
                type="number"
                min={0}
                step="0.01"
                className={attentionInputClass(purchasePriceTouched)}
                placeholder="0.00"
                onChange={(e) => {
                  setPurchasePriceTouched(true)
                  if (!currentValueTouched) setCurrentValue(e.target.value)
                }}
              />
            </div>

            <div>
              <label className={labelClass}>Purchase date</label>
              <input
                name="purchaseDate"
                type="date"
                className={attentionInputClass(purchaseDateTouched)}
                onChange={() => setPurchaseDateTouched(true)}
              />
            </div>

            <div>
              <label className={labelClass}>Current value (insurance)</label>
              <input
                name="currentValue"
                type="number"
                min={0}
                step="0.01"
                className={attentionInputClass(currentValueTouched)}
                placeholder="0.00"
                value={currentValue}
                onChange={(e) => {
                  setCurrentValue(e.target.value)
                  setCurrentValueTouched(true)
                }}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>Notes</label>
            <textarea name="notes" rows={3} className={inputClass} placeholder="Matrix etchings, condition notes, provenance…" />
          </div>
        </section>
      )}

      {releaseSelected && (
        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={pending}
            className="rounded-full bg-zinc-900 px-6 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors disabled:opacity-50"
          >
            {pending ? 'Saving…' : 'Save pressing'}
          </button>
          <a href="/pressings" className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">
            Cancel
          </a>
        </div>
      )}
    </form>
  )
}

const labelClass = 'block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1'
const inputBaseClass =
  'w-full rounded-lg border bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-500'
const inputClass = `${inputBaseClass} border-zinc-200 dark:border-zinc-700`
const inputAttentionClass = `${inputBaseClass} border-red-300 dark:border-red-800`

/** Fields not auto-populated from Discogs get a pale red border until the user touches them. */
function attentionInputClass(touched: boolean) {
  return touched ? inputClass : inputAttentionClass
}

const dropdownClass =
  'absolute z-10 mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg overflow-hidden'
const dropdownItemClass =
  'w-full px-4 py-2 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-900 dark:text-zinc-50'
