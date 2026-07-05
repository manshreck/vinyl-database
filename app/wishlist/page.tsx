import { getTenantPrisma } from '@/lib/prisma'
import { requireSession } from '@/lib/session'
import { artistSortKey } from '@/lib/artistSort'
import Link from 'next/link'

export default async function WishlistPage() {
  const session = await requireSession()
  const prisma = await getTenantPrisma(session.databaseName)

  const items = await prisma.wishlistItem.findMany({
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
  })

  items.sort((a, b) => {
    const aSortName = a.release.artists[0]?.artist.sortName ?? ''
    const bSortName = b.release.artists[0]?.artist.sortName ?? ''
    const artistCmp = artistSortKey(aSortName).localeCompare(artistSortKey(bSortName))
    if (artistCmp !== 0) return artistCmp
    return a.release.title.localeCompare(b.release.title)
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
            Wishlist
          </h1>
          <div className="flex items-center gap-3">
            <Link
              href="/pressings"
              className="rounded-full border border-zinc-200 dark:border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              Collection
            </Link>
            <Link
              href="/wishlist/new"
              className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
            >
              Add to wishlist
            </Link>
          </div>
        </div>

        {items.length === 0 ? (
          <p className="text-zinc-500 dark:text-zinc-400">
            Nothing on your wishlist yet.
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
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {items.map((item) => (
                  <tr
                    key={item.wishlistItemId}
                    className="bg-white dark:bg-zinc-950 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-50">
                      <Link
                        href={`/wishlist/${item.wishlistItemId}`}
                        className="underline font-bold text-sky-500 dark:text-sky-400 hover:text-sky-600 dark:hover:text-sky-300"
                      >
                        {item.release.title}
                      </Link>
                      <span className="ml-2 text-xs text-zinc-400">
                        ({item.release.originalReleaseYear})
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                      {item.release.artists.map((ra, i) => (
                        <span key={ra.artist.artistId}>
                          {i > 0 && ', '}
                          {ra.artist.name}
                        </span>
                      ))}
                    </td>
                    <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                      {item.format.name}
                    </td>
                    <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                      {item.pressingYear ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                      {item.label ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300 font-mono text-xs">
                      {item.catalogNumber ?? '—'}
                      {item.vinylColor && (
                        <span className="ml-2 font-sans inline-flex items-center rounded-full bg-violet-100 dark:bg-violet-900 px-2 py-0.5 text-xs text-violet-700 dark:text-violet-300">
                          {item.vinylColor}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/wishlist/${item.wishlistItemId}/add-to-collection`}
                        className="text-sm underline font-bold text-sky-500 dark:text-sky-400 hover:text-sky-600 dark:hover:text-sky-300 whitespace-nowrap"
                      >
                        Add to Collection
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
