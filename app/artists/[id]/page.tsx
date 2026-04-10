import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { notFound } from 'next/navigation'

const conditionLabel: Record<string, string> = {
  P: 'P', FR: 'FR', G: 'G',
  G_PLUS: 'G+', VG_MINUS: 'VG-', VG: 'VG',
  VG_PLUS: 'VG+', NM: 'NM', M: 'M', S: 'S',
}

export default async function ArtistPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const artistId = Number(id)

  const artist = await prisma.artist.findUnique({
    where: { artistId },
    include: {
      releases: {
        include: {
          release: {
            include: {
              pressings: {
                include: { format: true },
                orderBy: { pressingYear: 'asc' },
              },
              genres: {
                include: { genre: true },
                orderBy: { genreOrder: 'asc' },
              },
              artists: {
                include: { artist: true },
                orderBy: { artistOrder: 'asc' },
              },
            },
          },
        },
        orderBy: { release: { originalReleaseYear: 'asc' } },
      },
    },
  })

  if (!artist) notFound()

  const releases = artist.releases.map((ra) => ra.release)

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="max-w-4xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="mb-8">
          <Link
            href="/pressings"
            className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
          >
            ← Collection
          </Link>
          <h1 className="mt-2 text-3xl font-semibold text-zinc-900 dark:text-zinc-50">
            {artist.name}
          </h1>
          {artist.sortName !== artist.name && (
            <p className="mt-1 text-sm text-zinc-400">Sorted as: {artist.sortName}</p>
          )}
          <p className="mt-1 text-sm text-zinc-500">
            {releases.length} {releases.length === 1 ? 'release' : 'releases'} · {' '}
            {releases.reduce((sum, r) => sum + r.pressings.length, 0)} {' '}
            {releases.reduce((sum, r) => sum + r.pressings.length, 0) === 1 ? 'pressing' : 'pressings'} in collection
          </p>
        </div>

        {/* Releases */}
        <div className="space-y-6">
          {releases.map((release) => {
            const genres = release.genres.map((rg) => rg.genre.name).join(', ')
            const collaborators = release.artists
              .filter((ra) => ra.artist.artistId !== artistId)
              .map((ra) => ra.artist.name)

            return (
              <div
                key={release.releaseId}
                className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden"
              >
                {/* Release header */}
                <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">
                        {release.title}
                      </h2>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                        <span className="text-sm text-zinc-500">{release.originalReleaseYear}</span>
                        {collaborators.length > 0 && (
                          <span className="text-sm text-zinc-400">
                            with {collaborators.join(', ')}
                          </span>
                        )}
                        {genres && (
                          <span className="text-xs text-zinc-400">{genres}</span>
                        )}
                      </div>
                    </div>
                    <Link
                      href={`/releases/${release.releaseId}/edit?returnTo=/artists/${artistId}`}
                      className="shrink-0 text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                    >
                      Edit release
                    </Link>
                  </div>
                </div>

                {/* Pressings for this release */}
                {release.pressings.length === 0 ? (
                  <p className="px-5 py-3 text-sm text-zinc-400">No pressings in collection.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-zinc-50 dark:bg-zinc-950 text-zinc-500 text-left">
                      <tr>
                        <th className="px-5 py-2 font-medium">Format</th>
                        <th className="px-5 py-2 font-medium">Year</th>
                        <th className="px-5 py-2 font-medium">Label / Catalog</th>
                        <th className="px-5 py-2 font-medium">Condition</th>
                        <th className="px-5 py-2 font-medium">Value</th>
                        <th className="px-5 py-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {release.pressings.map((pressing) => {
                        const labelCatalog = [pressing.label, pressing.catalogNumber]
                          .filter(Boolean)
                          .join(' / ')

                        return (
                          <tr
                            key={pressing.pressingId}
                            className="hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                          >
                            <td className="px-5 py-2.5 text-zinc-700 dark:text-zinc-300">
                              {pressing.format.name}
                              {pressing.vinylColor && (
                                <span className="ml-2 inline-flex items-center rounded-full bg-violet-100 dark:bg-violet-900 px-2 py-0.5 text-xs text-violet-700 dark:text-violet-300">
                                  {pressing.vinylColor}
                                </span>
                              )}
                            </td>
                            <td className="px-5 py-2.5 text-zinc-700 dark:text-zinc-300">
                              {pressing.pressingYear ?? '—'}
                            </td>
                            <td className="px-5 py-2.5 text-zinc-700 dark:text-zinc-300 font-mono text-xs">
                              {labelCatalog || '—'}
                            </td>
                            <td className="px-5 py-2.5">
                              <span className="inline-flex items-center rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:text-zinc-300">
                                {conditionLabel[pressing.recordCondition]}
                              </span>
                            </td>
                            <td className="px-5 py-2.5 text-zinc-700 dark:text-zinc-300">
                              {pressing.currentValue != null
                                ? `$${Number(pressing.currentValue).toFixed(2)}`
                                : '—'}
                            </td>
                            <td className="px-5 py-2.5 text-right">
                              <Link
                                href={`/pressings/${pressing.pressingId}`}
                                className="text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 mr-3"
                              >
                                View
                              </Link>
                              <Link
                                href={`/pressings/${pressing.pressingId}/edit`}
                                className="text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                              >
                                Edit
                              </Link>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
