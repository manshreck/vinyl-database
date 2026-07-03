import { getTenantPrisma } from '@/lib/prisma'
import { requireSession } from '@/lib/session'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import EditPressingForm from './EditPressingForm'

export default async function EditPressingPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await requireSession()
  const prisma = await getTenantPrisma(session.databaseName)

  const { id } = await params
  const pressingId = Number(id)

  const [pressing, formats] = await Promise.all([
    prisma.pressing.findUnique({
      where: { pressingId },
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

  if (!pressing) notFound()

  // Serialize non-plain types before passing to client component
  const serialized = {
    ...pressing,
    purchasePrice: pressing.purchasePrice?.toString() ?? null,
    purchaseDate: pressing.purchaseDate?.toISOString().split('T')[0] ?? null,
    currentValue: pressing.currentValue?.toString() ?? null,
  }

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
            Edit pressing
          </h1>
        </div>

        <EditPressingForm pressing={serialized} formats={formats} />
      </div>
    </div>
  )
}
