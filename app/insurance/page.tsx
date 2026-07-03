import { getTenantPrisma } from '@/lib/prisma'
import { requireSession } from '@/lib/session'
import Link from 'next/link'
import PrintButton from './PrintButton'

export default async function InsurancePage() {
  const session = await requireSession()
  const prisma = await getTenantPrisma(session.databaseName)

  const pressings = await prisma.pressing.findMany({
    include: {
      format: true,
      release: {
        include: {
          artists: {
            include: { artist: true },
            orderBy: { artistOrder: 'asc' },
          },
        },
      },
    },
    orderBy: { currentValue: 'desc' },
  })

  const valued = pressings.filter((p) => p.currentValue != null)
  const unvalued = pressings.filter((p) => p.currentValue == null)
  const totalValue = valued.reduce((sum, p) => sum + Number(p.currentValue), 0)

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="max-w-4xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="mb-8 flex items-start justify-between">
          <div>
            <Link
              href="/pressings"
              className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
            >
              ← Collection
            </Link>
            <h1 className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
              Insurance Report
            </h1>
            <p className="text-sm text-zinc-500 mt-1">
              Generated {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
          <PrintButton />
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">Total value</p>
            <p className="mt-1 text-3xl font-semibold text-zinc-900 dark:text-zinc-50">
              ${totalValue.toFixed(2)}
            </p>
          </div>
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">Valued records</p>
            <p className="mt-1 text-3xl font-semibold text-zinc-900 dark:text-zinc-50">
              {valued.length}
            </p>
          </div>
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">Unvalued records</p>
            <p className="mt-1 text-3xl font-semibold text-zinc-900 dark:text-zinc-50">
              {unvalued.length}
            </p>
            {unvalued.length > 0 && (
              <p className="mt-1 text-xs text-zinc-400">not included in total</p>
            )}
          </div>
        </div>

        {/* Valued pressings table */}
        {valued.length > 0 && (
          <section className="mb-8">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400 mb-3">
              Valued records
            </h2>
            <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-zinc-100 dark:bg-zinc-900 text-zinc-500 text-left">
                  <tr>
                    <th className="px-4 py-3 font-medium">Title</th>
                    <th className="px-4 py-3 font-medium">Artist</th>
                    <th className="px-4 py-3 font-medium">Format</th>
                    <th className="px-4 py-3 font-medium">Label / Catalog</th>
                    <th className="px-4 py-3 font-medium">Condition</th>
                    <th className="px-4 py-3 font-medium text-right">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 bg-white dark:bg-zinc-900">
                  {valued.map((pressing) => {
                    const artists = pressing.release.artists
                      .map((ra) => ra.artist.name)
                      .join(', ')
                    const labelCatalog = [pressing.label, pressing.catalogNumber]
                      .filter(Boolean)
                      .join(' / ')

                    return (
                      <tr key={pressing.pressingId}>
                        <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-50">
                          <Link
                            href={`/pressings/${pressing.pressingId}`}
                            className="hover:underline print:no-underline"
                          >
                            {pressing.release.title}
                          </Link>
                          <span className="ml-2 text-xs text-zinc-400">
                            ({pressing.release.originalReleaseYear})
                          </span>
                        </td>
                        <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">{artists}</td>
                        <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                          {pressing.format.name}
                          {pressing.pressingYear && (
                            <span className="ml-1 text-zinc-400">{pressing.pressingYear}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300 font-mono text-xs">
                          {labelCatalog || '—'}
                        </td>
                        <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                          {pressing.recordCondition.replace('_PLUS', '+').replace('_MINUS', '-')}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-zinc-900 dark:text-zinc-50">
                          ${Number(pressing.currentValue).toFixed(2)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot className="bg-zinc-100 dark:bg-zinc-900 border-t-2 border-zinc-200 dark:border-zinc-700">
                  <tr>
                    <td colSpan={5} className="px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-50">
                      Total
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-zinc-900 dark:text-zinc-50">
                      ${totalValue.toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        )}

        {/* Unvalued pressings */}
        {unvalued.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400 mb-3">
              Unvalued records
            </h2>
            <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-zinc-100 dark:bg-zinc-900 text-zinc-500 text-left">
                  <tr>
                    <th className="px-4 py-3 font-medium">Title</th>
                    <th className="px-4 py-3 font-medium">Artist</th>
                    <th className="px-4 py-3 font-medium">Format</th>
                    <th className="px-4 py-3 font-medium">Label / Catalog</th>
                    <th className="px-4 py-3 font-medium">Condition</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 bg-white dark:bg-zinc-900">
                  {unvalued.map((pressing) => {
                    const artists = pressing.release.artists
                      .map((ra) => ra.artist.name)
                      .join(', ')
                    const labelCatalog = [pressing.label, pressing.catalogNumber]
                      .filter(Boolean)
                      .join(' / ')

                    return (
                      <tr key={pressing.pressingId}>
                        <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-50">
                          <Link
                            href={`/pressings/${pressing.pressingId}/edit`}
                            className="hover:underline print:no-underline"
                          >
                            {pressing.release.title}
                          </Link>
                          <span className="ml-2 text-xs text-zinc-400">
                            ({pressing.release.originalReleaseYear})
                          </span>
                        </td>
                        <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">{artists}</td>
                        <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                          {pressing.format.name}
                          {pressing.pressingYear && (
                            <span className="ml-1 text-zinc-400">{pressing.pressingYear}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300 font-mono text-xs">
                          {labelCatalog || '—'}
                        </td>
                        <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                          {pressing.recordCondition.replace('_PLUS', '+').replace('_MINUS', '-')}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {pressings.length === 0 && (
          <p className="text-zinc-500">No records in the collection yet.</p>
        )}

      </div>
    </div>
  )
}
