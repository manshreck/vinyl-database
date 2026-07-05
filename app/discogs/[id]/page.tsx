import { requireSession } from '@/lib/session'
import { getDiscogsRelease } from '@/lib/discogs'
import Image from 'next/image'
import Link from 'next/link'

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

type Props = {
  params: Promise<{ id: string }>
  searchParams: Promise<{ q?: string }>
}

export default async function DiscogsReleasePage({ params, searchParams }: Props) {
  await requireSession()

  const { id } = await params
  const { q } = await searchParams
  const backHref = `/discogs${q ? `?q=${encodeURIComponent(q)}` : ''}`
  const discogsId = Number(id)

  let error: string | null = null
  let release: Awaited<ReturnType<typeof getDiscogsRelease>> | null = null

  try {
    release = await getDiscogsRelease(discogsId)
  } catch (err) {
    error = err instanceof Error ? err.message : 'Could not load this Discogs release.'
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="mb-6">
          <Link
            href={backHref}
            className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
          >
            ← Results
          </Link>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950 px-4 py-3 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {release && (
          <>
            <div className="mb-6 flex items-start gap-6">
              {release.coverImageUrl ? (
                <Image
                  src={release.coverImageUrl}
                  alt=""
                  width={160}
                  height={160}
                  className="rounded-lg object-cover flex-shrink-0"
                  unoptimized
                />
              ) : (
                <div className="w-40 h-40 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex-shrink-0" />
              )}
              <div className="min-w-0">
                <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                  {release.title}
                </h1>
                <p className="text-zinc-500 dark:text-zinc-400">{release.artists.join(', ')}</p>
                <div className="mt-4 flex flex-col gap-2">
                  <Link
                    href={`/pressings/new?discogsId=${release.id}`}
                    className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors text-center"
                  >
                    Add to Collection
                  </Link>
                  <Link
                    href={`/wishlist/new?discogsId=${release.id}`}
                    className="rounded-full border border-zinc-200 dark:border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-center"
                  >
                    Add to Wishlist
                  </Link>
                </div>
              </div>
            </div>

            <section className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
                <Field label="Original release year" value={release.originalReleaseYear} />
                <Field label="Pressing year" value={release.pressingYear} />
                <Field label="Country" value={release.country} />
                <Field label="Genre" value={release.genres.join(', ') || null} />
                <Field
                  label="Label / Catalog #"
                  value={
                    release.labels.length > 0
                      ? release.labels.map((l) => [l.name, l.catno].filter(Boolean).join(' / ')).join(', ')
                      : null
                  }
                />
                <Field
                  label="Format"
                  value={
                    release.formats.length > 0
                      ? release.formats.map((f) => [f.name, ...f.descriptions].join(' ')).join(', ')
                      : null
                  }
                />
                {release.notes && (
                  <div className="col-span-2">
                    <Field label="Notes" value={release.notes} />
                  </div>
                )}
              </dl>
            </section>
          </>
        )}
      </div>
    </div>
  )
}
