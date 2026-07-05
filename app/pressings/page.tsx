import { getTenantPrisma } from '@/lib/prisma'
import { requireSession } from '@/lib/session'
import { artistSortKey } from '@/lib/artistSort'
import Link from 'next/link'
import { Suspense } from 'react'
import FilterPanel from './FilterPanel'
import ConditionInfo from './ConditionInfo'

const conditionLabel: Record<string, string> = {
  P: 'P',
  FR: 'FR',
  G: 'G',
  G_PLUS: 'G+',
  VG_MINUS: 'VG-',
  VG: 'VG',
  VG_PLUS: 'VG+',
  NM: 'NM',
  M: 'M',
  S: 'S',
}

type SearchParams = Promise<{ artistId?: string; formatId?: string; genreId?: string }>

export default async function PressingsPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireSession()
  const prisma = await getTenantPrisma(session.databaseName)

  const { artistId, formatId, genreId } = await searchParams

  const [pressings, artists, formats, genres] = await Promise.all([
    prisma.pressing.findMany({
      where: {
        ...(formatId && { formatId: Number(formatId) }),
        ...(artistId && {
          release: { artists: { some: { artistId: Number(artistId) } } },
        }),
        ...(genreId && {
          release: { genres: { some: { genreId: Number(genreId) } } },
        }),
      },
      include: {
        release: {
          include: {
            artists: {
              include: { artist: true },
              orderBy: { artistOrder: 'asc' },
            },
          },
        },
        format: true,
      },
      orderBy: [{ pressingYear: 'asc' }],
    }),
    prisma.artist.findMany({ orderBy: { sortName: 'asc' } }),
    prisma.format.findMany({ orderBy: { name: 'asc' } }),
    prisma.genre.findMany({ orderBy: { name: 'asc' } }),
  ])

  pressings.sort((a, b) => {
    const aSortName = a.release.artists[0]?.artist.sortName ?? ''
    const bSortName = b.release.artists[0]?.artist.sortName ?? ''
    const artistCmp = artistSortKey(aSortName).localeCompare(artistSortKey(bSortName))
    if (artistCmp !== 0) return artistCmp
    const titleCmp = a.release.title.localeCompare(b.release.title)
    if (titleCmp !== 0) return titleCmp
    return (a.pressingYear ?? 0) - (b.pressingYear ?? 0)
  })

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-2">
          <Link
            href="/"
            className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
          >
            ← Home
          </Link>
        </div>
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
            Record Collection
          </h1>
          <div className="flex items-center gap-3">
            <Link
              href="/wishlist"
              className="rounded-full border border-zinc-200 dark:border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              Wishlist
            </Link>
            <Link
              href="/search"
              className="rounded-full border border-zinc-200 dark:border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              Search
            </Link>
            <Link
              href="/insurance"
              className="rounded-full border border-zinc-200 dark:border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              Insurance report
            </Link>
            <Link
              href="/pressings/new"
              className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
            >
              Add record
            </Link>
          </div>
        </div>

        <div className="mb-6">
          <Suspense>
            <FilterPanel artists={artists} formats={formats} genres={genres} />
          </Suspense>
        </div>

        {pressings.length === 0 ? (
          <p className="text-zinc-500 dark:text-zinc-400">
            No records match the current filters.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">Title</th>
                  <th className="px-4 py-3 font-medium">Artist</th>
                  <th className="px-4 py-3 font-medium">Format</th>
                  <th className="px-4 py-3 font-medium">Pressing Year</th>
                  <th className="px-4 py-3 font-medium">Label</th>
                  <th className="px-4 py-3 font-medium">Catalog #</th>
                  <th className="px-4 py-3 font-medium">
                    Condition<ConditionInfo />
                  </th>
                  <th className="px-4 py-3 font-medium">Value</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {pressings.map((pressing) => {
                  return (
                    <tr
                      key={pressing.pressingId}
                      className="bg-white dark:bg-zinc-950 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-50">
                        <Link
                          href={`/pressings/${pressing.pressingId}`}
                          className="hover:underline"
                        >
                          {pressing.release.title}
                        </Link>
                        <span className="ml-2 text-xs text-zinc-400">
                          ({pressing.release.originalReleaseYear})
                        </span>
                      </td>
                      <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                        {pressing.release.artists.map((ra, i) => (
                          <span key={ra.artist.artistId}>
                            {i > 0 && ', '}
                            <Link href={`/artists/${ra.artist.artistId}`} className="hover:underline">
                              {ra.artist.name}
                            </Link>
                          </span>
                        ))}
                      </td>
                      <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                        {pressing.format.name}
                      </td>
                      <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                        {pressing.pressingYear ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                        {pressing.label ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300 font-mono text-xs">
                        {pressing.catalogNumber ?? '—'}
                        {pressing.vinylColor && (
                          <span className="ml-2 font-sans inline-flex items-center rounded-full bg-violet-100 dark:bg-violet-900 px-2 py-0.5 text-xs text-violet-700 dark:text-violet-300">
                            {pressing.vinylColor}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:text-zinc-300">
                          {conditionLabel[pressing.recordCondition]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                        {pressing.currentValue != null
                          ? `$${Number(pressing.currentValue).toFixed(2)}`
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/pressings/${pressing.pressingId}/edit`}
                          className="text-sm text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                        >
                          Edit
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
