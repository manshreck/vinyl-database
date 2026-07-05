import { getTenantPrisma } from '@/lib/prisma'
import { requireSession } from '@/lib/session'
import { getDiscogsRelease } from '@/lib/discogs'
import { buildDiscogsInitialValues } from '@/lib/discogsMapping'
import Link from 'next/link'
import WishlistForm, { type WishlistInitialValues } from './WishlistForm'

type SearchParams = Promise<{ discogsId?: string }>

export default async function NewWishlistItemPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireSession()
  const prisma = await getTenantPrisma(session.databaseName)

  const [formats, genres] = await Promise.all([
    prisma.format.findMany({ orderBy: { name: 'asc' } }),
    prisma.genre.findMany({ orderBy: { name: 'asc' } }),
  ])

  const { discogsId } = await searchParams
  let initialValues: WishlistInitialValues | undefined

  if (discogsId) {
    try {
      const release = await getDiscogsRelease(Number(discogsId))
      const discogsValues = buildDiscogsInitialValues(release)
      const matchedFormat = formats.find((f) => f.name === discogsValues.formatName)
      const matchedGenreIds = genres
        .filter((g) => discogsValues.genreNames.includes(g.name))
        .map((g) => g.genreId)

      initialValues = {
        title: discogsValues.title,
        originalReleaseYear: discogsValues.originalReleaseYear,
        artistName: discogsValues.artistName,
        genreIds: matchedGenreIds,
        formatId: matchedFormat?.formatId ?? null,
        country: discogsValues.country,
        label: discogsValues.label,
        catalogNumber: discogsValues.catalogNumber,
        discCount: discogsValues.discCount,
        coverImageUrl: discogsValues.coverImageUrl,
      }
    } catch (err) {
      // A Discogs hiccup shouldn't block manually adding a wishlist item
      console.error('Failed to prefill from Discogs:', err)
    }
  }

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
            Add to wishlist
          </h1>
        </div>

        <WishlistForm formats={formats} genres={genres} initialValues={initialValues} />
      </div>
    </div>
  )
}
