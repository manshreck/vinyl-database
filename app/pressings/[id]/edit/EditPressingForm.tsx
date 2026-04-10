'use client'

import { useState } from 'react'
import { updatePressing } from '@/app/actions/updatePressing'
import { deletePressing } from '@/app/actions/deletePressing'

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

type Format = { formatId: number; name: string }

type Pressing = {
  pressingId: number
  formatId: number
  pressingYear: number | null
  country: string | null
  label: string | null
  catalogNumber: string | null
  vinylColor: string | null
  discCount: number
  recordCondition: string
  sleeveCondition: string | null
  notes: string | null
  purchasePrice: string | null
  purchaseDate: string | null
  currentValue: string | null
  release: {
    title: string
    originalReleaseYear: number
    artists: Array<{ artist: { name: string } }>
  }
}

export default function EditPressingForm({
  pressing,
  formats,
}: {
  pressing: Pressing
  formats: Format[]
}) {
  const [pending, setPending] = useState(false)
  const [confirming, setConfirming] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setPending(true)
    const data = new FormData(e.currentTarget)
    await updatePressing(pressing.pressingId, data)
  }

  async function handleDelete() {
    if (!confirming) { setConfirming(true); return }
    setPending(true)
    await deletePressing(pressing.pressingId)
  }

  const artists = pressing.release.artists.map((a) => a.artist.name).join(', ')
  const purchaseDateValue = pressing.purchaseDate ?? ''

  return (
    <form onSubmit={handleSubmit} className="space-y-8">

      {/* Release (read-only) */}
      <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 px-4 py-3">
        <p className="font-medium text-zinc-900 dark:text-zinc-50">
          {pressing.release.title}
          <span className="ml-2 text-sm text-zinc-400">({pressing.release.originalReleaseYear})</span>
        </p>
        <p className="text-sm text-zinc-500">{artists}</p>
      </div>

      {/* Pressing fields */}
      <section className="space-y-4">
        <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">Pressing details</h2>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Format</label>
            <select name="formatId" required className={inputClass} defaultValue={pressing.formatId}>
              {formats.map((f) => (
                <option key={f.formatId} value={f.formatId}>{f.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>Number of discs</label>
            <input name="discCount" type="number" min={1} max={50} required className={inputClass} defaultValue={pressing.discCount} />
          </div>

          <div>
            <label className={labelClass}>Record condition</label>
            <select name="recordCondition" required className={inputClass} defaultValue={pressing.recordCondition}>
              {CONDITIONS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>Sleeve condition</label>
            <select name="sleeveCondition" className={inputClass} defaultValue={pressing.sleeveCondition ?? ''}>
              <option value="">None / unknown</option>
              {CONDITIONS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>Pressing year</label>
            <input name="pressingYear" type="number" min={1877} max={2200} className={inputClass} defaultValue={pressing.pressingYear ?? ''} />
          </div>

          <div>
            <label className={labelClass}>Country</label>
            <input name="country" className={inputClass} defaultValue={pressing.country ?? ''} />
          </div>

          <div>
            <label className={labelClass}>Label</label>
            <input name="label" className={inputClass} defaultValue={pressing.label ?? ''} />
          </div>

          <div>
            <label className={labelClass}>Catalog number</label>
            <input name="catalogNumber" className={inputClass} defaultValue={pressing.catalogNumber ?? ''} />
          </div>

          <div className="col-span-2">
            <label className={labelClass}>Vinyl color</label>
            <input name="vinylColor" className={inputClass} defaultValue={pressing.vinylColor ?? ''} placeholder="e.g. Clear, Red, Blue/White Splatter (leave blank for standard black)" />
          </div>

          <div>
            <label className={labelClass}>Purchase price</label>
            <input name="purchasePrice" type="number" min={0} step="0.01" className={inputClass} defaultValue={pressing.purchasePrice ?? ''} />
          </div>

          <div>
            <label className={labelClass}>Purchase date</label>
            <input name="purchaseDate" type="date" className={inputClass} defaultValue={purchaseDateValue} />
          </div>

          <div>
            <label className={labelClass}>Current value (insurance)</label>
            <input name="currentValue" type="number" min={0} step="0.01" className={inputClass} defaultValue={pressing.currentValue ?? ''} />
          </div>
        </div>

        <div>
          <label className={labelClass}>Notes</label>
          <textarea name="notes" rows={3} className={inputClass} defaultValue={pressing.notes ?? ''} />
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
          <a href="/pressings" className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">
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
          {confirming ? 'Click again to confirm delete' : 'Delete pressing'}
        </button>
      </div>
    </form>
  )
}

const labelClass = 'block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1'
const inputClass =
  'w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-500'
