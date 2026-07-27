'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import DiscogsTokenNotice from '@/app/components/DiscogsTokenNotice'

type Props = {
  hasDiscogsToken: boolean
}

export default function PressingSearchLauncher({ hasDiscogsToken }: Props) {
  const router = useRouter()
  const [discogsQuery, setDiscogsQuery] = useState('')
  const [releaseQuery, setReleaseQuery] = useState('')

  function goToDiscogsSearch() {
    const q = discogsQuery.trim()
    router.push(`/discogs${q ? `?q=${encodeURIComponent(q)}` : ''}`)
  }

  function goToReleaseSearch() {
    const q = releaseQuery.trim()
    router.push(`/releases${q ? `?q=${encodeURIComponent(q)}` : ''}`)
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="mb-6">
          <div className="flex items-center gap-3">
            <Image
              src="/add-record.png"
              alt=""
              width={56}
              height={56}
              className="h-14 w-14 object-contain"
            />
            <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
              Add Record
            </h1>
          </div>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            You can search Discogs for a particular release/pressing or search for an existing release within your collection from which to add a new pressing.
            <br />
            <br />
            Each search will produce a list of matches from which you can select a particular title to pre-populate a New Pressing form.
          </p>
        </div>

        <div>
          <label className={labelClass}>Search for Release/Pressing on Discogs.</label>
          {!hasDiscogsToken && <DiscogsTokenNotice />}
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

          <h2 className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-700 text-sm font-medium text-zinc-900 dark:text-zinc-50">
            Search for Existing Release in Collection
          </h2>
          <div className="flex items-center gap-2">
            <input
              className={inputClass}
              placeholder="Search by title…"
              value={releaseQuery}
              onChange={(e) => setReleaseQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); goToReleaseSearch() } }}
            />
            <button
              type="button"
              onClick={goToReleaseSearch}
              className="rounded-full border border-zinc-200 dark:border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors whitespace-nowrap"
            >
              Search
            </button>
          </div>

          <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-700">
            <p className="mb-3 text-sm text-zinc-500 dark:text-zinc-400">
              You may also choose to enter the information about the new record manually using the Add Record Manually button.
            </p>
            <Link
              href="/pressings/new"
              className="inline-block rounded-full border border-zinc-200 dark:border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              + Add Record Manually
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

const labelClass = 'block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1'
const inputClass =
  'w-full rounded-lg border bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-500 border-zinc-200 dark:border-zinc-700'
