'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'

export default function SearchForm() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [useRegex, setUseRegex] = useState(searchParams.get('regex') === '1')

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    const params = new URLSearchParams()

    for (const [key, value] of data.entries()) {
      if (typeof value === 'string' && value.trim()) {
        params.set(key, value.trim())
      }
    }

    if (useRegex) params.set('regex', '1')

    router.push(`/search?${params.toString()}`)
  }

  const titlePlaceholder = useRegex
    ? 'e.g. ^Kind of Blue$  or  blue|green'
    : 'e.g. Kind*  or  *Blue*'

  const artistPlaceholder = useRegex
    ? 'e.g. ^Miles|Coltrane'
    : 'e.g. Miles*  or  *Davis*'

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Regex toggle */}
      <div className="flex items-center gap-2">
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            className="sr-only peer"
            checked={useRegex}
            onChange={(e) => setUseRegex(e.target.checked)}
          />
          <div className="w-9 h-5 rounded-full bg-zinc-200 dark:bg-zinc-700 peer-checked:bg-zinc-900 dark:peer-checked:bg-zinc-100 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:dark:bg-zinc-900 after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4" />
        </label>
        <span className="text-sm text-zinc-600 dark:text-zinc-400">
          {useRegex ? 'Regex mode (PostgreSQL)' : 'Wildcard mode (* = any sequence, ? = any character)'}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Title</label>
          <input
            name="title"
            className={inputClass}
            defaultValue={searchParams.get('title') ?? ''}
            placeholder={titlePlaceholder}
          />
        </div>

        <div>
          <label className={labelClass}>Artist</label>
          <input
            name="artist"
            className={inputClass}
            defaultValue={searchParams.get('artist') ?? ''}
            placeholder={artistPlaceholder}
          />
        </div>

        <div>
          <label className={labelClass}>Release year</label>
          <input
            name="year"
            className={inputClass}
            defaultValue={searchParams.get('year') ?? ''}
            placeholder={useRegex ? 'e.g. 196[0-9]  or  ^197' : 'e.g. 1969'}
          />
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button
          type="submit"
          className="rounded-full bg-zinc-900 px-6 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
        >
          Search
        </button>
        <a
          href="/search"
          className="text-sm text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
        >
          Clear
        </a>
      </div>
    </form>
  )
}

const labelClass = 'block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1'
const inputClass =
  'w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-500'
