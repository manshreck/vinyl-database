import { requireSession } from '@/lib/session'
import { searchDiscogsReleases, type DiscogsSearchResult } from '@/lib/discogs'
import Image from 'next/image'
import Link from 'next/link'
import { Suspense } from 'react'
import DiscogsSearchForm from './DiscogsSearchForm'

type SearchParams = Promise<{ q?: string }>

export default async function DiscogsSearchPage({ searchParams }: { searchParams: SearchParams }) {
  await requireSession()

  const { q } = await searchParams
  const hasSearch = !!q

  let results: DiscogsSearchResult[] = []
  let searchError: string | null = null

  if (hasSearch) {
    try {
      results = await searchDiscogsReleases(q)
    } catch (err) {
      searchError = err instanceof Error ? err.message : 'Discogs search failed.'
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-6">
          <Link
            href="/"
            className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
          >
            ← Home
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
            Search Discogs
          </h1>
        </div>

        <div className="mb-8 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
          <Suspense>
            <DiscogsSearchForm />
          </Suspense>
        </div>

        {searchError && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950 px-4 py-3 text-sm text-red-700 dark:text-red-300">
            {searchError}
          </div>
        )}

        {hasSearch && !searchError && (
          <>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-3">
              {results.length === 0
                ? 'No results.'
                : `Showing ${results.length} result${results.length === 1 ? '' : 's'}`}
            </p>

            <div className="space-y-3">
              {results.map((r) => (
                <Link
                  key={r.id}
                  href={`/discogs/${r.id}${q ? `?q=${encodeURIComponent(q)}` : ''}`}
                  className="flex items-center gap-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 hover:border-zinc-400 dark:hover:border-zinc-600 hover:shadow-sm transition-all"
                >
                  {r.thumb ? (
                    <Image
                      src={r.thumb}
                      alt=""
                      width={56}
                      height={56}
                      className="rounded-md object-cover flex-shrink-0"
                      unoptimized
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-md bg-zinc-100 dark:bg-zinc-800 flex-shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="font-medium text-zinc-900 dark:text-zinc-50 truncate">
                      {r.title}
                      {r.year && <span className="ml-2 text-sm text-zinc-400">({r.year})</span>}
                    </p>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 truncate">
                      {[r.formats.join(', '), r.country, r.label].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
