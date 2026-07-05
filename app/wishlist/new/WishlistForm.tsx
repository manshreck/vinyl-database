'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createWishlistItem } from '@/app/actions/createWishlistItem'

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
  artists: Array<{ artist: { name: string } }>
}

type ArtistResult = {
  artistId: number
  name: string
}

type Format = { formatId: number; name: string }
type Genre = { genreId: number; name: string }

type Props = {
  formats: Format[]
  genres: Genre[]
}

function useDebounce(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

export default function WishlistForm({ formats, genres }: Props) {
  // Release search
  const [releaseQuery, setReleaseQuery] = useState('')
  const [releaseResults, setReleaseResults] = useState<ReleaseResult[]>([])
  const [selectedRelease, setSelectedRelease] = useState<ReleaseResult | null>(null)
  const [creatingRelease, setCreatingRelease] = useState(false)
  const debouncedReleaseQuery = useDebounce(releaseQuery, 300)

  // New release / artist fields
  const [artistQuery, setArtistQuery] = useState('')
  const [artistResults, setArtistResults] = useState<ArtistResult[]>([])
  const [selectedArtist, setSelectedArtist] = useState<ArtistResult | null>(null)
  const debouncedArtistQuery = useDebounce(artistQuery, 300)

  const [selectedGenres, setSelectedGenres] = useState<number[]>([])
  const [pending, setPending] = useState(false)

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
    setPending(true)
    const data = new FormData(e.currentTarget)
    await createWishlistItem(data)
  }

  const releaseSelected = selectedRelease || creatingRelease

  return (
    <form onSubmit={handleSubmit} className="space-y-8">

      {/* ── Release section ── */}
      <section className="space-y-4">
        <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">Release</h2>

        {selectedRelease ? (
          <div className="flex items-center justify-between rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 px-4 py-3">
            <div>
              <p className="font-medium text-zinc-900 dark:text-zinc-50">
                {selectedRelease.title}
                <span className="ml-2 text-sm text-zinc-400">({selectedRelease.originalReleaseYear})</span>
              </p>
              <p className="text-sm text-zinc-500">
                {selectedRelease.artists.map((a) => a.artist.name).join(', ')}
              </p>
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

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className={labelClass}>Title</label>
                <input name="newReleaseTitle" required className={inputClass} defaultValue={releaseQuery} />
              </div>
              <div>
                <label className={labelClass}>Original release year</label>
                <input name="newReleaseYear" type="number" min={1877} max={2200} required className={inputClass} />
              </div>
            </div>

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
              <select name="formatId" required className={inputClass}>
                <option value="">Select…</option>
                {formats.map((f) => (
                  <option key={f.formatId} value={f.formatId}>{f.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>Number of discs</label>
              <input name="discCount" type="number" min={1} max={50} defaultValue={1} required className={inputClass} />
            </div>

            <div>
              <label className={labelClass}>Record condition</label>
              <select name="recordCondition" required className={inputClass}>
                <option value="">Select…</option>
                {CONDITIONS.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>Sleeve condition</label>
              <select name="sleeveCondition" className={inputClass}>
                <option value="">None / unknown</option>
                {CONDITIONS.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>Pressing year</label>
              <input name="pressingYear" type="number" min={1877} max={2200} className={inputClass} placeholder="e.g. 1972" />
            </div>

            <div>
              <label className={labelClass}>Country</label>
              <input name="country" className={inputClass} placeholder="e.g. UK" />
            </div>

            <div>
              <label className={labelClass}>Label</label>
              <input name="label" className={inputClass} placeholder="e.g. Parlophone" />
            </div>

            <div>
              <label className={labelClass}>Catalog number</label>
              <input name="catalogNumber" className={inputClass} placeholder="e.g. PCS 7088" />
            </div>

            <div>
              <label className={labelClass}>Vinyl color</label>
              <input name="vinylColor" className={inputClass} placeholder="e.g. Clear, Red, Blue/White Splatter (leave blank for standard black)" />
            </div>
          </div>

          <div>
            <label className={labelClass}>Notes</label>
            <textarea name="notes" rows={3} className={inputClass} placeholder="What you're looking for, price ceiling, condition preferences…" />
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
            {pending ? 'Saving…' : 'Save to wishlist'}
          </button>
          <Link href="/wishlist" className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">
            Cancel
          </Link>
        </div>
      )}
    </form>
  )
}

const labelClass = 'block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1'
const inputClass =
  'w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-500'
const dropdownClass =
  'absolute z-10 mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg overflow-hidden'
const dropdownItemClass =
  'w-full px-4 py-2 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-900 dark:text-zinc-50'
