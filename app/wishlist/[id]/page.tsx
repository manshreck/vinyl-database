import { getTenantPrisma } from '@/lib/prisma'
import { requireSession } from '@/lib/session'
import Link from 'next/link'
import { notFound } from 'next/navigation'

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-zinc-900 dark:text-zinc-50">
        {value ?? <span className="text-zinc-400">—</span>}
      </dd>
    </div>
  )
}

export default async function WishlistItemPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await requireSession()
  const prisma = await getTenantPrisma(session.databaseName)

  const { id } = await params
  const wishlistItemId = Number(id)

  const item = await prisma.wishlistItem.findUnique({
    where: { wishlistItemId },
    include: {
      format: true,
      release: {
        include: {
          artists: {
            include: { artist: true },
            orderBy: { artistOrder: 'asc' },
          },
          genres: {
            include: { genre: true },
            orderBy: { genreOrder: 'asc' },
          },
        },
      },
    },
  })

  if (!item) notFound()

  const { release } = item
  const artists = release.artists.map((ra) => ra.artist.name).join(', ')
  const genres = release.genres.map((rg) => rg.genre.name).join(', ')

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="max-w-2xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <Link
              href="/wishlist"
              className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
            >
              ← Wishlist
            </Link>
            <h1 className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
              {release.title}
            </h1>
            <p className="text-zinc-500 dark:text-zinc-400">{artists}</p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href={`/wishlist/${wishlistItemId}/edit`}
              className="rounded-full border border-zinc-200 dark:border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors whitespace-nowrap"
            >
              Edit
            </Link>
            <Link
              href={`/wishlist/${wishlistItemId}/add-to-collection`}
              className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors whitespace-nowrap"
            >
              Add to Collection
            </Link>
          </div>
        </div>

        {/* Release details */}
        <section className="mb-6 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Release
          </h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
            <Field label="Original release year" value={release.originalReleaseYear} />
            <Field label="Genre" value={genres || null} />
            {release.notes && (
              <div className="col-span-2">
                <Field label="Notes" value={release.notes} />
              </div>
            )}
          </dl>
        </section>

        {/* Pressing details */}
        <section className="mb-6 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Pressing
          </h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
            <Field label="Format" value={item.format.name} />
            <Field label="Number of discs" value={item.discCount} />
            <Field label="Pressing year" value={item.pressingYear} />
            <Field label="Country" value={item.country} />
            <Field label="Label" value={item.label} />
            <Field label="Catalog number" value={item.catalogNumber} />
            {item.vinylColor && (
              <Field
                label="Vinyl color"
                value={
                  <span className="inline-flex items-center rounded-full bg-violet-100 dark:bg-violet-900 px-2 py-0.5 text-xs text-violet-700 dark:text-violet-300">
                    {item.vinylColor}
                  </span>
                }
              />
            )}
            {item.notes && (
              <div className="col-span-2">
                <Field label="Notes" value={item.notes} />
              </div>
            )}
          </dl>
        </section>
      </div>
    </div>
  )
}
