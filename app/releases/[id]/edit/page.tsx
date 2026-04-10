import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import EditReleaseForm from './EditReleaseForm'

type Props = {
  params: Promise<{ id: string }>
  searchParams: Promise<{ returnTo?: string }>
}

export default async function EditReleasePage({ params, searchParams }: Props) {
  const { id } = await params
  const { returnTo } = await searchParams
  const releaseId = Number(id)
  const backUrl = returnTo ?? '/pressings'

  const [release, allGenres] = await Promise.all([
    prisma.release.findUnique({
      where: { releaseId },
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
    }),
    prisma.genre.findMany({ orderBy: { name: 'asc' } }),
  ])

  if (!release) notFound()

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="mb-6">
          <Link
            href={backUrl}
            className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
          >
            ← Back
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
            Edit release
          </h1>
        </div>

        <EditReleaseForm release={release} allGenres={allGenres} returnTo={backUrl} />
      </div>
    </div>
  )
}
