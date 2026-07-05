'use client'

import { useState } from 'react'
import { addWishlistItemToCollection } from '@/app/actions/addWishlistItemToCollection'

const CONDITIONS = [
  { value: 'P', label: 'P — Poor' },
  { value: 'FR', label: 'FR — Fair' },
  { value: 'G', label: 'G — Good' },
  { value: 'G_PLUS', label: 'G+ — Good Plus' },
  { value: 'VG_MINUS', label: 'VG- — Very Good Minus' },
  { value: 'VG', label: 'VG — Very Good' },
  { value: 'VG_PLUS', label: 'VG+ — Very Good Plus' },
  { value: 'NM', label: 'NM — Near Mint' },
  { value: 'M', label: 'M — Mint' },
  { value: 'S', label: 'S — Sealed' },
]

type Props = {
  wishlistItemId: number
  defaultPurchaseDate: string
}

export default function AddToCollectionForm({ wishlistItemId, defaultPurchaseDate }: Props) {
  const [pending, setPending] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setPending(true)
    const data = new FormData(e.currentTarget)
    await addWishlistItemToCollection(wishlistItemId, data)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        This moves the pressing from your wishlist into your collection.
      </p>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Record condition</label>
          <select name="recordCondition" required className={inputClass}>
            <option value="">Select…</option>
            {CONDITIONS.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass}>Sleeve condition</label>
          <select name="sleeveCondition" className={inputClass}>
            <option value="">None / unknown</option>
            {CONDITIONS.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={labelClass}>Purchase date</label>
        <input
          name="purchaseDate"
          type="date"
          defaultValue={defaultPurchaseDate}
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass}>Purchase price</label>
        <input name="purchasePrice" type="number" min={0} step="0.01" className={inputClass} placeholder="0.00" />
      </div>

      <div>
        <label className={labelClass}>Current value (insurance)</label>
        <input name="currentValue" type="number" min={0} step="0.01" className={inputClass} placeholder="0.00" />
      </div>

      <div className="flex items-center gap-4 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-zinc-900 px-6 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors disabled:opacity-50"
        >
          {pending ? 'Adding…' : 'Add to collection'}
        </button>
        <a href={`/wishlist/${wishlistItemId}`} className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">
          Cancel
        </a>
      </div>
    </form>
  )
}

const labelClass = 'block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1'
const inputClass =
  'w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-500'
