'use client'

import { useEffect, useRef, useState } from 'react'

const GRADES = [
  { grade: 'S',   label: 'Sealed',           description: 'Still in original factory shrink wrap. Often commands a premium above Mint as the condition cannot be verified without opening.' },
  { grade: 'M',   label: 'Mint',             description: 'Absolutely perfect in every way. Never played, often still sealed.' },
  { grade: 'NM',  label: 'Near Mint',         description: 'Nearly perfect. May have been played, but shows no signs of wear.' },
  { grade: 'VG+', label: 'Very Good Plus',    description: 'Shows some signs of play but nothing that will affect the listening experience. The most common grade for quality used records.' },
  { grade: 'VG',  label: 'Very Good',         description: 'Noticeable surface marks and light scratches. Will play through without skipping but background noise will be evident.' },
  { grade: 'VG-', label: 'Very Good Minus',   description: 'Heavier marks and scratches. Audio noticeably affected with consistent background noise.' },
  { grade: 'G+',  label: 'Good Plus',         description: 'Heavy wear throughout. Audio significantly affected but still plays through.' },
  { grade: 'G',   label: 'Good',              description: 'Very heavy wear. Plays through with significant noise and possible skips.' },
  { grade: 'FR',  label: 'Fair',              description: 'Extremely heavy wear. Will play through with difficulty and frequent noise.' },
  { grade: 'P',   label: 'Poor',              description: 'Severely damaged. Barely playable, if at all. Value is in the cover or as a filler only.' },
]

export default function ConditionInfo() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="ml-1.5 align-middle text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
        aria-label="Condition grade definitions"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
          <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM9 9a.75.75 0 0 0 0 1.5h.253a.25.25 0 0 1 .244.304l-.459 2.066A1.75 1.75 0 0 0 10.747 15H11a.75.75 0 0 0 0-1.5h-.253a.25.25 0 0 1-.244-.304l.459-2.066A1.75 1.75 0 0 0 9.253 9H9Z" clipRule="evenodd" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-6 z-50 w-80 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg">
          <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Goldmine / Discogs Grading Scale
            </p>
          </div>
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {GRADES.map(({ grade, label, description }) => (
              <li key={grade} className="px-4 py-2.5">
                <div className="flex items-baseline gap-2 mb-0.5">
                  <span className="text-xs font-bold text-zinc-900 dark:text-zinc-50 font-mono">
                    {grade}
                  </span>
                  <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    {label}
                  </span>
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  {description}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
