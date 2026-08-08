'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { createWishlistItem } from '@/app/actions/createWishlistItem'
import type { ReleaseHoldings } from '@/lib/releaseIntake'
import DuplicateWishlistDialog from './DuplicateWishlistDialog'
import { useCoverImageRetrieval } from '@/app/components/useCoverImageRetrieval'
import CoverImageErrorNotice from '@/app/components/CoverImageErrorNotice'

export type ReleaseResult = {
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

export type WishlistInitialValues = {
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
  initialValues?: WishlistInitialValues
  selectedRelease?: ReleaseResult
  initialTitle?: string
}

function useDebounce(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

export default function WishlistForm({ formats, genres, initialValues, selectedRelease, initialTitle }: Props) {
  const releaseTitle = initialValues?.title ?? initialTitle ?? ''

  // New release / artist fields
  const [artistQuery, setArtistQuery] = useState(initialValues?.artistName ?? '')
  const [artistResults, setArtistResults] = useState<ArtistResult[]>([])
  const [selectedArtist, setSelectedArtist] = useState<ArtistResult | null>(null)
  const debouncedArtistQuery = useDebounce(artistQuery, 300)

  // Whether the field currently holds a search term rather than a settled value.
  // Without this the box searches for text the user never typed: arriving from Discogs
  // seeds artistQuery with the artist's name, so the search fires on mount and offers
  // a dropdown containing the one name already in the field. It also reopens after a
  // pick, because selecting sets the query to the chosen name and the debounce then
  // searches for that. Only typing should open the dropdown.
  const [artistIsSearch, setArtistIsSearch] = useState(false)

  const [selectedGenres, setSelectedGenres] = useState<number[]>(initialValues?.genreIds ?? [])
  const [pending, setPending] = useState(false)

  // Set when the release is already owned or already wanted; the submitted FormData is
  // held aside so confirming can resend it verbatim rather than re-reading the form.
  const [duplicate, setDuplicate] = useState<ReleaseHoldings | null>(null)
  const pendingSubmission = useRef<FormData | null>(null)

  const {
    coverImageUrl,
    retrieving: retrievingImage,
    error: imageError,
    retrieve: retrieveCoverImage,
  } = useCoverImageRetrieval(initialValues?.coverImageUrl ?? null)

  const artistDropdownRef = useRef<HTMLDivElement>(null)

  // Search artists
  useEffect(() => {
    if (!artistIsSearch || debouncedArtistQuery.length < 2) return
    fetch(`/api/artists/search?q=${encodeURIComponent(debouncedArtistQuery)}`)
      .then((r) => r.json())
      .then(setArtistResults)
  }, [debouncedArtistQuery, artistIsSearch])

  // Hidden by derivation rather than by clearing state inside the effect above, which
  // would cascade an extra render.
  const visibleArtistResults =
    !artistIsSearch || debouncedArtistQuery.length < 2 ? [] : artistResults

  // Close dropdowns on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (artistDropdownRef.current && !artistDropdownRef.current.contains(e.target as Node)) {
        setArtistResults([])
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function selectArtist(a: ArtistResult) {
    setSelectedArtist(a)
    setArtistQuery(a.name)
    setArtistResults([])
    // The name is now a settled value, so the pending debounce must not search for it.
    setArtistIsSearch(false)
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
    const result = await createWishlistItem(data)
    // Only comes back when the release is already owned or wanted — otherwise it redirects.
    if (result?.duplicate) {
      pendingSubmission.current = data
      setDuplicate(result.duplicate)
    }
    setPending(false)
  }

  async function confirmDuplicate() {
    const data = pendingSubmission.current
    if (!data) return
    setPending(true)
    data.set('confirmDuplicate', 'true')
    await createWishlistItem(data)
    setPending(false)
  }

  function cancelDuplicate() {
    pendingSubmission.current = null
    setDuplicate(null)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">

      {/* ── Release section ── */}
      <section className="space-y-4">
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
            <Link
              href="/wishlist/search"
              className="text-sm text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
            >
              Change
            </Link>
            <input type="hidden" name="releaseId" value={selectedRelease.releaseId} />
          </div>
        ) : (
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">New release</p>
              <Link
                href="/wishlist/search"
                className="text-sm text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
              >
                Cancel
              </Link>
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
                    onClick={() => retrieveCoverImage(releaseTitle, artistQuery)}
                    disabled={retrievingImage}
                    className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 underline disabled:opacity-50"
                  >
                    {retrievingImage ? 'Retrieving…' : 'Retrieve cover image'}
                  </button>
                </div>
              )}
              <CoverImageErrorNotice error={imageError} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className={labelClass}>Title</label>
                <input name="newReleaseTitle" required className={inputClass} defaultValue={releaseTitle} />
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
                onChange={(e) => { setArtistQuery(e.target.value); setSelectedArtist(null); setArtistIsSearch(true) }}
                required
              />
              {/* Hidden inputs for server action */}
              {selectedArtist && <input type="hidden" name="newArtistId" value={selectedArtist.artistId} />}
              <input type="hidden" name="newArtistName" value={artistQuery} />

              {visibleArtistResults.length > 0 && (
                <div className={dropdownClass}>
                  {visibleArtistResults.map((a) => (
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
        )}
      </section>

      {/* ── Pressing details ── */}
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
          </div>

          <div>
            <label className={labelClass}>Notes</label>
            <textarea name="notes" rows={3} className={inputClass} placeholder="What you're looking for, price ceiling, condition preferences…" />
          </div>
        </section>

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

      {duplicate && (
        <DuplicateWishlistDialog
          duplicate={duplicate}
          pending={pending}
          onConfirm={confirmDuplicate}
          onCancel={cancelDuplicate}
        />
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
