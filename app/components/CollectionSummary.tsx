/**
 * The count line under a collection or wishlist heading. Shared so the two pages can't
 * drift apart in wording or styling.
 *
 * `note` carries any qualifier the page needs — e.g. the collection page reports its
 * filtered subset there, since its totals deliberately describe the whole collection.
 */
export default function CollectionSummary({
  totalPressings,
  totalArtists,
  note,
}: {
  totalPressings: number
  totalArtists: number
  note?: string | null
}) {
  return (
    <div className="mb-4 flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm text-zinc-500 dark:text-zinc-400">
      <span>
        Total Pressings:{' '}
        <strong className="font-semibold text-zinc-900 dark:text-zinc-50">{totalPressings}</strong>
      </span>
      <span>
        Total Artists:{' '}
        <strong className="font-semibold text-zinc-900 dark:text-zinc-50">{totalArtists}</strong>
      </span>
      {note && <span className="text-zinc-400 dark:text-zinc-500">{note}</span>}
    </div>
  )
}
