'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

export default function DiscogsSearchForm() {
  const router = useRouter()
  const searchParams = useSearchParams()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    const q = (data.get('q') as string).trim()
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    router.push(`/discogs?${params.toString()}`)
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-4">
      <input
        name="q"
        className="flex-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-500"
        placeholder="e.g. Kind of Blue, Miles Davis"
        defaultValue={searchParams.get('q') ?? ''}
        autoFocus
      />
      <button
        type="submit"
        className="rounded-full bg-zinc-900 px-6 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors whitespace-nowrap"
      >
        Search
      </button>
      <Link
        href="/discogs"
        className="text-sm text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 whitespace-nowrap"
      >
        Clear
      </Link>
    </form>
  )
}
