import { getTenantPrisma } from '@/lib/prisma'
import { requireSession } from '@/lib/session'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'

const conditionLabel: Record<string, string> = {
  P: 'P — Poor',
  FR: 'FR — Fair',
  G: 'G — Good',
  G_PLUS: 'G+ — Good Plus',
  VG_MINUS: 'VG- — Very Good Minus',
  VG: 'VG — Very Good',
  VG_PLUS: 'VG+ — Very Good Plus',
  NM: 'NM — Near Mint',
  M: 'M — Mint',
  S: 'S — Sealed',
}

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

export default async function PressingPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await requireSession()
  const prisma = await getTenantPrisma(session.databaseName)

  const { id } = await params
  const pressingId = Number(id)

  const pressing = await prisma.pressing.findUnique({
    where: { pressingId },
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

  if (!pressing) notFound()

  const { release } = pressing
  const artists = release.artists.map((ra) => ra.artist.name).join(', ')
  const genres = release.genres.map((rg) => rg.genre.name).join(', ')

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="max-w-2xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          <div className="flex items-start gap-4">
            {release.coverImageUrl && (
              <Image
                src={release.coverImageUrl}
                alt=""
                width={96}
                height={96}
                className="rounded-lg object-cover flex-shrink-0"
                unoptimized
              />
            )}
            <div>
              <Link
                href="/pressings"
                className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
              >
                ← Collection
              </Link>
              <h1 className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                {release.title}
              </h1>
              <p className="text-zinc-500 dark:text-zinc-400">{artists}</p>
            </div>
          </div>
          <Link
            href={`/pressings/${pressingId}/edit`}
            className="rounded-full border border-zinc-200 dark:border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            Edit
          </Link>
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
            <Field label="Format" value={pressing.format.name} />
            <Field label="Number of discs" value={pressing.discCount} />
            <Field label="Pressing year" value={pressing.pressingYear} />
            <Field label="Country" value={pressing.country} />
            <Field label="Label" value={pressing.label} />
            <Field label="Catalog number" value={pressing.catalogNumber} />
            {pressing.vinylColor && (
              <Field
                label="Vinyl color"
                value={
                  <span className="inline-flex items-center rounded-full bg-violet-100 dark:bg-violet-900 px-2 py-0.5 text-xs text-violet-700 dark:text-violet-300">
                    {pressing.vinylColor}
                  </span>
                }
              />
            )}
          </dl>
        </section>

        {/* Condition */}
        <section className="mb-6 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Condition
          </h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
            <Field label="Record" value={conditionLabel[pressing.recordCondition]} />
            <Field
              label="Sleeve"
              value={pressing.sleeveCondition ? conditionLabel[pressing.sleeveCondition] : null}
            />
            {pressing.notes && (
              <div className="col-span-2">
                <Field label="Notes" value={pressing.notes} />
              </div>
            )}
          </dl>
        </section>

        {/* Provenance & value */}
        <section className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Provenance &amp; Value
          </h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
            <Field
              label="Purchase price"
              value={pressing.purchasePrice != null ? `$${Number(pressing.purchasePrice).toFixed(2)}` : null}
            />
            <Field
              label="Purchase date"
              value={pressing.purchaseDate ? new Date(pressing.purchaseDate).toLocaleDateString() : null}
            />
            <Field
              label="Current value (insurance)"
              value={pressing.currentValue != null ? `$${Number(pressing.currentValue).toFixed(2)}` : null}
            />
          </dl>
        </section>

      </div>
    </div>
  )
}
