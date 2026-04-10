'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'

type Artist = { artistId: number; name: string }
type Format = { formatId: number; name: string }
type Genre = { genreId: number; name: string }

type Props = {
  artists: Artist[]
  formats: Format[]
  genres: Genre[]
}

export default function FilterPanel({ artists, formats, genres }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const artistId = searchParams.get('artistId') ?? ''
  const formatId = searchParams.get('formatId') ?? ''
  const genreId = searchParams.get('genreId') ?? ''

  const updateParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value) {
        params.set(key, value)
      } else {
        params.delete(key)
      }
      router.push(`/pressings?${params.toString()}`)
    },
    [router, searchParams]
  )

  const hasFilters = artistId || formatId || genreId

  return (
    <div className="flex flex-wrap items-center gap-3">
      <select
        value={artistId}
        onChange={(e) => updateParam('artistId', e.target.value)}
        className={selectClass(!!artistId)}
      >
        <option value="">All artists</option>
        {artists.map((a) => (
          <option key={a.artistId} value={a.artistId}>{a.name}</option>
        ))}
      </select>

      <select
        value={formatId}
        onChange={(e) => updateParam('formatId', e.target.value)}
        className={selectClass(!!formatId)}
      >
        <option value="">All formats</option>
        {formats.map((f) => (
          <option key={f.formatId} value={f.formatId}>{f.name}</option>
        ))}
      </select>

      <select
        value={genreId}
        onChange={(e) => updateParam('genreId', e.target.value)}
        className={selectClass(!!genreId)}
      >
        <option value="">All genres</option>
        {genres.map((g) => (
          <option key={g.genreId} value={g.genreId}>{g.name}</option>
        ))}
      </select>

      {hasFilters && (
        <button
          onClick={() => router.push('/pressings')}
          className="text-sm text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
        >
          Clear filters
        </button>
      )}
    </div>
  )
}

function selectClass(active: boolean) {
  return [
    'rounded-full border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500 transition-colors',
    active
      ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-900'
      : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300',
  ].join(' ')
}
