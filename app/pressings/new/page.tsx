import { getTenantPrisma } from '@/lib/prisma'
import { requireSession } from '@/lib/session'
import Link from 'next/link'
import PressingsForm from './PressingsForm'

export default async function NewPressingPage() {
  const session = await requireSession()
  const prisma = await getTenantPrisma(session.databaseName)

  const [formats, genres] = await Promise.all([
    prisma.format.findMany({ orderBy: { name: 'asc' } }),
    prisma.genre.findMany({ orderBy: { name: 'asc' } }),
  ])

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="mb-6">
          <Link
            href="/pressings"
            className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
          >
            ← Collection
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
            Add a record
          </h1>
        </div>

        <PressingsForm formats={formats} genres={genres} />
      </div>
    </div>
  )
}
