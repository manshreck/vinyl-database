import { getTenantPrisma } from '@/lib/prisma'
import { requireSession } from '@/lib/session'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import AddToCollectionForm from './AddToCollectionForm'

export default async function AddToCollectionPage({
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
      release: {
        include: {
          artists: {
            include: { artist: true },
            orderBy: { artistOrder: 'asc' },
          },
        },
      },
    },
  })

  if (!item) notFound()

  const today = new Date().toISOString().split('T')[0]
  const artists = item.release.artists.map((ra) => ra.artist.name).join(', ')

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="max-w-lg mx-auto px-4 py-8">
        <div className="mb-6">
          <Link
            href={`/wishlist/${wishlistItemId}`}
            className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
          >
            ← Back
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
            Add to collection
          </h1>
          <p className="mt-1 text-zinc-500 dark:text-zinc-400">
            {item.release.title}
            <span className="ml-2 text-sm text-zinc-400">({item.release.originalReleaseYear})</span>
            {artists && <span className="block text-sm">{artists}</span>}
          </p>
        </div>

        <AddToCollectionForm wishlistItemId={wishlistItemId} defaultPurchaseDate={today} />
      </div>
    </div>
  )
}
