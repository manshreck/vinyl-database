'use client'

import { useState } from 'react'
import { updateRelease } from '@/app/actions/updateRelease'

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

export default function EditReleaseForm({ release, allGenres, returnTo }: Props) {
  const [pending, setPending] = useState(false)
  const currentGenreIds = release.genres.map((rg) => rg.genre.genreId)
  const [selectedGenres, setSelectedGenres] = useState<number[]>(currentGenreIds)

  function toggleGenre(id: number) {
    setSelectedGenres((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]
    )
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setPending(true)
    const data = new FormData(e.currentTarget)
    await updateRelease(release.releaseId, returnTo, data)
  }

  const sortedArtists = [...release.artists].sort((a, b) => a.artistOrder - b.artistOrder)

  return (
    <form onSubmit={handleSubmit} className="space-y-8">

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
          <label className={labelClass}>Cover image URL</label>
          <input
            name="coverImageUrl"
            className={inputClass}
            placeholder="https://…"
            defaultValue={release.coverImageUrl ?? ''}
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
