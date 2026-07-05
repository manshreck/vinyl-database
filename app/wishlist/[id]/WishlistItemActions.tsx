'use client'

import { useState } from 'react'
import { deleteWishlistItem } from '@/app/actions/deleteWishlistItem'

export default function WishlistItemActions({ wishlistItemId }: { wishlistItemId: number }) {
  const [pending, setPending] = useState(false)
  const [confirming, setConfirming] = useState(false)

  async function handleDelete() {
    if (!confirming) { setConfirming(true); return }
    setPending(true)
    await deleteWishlistItem(wishlistItemId)
  }

  return (
    <div className="mt-6 flex justify-end">
      <button
        type="button"
        onClick={handleDelete}
        disabled={pending}
        className={`text-sm font-medium transition-colors disabled:opacity-50 ${
          confirming
            ? 'text-red-600 dark:text-red-400 underline'
            : 'text-zinc-400 hover:text-red-600 dark:hover:text-red-400'
        }`}
      >
        {confirming ? 'Click again to confirm removal' : 'Remove from wishlist'}
      </button>
    </div>
  )
}
