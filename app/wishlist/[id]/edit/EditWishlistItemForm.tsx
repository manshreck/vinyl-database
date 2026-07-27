'use client'

import { useState } from 'react'
import Image from 'next/image'
import { updateWishlistItem } from '@/app/actions/updateWishlistItem'
import { deleteWishlistItem } from '@/app/actions/deleteWishlistItem'

type Format = { formatId: number; name: string }

type WishlistItem = {
  wishlistItemId: number
  releaseId: number
  formatId: number
  pressingYear: number | null
  country: string | null
  label: string | null
  catalogNumber: string | null
  vinylColor: string | null
  discCount: number
  notes: string | null
  release: {
    title: string
    originalReleaseYear: number
    coverImageUrl: string | null
    artists: Array<{ artist: { name: string } }>
  }
}

export default function EditWishlistItemForm({
  item,
  formats,
}: {
  item: WishlistItem
  formats: Format[]
}) {
  const [pending, setPending] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [coverImageUrl, setCoverImageUrl] = useState(item.release.coverImageUrl)
  const [retrievingImage, setRetrievingImage] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setPending(true)
    const data = new FormData(e.currentTarget)
    await updateWishlistItem(item.wishlistItemId, data)
  }

  async function handleDelete() {
    if (!confirming) { setConfirming(true); return }
    setPending(true)
    await deleteWishlistItem(item.wishlistItemId)
  }

  const artists = item.release.artists.map((a) => a.artist.name).join(', ')

  async function retrieveCoverImage() {
    setRetrievingImage(true)
    setImageError(null)
    try {
      const params = new URLSearchParams({ title: item.release.title, artist: artists })
      const res = await fetch(`/api/discogs/cover-image?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not retrieve a cover image.')
      if (data.coverImageUrl) {
        setCoverImageUrl(data.coverImageUrl)
      } else {
        setImageError('No cover image found on Discogs for this release.')
      }
    } catch (err) {
      setImageError(err instanceof Error ? err.message : 'Could not retrieve a cover image.')
    } finally {
      setRetrievingImage(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">

      {/* Release (read-only, with edit link) */}
      <div className="flex items-center justify-between rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 px-4 py-3">
        <div className="flex items-center gap-4">
          {coverImageUrl ? (
            <Image
              src={coverImageUrl}
              alt=""
              width={64}
              height={64}
              className="rounded-lg object-cover flex-shrink-0"
              unoptimized
            />
          ) : (
            <div className="flex flex-col items-start gap-1 flex-shrink-0">
              <div className="w-16 h-16 rounded-lg bg-zinc-100 dark:bg-zinc-800" />
              <button
                type="button"
                onClick={retrieveCoverImage}
                disabled={retrievingImage}
                className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 underline disabled:opacity-50"
              >
                {retrievingImage ? 'Retrieving…' : 'Retrieve cover image'}
              </button>
            </div>
          )}
          <div>
            <p className="font-medium text-zinc-900 dark:text-zinc-50">
              {item.release.title}
              <span className="ml-2 text-sm text-zinc-400">({item.release.originalReleaseYear})</span>
            </p>
            <p className="text-sm text-zinc-500">{artists}</p>
            {imageError && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{imageError}</p>}
          </div>
        </div>
        <a
          href={`/releases/${item.releaseId}/edit?returnTo=/wishlist/${item.wishlistItemId}/edit`}
          className="text-sm text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 whitespace-nowrap ml-4"
        >
          Edit release
        </a>
      </div>
      <input type="hidden" name="coverImageUrl" value={coverImageUrl ?? ''} />

      {/* Pressing fields */}
      <section className="space-y-4">
        <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">Pressing details</h2>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Format</label>
            <select name="formatId" required className={inputClass} defaultValue={item.formatId}>
              {formats.map((f) => (
                <option key={f.formatId} value={f.formatId}>{f.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>Number of discs</label>
            <input name="discCount" type="number" min={1} max={50} required className={inputClass} defaultValue={item.discCount} />
          </div>

          <div>
            <label className={labelClass}>Pressing year</label>
            <input name="pressingYear" type="number" min={1877} max={2200} className={inputClass} defaultValue={item.pressingYear ?? ''} />
          </div>

          <div>
            <label className={labelClass}>Country</label>
            <input name="country" className={inputClass} defaultValue={item.country ?? ''} />
          </div>

          <div>
            <label className={labelClass}>Label</label>
            <input name="label" className={inputClass} defaultValue={item.label ?? ''} />
          </div>

          <div>
            <label className={labelClass}>Catalog number</label>
            <input name="catalogNumber" className={inputClass} defaultValue={item.catalogNumber ?? ''} />
          </div>

          <div className="col-span-2">
            <label className={labelClass}>Vinyl color</label>
            <input name="vinylColor" className={inputClass} defaultValue={item.vinylColor ?? ''} placeholder="e.g. Clear, Red, Blue/White Splatter (leave blank for standard black)" />
          </div>
        </div>

        <div>
          <label className={labelClass}>Notes</label>
          <textarea name="notes" rows={3} className={inputClass} defaultValue={item.notes ?? ''} placeholder="What you're looking for, price ceiling, condition preferences…" />
        </div>
      </section>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={pending}
            className="rounded-full bg-zinc-900 px-6 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors disabled:opacity-50"
          >
            {pending ? 'Saving…' : 'Save changes'}
          </button>
          <a href="/wishlist" className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">
            Cancel
          </a>
        </div>

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
    </form>
  )
}

const labelClass = 'block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1'
const inputClass =
  'w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-500'
