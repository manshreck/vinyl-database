'use client'

import { useActionState, useRef, useState } from 'react'
import Image from 'next/image'
import { updateRelease, type FormState } from '@/app/actions/updateRelease'

type Artist = { artistId: number; name: string; sortName: string }
type Genre = { genreId: number; name: string }

type Release = {
  releaseId: number
  title: string
  originalReleaseYear: number
  notes: string | null
  coverImageUrl: string | null
  artists: Array<{ artist: Artist; artistOrder: number }>
  genres: Array<{ genre: Genre; genreOrder: number }>
}

type Props = {
  release: Release
  allGenres: Genre[]
  returnTo: string
}

const initialState: FormState = null

export default function EditReleaseForm({ release, allGenres, returnTo }: Props) {
  const [state, formAction, pending] = useActionState(
    updateRelease.bind(null, release.releaseId, returnTo),
    initialState
  )
  const currentGenreIds = release.genres.map((rg) => rg.genre.genreId)
  const [selectedGenres, setSelectedGenres] = useState<number[]>(currentGenreIds)

  const [coverImageUrl, setCoverImageUrl] = useState(release.coverImageUrl ?? '')
  const [retrievingImage, setRetrievingImage] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  function toggleGenre(id: number) {
    setSelectedGenres((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]
    )
  }

  const sortedArtists = [...release.artists].sort((a, b) => a.artistOrder - b.artistOrder)

  async function retrieveCoverImage() {
    setRetrievingImage(true)
    setImageError(null)
    try {
      const formData = new FormData(formRef.current as HTMLFormElement)
      const title = (formData.get('title') as string) ?? ''
      const primaryArtistId = sortedArtists[0]?.artist.artistId
      const artist = primaryArtistId ? (formData.get(`name[${primaryArtistId}]`) as string) ?? '' : ''
      const params = new URLSearchParams({ title, artist })
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

  return (
    <form ref={formRef} action={formAction} className="space-y-8">
      {state?.error && (
        <p className="rounded-lg bg-red-50 dark:bg-red-950 px-4 py-2 text-sm text-red-700 dark:text-red-300">
          {state.error}
        </p>
      )}

      {/* Release fields */}
      <section className="space-y-4">
        <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">Release</h2>

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className={labelClass}>Title</label>
            <input name="title" required className={inputClass} defaultValue={release.title} />
          </div>

          <div>
            <label className={labelClass}>Original release year</label>
            <input
              name="originalReleaseYear"
              type="number"
              min={1877}
              max={2200}
              required
              className={inputClass}
              defaultValue={release.originalReleaseYear}
            />
          </div>
        </div>

        <div>
          <label className={labelClass}>Notes</label>
          <textarea
            name="notes"
            rows={2}
            className={inputClass}
            defaultValue={release.notes ?? ''}
          />
        </div>

        <div>
          <label className={labelClass}>Cover image</label>
          <div className="flex items-center gap-4 mb-2">
            {isLikelyUrl(coverImageUrl) ? (
              <Image
                src={coverImageUrl}
                alt=""
                width={96}
                height={96}
                className="rounded-lg object-cover flex-shrink-0"
                unoptimized
              />
            ) : (
              <div className="h-24 w-24 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex-shrink-0" />
            )}
            <div>
              <button
                type="button"
                onClick={retrieveCoverImage}
                disabled={retrievingImage}
                className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 underline disabled:opacity-50"
              >
                {retrievingImage ? 'Retrieving…' : 'Retrieve cover image'}
              </button>
              {imageError && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{imageError}</p>}
            </div>
          </div>
          <label className={labelClass}>Replace cover image URL</label>
          <input
            name="coverImageUrl"
            className={inputClass}
            placeholder="https://…"
            value={coverImageUrl}
            onChange={(e) => setCoverImageUrl(e.target.value)}
          />
        </div>
      </section>

      {/* Artist fields */}
      <section className="space-y-4">
        <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
          {sortedArtists.length === 1 ? 'Artist' : 'Artists'}
        </h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Sort name is used for alphabetical ordering (e.g. "Davis, Miles" or "Beatles, The").
          Articles like The, A, and An are automatically ignored when sorting.
        </p>

        {sortedArtists.map(({ artist }) => (
          <div
            key={artist.artistId}
            className="grid grid-cols-2 gap-4 rounded-lg border border-zinc-200 dark:border-zinc-700 p-4"
          >
            <input type="hidden" name="artistIds" value={artist.artistId} />
            <div>
              <label className={labelClass}>Display name</label>
              <input
                name={`name[${artist.artistId}]`}
                required
                className={inputClass}
                defaultValue={artist.name}
              />
            </div>
            <div>
              <label className={labelClass}>Sort name</label>
              <input
                name={`sortName[${artist.artistId}]`}
                className={inputClass}
                defaultValue={artist.sortName}
                placeholder="e.g. Davis, Miles"
              />
            </div>
          </div>
        ))}
      </section>

      {/* Genre checkboxes */}
      <section className="space-y-3">
        <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">Genres</h2>
        <div className="flex flex-wrap gap-2">
          {allGenres.map((g) => (
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
      </section>

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-zinc-900 px-6 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save release'}
        </button>
        <a
          href={returnTo}
          className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
        >
          Cancel
        </a>
      </div>
    </form>
  )
}

const labelClass = 'block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1'
const inputClass =
  'w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-500'

/** Avoids handing next/image a half-typed URL (e.g. "https:") while the user is still typing. */
function isLikelyUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}
