import { getTenantPrisma } from '@/lib/prisma'
import { requireSession } from '@/lib/session'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import EditWishlistItemForm from './EditWishlistItemForm'

export default async function EditWishlistItemPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await requireSession()
  const prisma = await getTenantPrisma(session.databaseName)

  const { id } = await params
  const wishlistItemId = Number(id)

  const [item, formats] = await Promise.all([
    prisma.wishlistItem.findUnique({
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
    }),
    prisma.format.findMany({ orderBy: { name: 'asc' } }),
  ])

  if (!item) notFound()

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="mb-6">
          <Link
            href="/wishlist"
            className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
          >
            ← Wishlist
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
            Edit wishlist item
          </h1>
        </div>

        <EditWishlistItemForm item={item} formats={formats} />
      </div>
    </div>
  )
}
