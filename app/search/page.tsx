import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import Link from 'next/link'
import { Suspense } from 'react'
import SearchForm from './SearchForm'

const conditionLabel: Record<string, string> = {
  P: 'P', FR: 'FR', G: 'G',
  G_PLUS: 'G+', VG_MINUS: 'VG-', VG: 'VG',
  VG_PLUS: 'VG+', NM: 'NM', M: 'M', S: 'S',
}

type ResultRow = {
  pressingId: number
  title: string
  originalReleaseYear: number
  artists: string | null
  formatName: string
  pressingYear: number | null
  label: string | null
  catalogNumber: string | null
  recordCondition: string
  vinylColor: string | null
}

type SearchParams = Promise<{
  title?: string
  artist?: string
  year?: string
  regex?: string
}>

// Converts wildcard pattern (* ?) into a PostgreSQL regex string.
// Other regex metacharacters are escaped so they are treated as literals.
function wildcardToRegex(pattern: string): string {
  return pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&') // escape regex special chars
    .replace(/\*/g, '.*')                   // * → any sequence
    .replace(/\?/g, '.')                    // ? → any single char
}

export default async function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  const { title, artist, year, regex } = await searchParams

  const useRegex = regex === '1'
  const hasSearch = title || artist || year

  let results: ResultRow[] = []
  let searchError: string | null = null

  if (hasSearch) {
    // In regex mode use the pattern as-is; in wildcard mode wrap in .* for substring matching
    const titlePattern = title
      ? (useRegex ? title : `.*${wildcardToRegex(title)}.*`)
      : null
    const artistPattern = artist
      ? (useRegex ? artist : `.*${wildcardToRegex(artist)}.*`)
      : null

    // Optional clauses
    const titleCond = titlePattern
      ? Prisma.sql`AND r.title ~* ${titlePattern}`
      : Prisma.empty

    // Year: in regex mode, match against the year cast to text; otherwise exact match
    const yearCond = year
      ? useRegex
        ? Prisma.sql`AND r.original_release_year::text ~* ${year}`
        : Prisma.sql`AND r.original_release_year = ${parseInt(year)}`
      : Prisma.empty

    // Artist filter: JOIN a subquery so multi-artist releases match correctly
    const artistJoin = artistPattern
      ? Prisma.sql`
          JOIN (
            SELECT DISTINCT ra2.release_id
            FROM release_artists ra2
            JOIN artists a2 ON ra2.artist_id = a2.artist_id
            WHERE a2.name ~* ${artistPattern}
          ) af ON r.release_id = af.release_id`
      : Prisma.empty

    try {
      results = await prisma.$queryRaw<ResultRow[]>(Prisma.sql`
        SELECT
          p.pressing_id::int                   AS "pressingId",
          r.title,
          r.original_release_year::int         AS "originalReleaseYear",
          (
            SELECT string_agg(a.name, ', ' ORDER BY ra.artist_order)
            FROM release_artists ra
            JOIN artists a ON ra.artist_id = a.artist_id
            WHERE ra.release_id = r.release_id
          )                                    AS artists,
          f.name                               AS "formatName",
          p.pressing_year::int                 AS "pressingYear",
          p.label,
          p.catalog_number                     AS "catalogNumber",
          p.record_condition                   AS "recordCondition",
          p.vinyl_color                        AS "vinylColor"
        FROM pressings p
        JOIN releases r ON p.release_id = r.release_id
        JOIN formats f  ON p.format_id  = f.format_id
        ${artistJoin}
        WHERE 1=1
        ${titleCond}
        ${yearCond}
        ORDER BY r.title ASC, p.pressing_year ASC NULLS LAST
      `)
    } catch (err) {
      // Most likely an invalid regex pattern
      searchError = err instanceof Error ? err.message : 'Invalid search pattern'
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="max-w-5xl mx-auto px-4 py-8">

        <div className="mb-6">
          <Link
            href="/pressings"
            className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
          >
            ← Collection
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
            Search
          </h1>
        </div>

        <div className="mb-8 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
          <Suspense>
            <SearchForm />
          </Suspense>
        </div>

        {searchError && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950 px-4 py-3 text-sm text-red-700 dark:text-red-300">
            <strong>Invalid pattern:</strong> {searchError}
          </div>
        )}

        {hasSearch && !searchError && (
          <>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-3">
              {results.length === 0
                ? 'No results.'
                : `${results.length} result${results.length === 1 ? '' : 's'}`}
            </p>

            {results.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
                <table className="w-full text-sm">
                  <thead className="bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 text-left">
                    <tr>
                      <th className="px-4 py-3 font-medium">Title</th>
                      <th className="px-4 py-3 font-medium">Artist</th>
                      <th className="px-4 py-3 font-medium">Format</th>
                      <th className="px-4 py-3 font-medium">Pressing Year</th>
                      <th className="px-4 py-3 font-medium">Label / Catalog</th>
                      <th className="px-4 py-3 font-medium">Condition</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {results.map((row) => (
                      <tr
                        key={row.pressingId}
                        className="bg-white dark:bg-zinc-950 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
                      >
                        <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-50">
                          <Link
                            href={`/pressings/${row.pressingId}`}
                            className="hover:underline"
                          >
                            {row.title}
                          </Link>
                          <span className="ml-2 text-xs text-zinc-400">
                            ({row.originalReleaseYear})
                          </span>
                        </td>
                        <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                          {row.artists ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                          {row.formatName}
                          {row.pressingYear && (
                            <span className="ml-1 text-zinc-400">{row.pressingYear}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                          {row.pressingYear ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300 font-mono text-xs">
                          {[row.label, row.catalogNumber].filter(Boolean).join(' / ') || '—'}
                          {row.vinylColor && (
                            <span className="ml-2 font-sans inline-flex items-center rounded-full bg-violet-100 dark:bg-violet-900 px-2 py-0.5 text-xs text-violet-700 dark:text-violet-300">
                              {row.vinylColor}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:text-zinc-300">
                            {conditionLabel[row.recordCondition] ?? row.recordCondition}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
