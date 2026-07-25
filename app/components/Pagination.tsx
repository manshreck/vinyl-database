import Link from 'next/link'

type Props = {
  currentPage: number
  totalPages: number
  basePath: string
  /** Non-pagination query params to preserve across page links (e.g. active filters/sort). */
  searchParams?: Record<string, string | undefined>
}

function pageHref(basePath: string, searchParams: Record<string, string | undefined>, page: number): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(searchParams)) {
    if (value) params.set(key, value)
  }
  if (page > 1) params.set('page', String(page))
  const qs = params.toString()
  return qs ? `${basePath}?${qs}` : basePath
}

/** First page, last page, current page ± 1, with an ellipsis marker for any gap. */
function pageNumbers(current: number, total: number): Array<number | 'ellipsis'> {
  const pages: Array<number | 'ellipsis'> = []
  for (let p = 1; p <= total; p++) {
    if (p === 1 || p === total || (p >= current - 1 && p <= current + 1)) {
      pages.push(p)
    } else if (pages[pages.length - 1] !== 'ellipsis') {
      pages.push('ellipsis')
    }
  }
  return pages
}

/** Numbered pagination for a searchParams-driven list page. Renders nothing when there's only one page. */
export default function Pagination({ currentPage, totalPages, basePath, searchParams = {} }: Props) {
  if (totalPages <= 1) return null

  const linkClass =
    'rounded-md px-3 py-1.5 text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
  const disabledClass = 'rounded-md px-3 py-1.5 text-sm text-zinc-300 dark:text-zinc-700'

  return (
    <nav aria-label="Pagination" className="mt-6 flex items-center justify-center gap-1">
      {currentPage > 1 ? (
        <Link href={pageHref(basePath, searchParams, currentPage - 1)} className={linkClass}>
          Previous
        </Link>
      ) : (
        <span className={disabledClass}>Previous</span>
      )}

      {pageNumbers(currentPage, totalPages).map((p, i) =>
        p === 'ellipsis' ? (
          <span key={`ellipsis-${i}`} className="px-2 text-sm text-zinc-400">
            …
          </span>
        ) : (
          <Link
            key={p}
            href={pageHref(basePath, searchParams, p)}
            aria-current={p === currentPage ? 'page' : undefined}
            className={
              p === currentPage
                ? 'rounded-md bg-zinc-900 dark:bg-zinc-50 px-3 py-1.5 text-sm font-medium text-white dark:text-zinc-900'
                : 'rounded-md px-3 py-1.5 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
            }
          >
            {p}
          </Link>
        )
      )}

      {currentPage < totalPages ? (
        <Link href={pageHref(basePath, searchParams, currentPage + 1)} className={linkClass}>
          Next
        </Link>
      ) : (
        <span className={disabledClass}>Next</span>
      )}
    </nav>
  )
}
