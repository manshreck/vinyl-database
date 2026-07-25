export const PAGE_SIZE = 25

/**
 * Clamps a raw `?page=` search param against a total item count. Never returns a page
 * below 1 or above the last real page — an out-of-range or malformed param (missing,
 * non-numeric, zero, negative, or past the end) falls back to the nearest valid page
 * rather than producing an empty or negative slice/offset.
 */
export function resolvePage(
  pageParam: string | undefined,
  totalCount: number,
  pageSize: number = PAGE_SIZE
): { currentPage: number; totalPages: number } {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const currentPage = Math.min(Math.max(1, Number(pageParam) || 1), totalPages)
  return { currentPage, totalPages }
}
