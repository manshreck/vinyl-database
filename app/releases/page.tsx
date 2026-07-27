import { getTenantPrisma } from '@/lib/prisma'
import { requireSession } from '@/lib/session'
import Image from 'next/image'
import Link from 'next/link'
import { Suspense } from 'react'
import ReleaseSearchForm from './ReleaseSearchForm'

type SearchParams = Promise<{ q?: string }>

export default async function ReleaseSearchPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireSession()
  const prisma = await getTenantPrisma(session.databaseName)

  const { q } = await searchParams
  const hasSearch = !!q

  const releases = hasSearch
    ? await prisma.release.findMany({
        where: {
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { notes: { contains: q, mode: 'insensitive' } },
            { artists: { some: { artist: { name: { contains: q, mode: 'insensitive' } } } } },
            { genres: { some: { genre: { name: { contains: q, mode: 'insensitive' } } } } },
          ],
        },
        include: {
          artists: { include: { artist: true }, orderBy: { artistOrder: 'asc' } },
          genres: { include: { genre: true } },
        },
        orderBy: { title: 'asc' },
        take: 25,
      })
    : []

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
            Search Collection
          </h1>
        </div>

        <div className="mb-8 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
          <Suspense>
            <ReleaseSearchForm />
          </Suspense>
        </div>

        {hasSearch && (
          <>
            {releases.length > 0 && (
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-3">
                Your collection already contains at least one copy of the listed releases below. Select any of the following Releases to add a new unique pressing of that release to your collection.
              </p>
            )}

            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-3">
              {releases.length === 0
                ? 'No results.'
                : `Showing ${releases.length} result${releases.length === 1 ? '' : 's'}`}
            </p>

            <div className="space-y-3">
              {releases.map((r) => (
                <Link
                  key={r.releaseId}
                  href={`/pressings/new?releaseId=${r.releaseId}`}
                  className="flex items-center gap-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 hover:border-zinc-400 dark:hover:border-zinc-600 hover:shadow-sm transition-all"
                >
                  {r.coverImageUrl ? (
                    <Image
                      src={r.coverImageUrl}
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
                      <span className="ml-2 text-sm text-zinc-400">({r.originalReleaseYear})</span>
                    </p>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 truncate">
                      {[
                        r.artists.map((a) => a.artist.name).join(', '),
                        r.genres.map((g) => g.genre.name).join(', '),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                </Link>
              ))}
            </div>

            <div className="mt-6 pt-6 border-t border-zinc-200 dark:border-zinc-800">
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-3">
                If none of these pressings suffice, you can simply create a new pressing from scratch.
              </p>
              <Link
                href={`/pressings/new?title=${encodeURIComponent(q)}`}
                className="inline-block rounded-full border border-zinc-200 dark:border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                + Create New Pressing
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
