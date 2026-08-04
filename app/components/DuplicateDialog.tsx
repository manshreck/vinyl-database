'use client'

import { useEffect, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'

export type DialogEntry = {
  key: number
  details: string[]
  href: string
  badge?: string
  badgeTone?: 'amber' | 'neutral'
  note?: string | null
}

export type DialogSection = {
  heading: string
  entries: DialogEntry[]
}

export type DialogAction = {
  label: string
  onClick: () => void
  /** The rightmost action is the default; others render as quieter outlined buttons. */
  variant?: 'primary' | 'secondary'
}

type Props = {
  /** Distinguishes the two dialogs' heading ids when both live under one form tree. */
  titleId: string
  title: string
  /** One sentence per consequence; rendered as a single paragraph. */
  body: string[]
  /** Colors the heading and primary action to mark a choice that is rarely intended. */
  escalated?: boolean
  /** Ways to proceed, in display order. The last one takes focus. */
  actions: DialogAction[]
  release: {
    title: string
    originalReleaseYear: number
    coverImageUrl: string | null
    artistNames: string[]
  }
  sections: DialogSection[]
  pending: boolean
  onCancel: () => void
}

/**
 * The confirmation shell shared by the collection and wishlist create forms: what the
 * database already holds for this release, and a yes/no on adding to it anyway.
 */
export default function DuplicateDialog({
  titleId,
  title,
  body,
  escalated = false,
  actions,
  release,
  sections,
  pending,
  onCancel,
}: Props) {
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    confirmRef.current?.focus()
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onCancel])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-zinc-900/50" onClick={onCancel} aria-hidden="true" />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full max-w-lg rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xl"
      >
        <div className="px-6 pt-6 pb-4">
          <h2
            id={titleId}
            className={`text-lg font-semibold ${
              escalated ? 'text-amber-700 dark:text-amber-400' : 'text-zinc-900 dark:text-zinc-50'
            }`}
          >
            {title}
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{body.join(' ')}</p>
        </div>

        <div className="border-y border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 px-6 py-4 space-y-4">
          <div className="flex items-center gap-3">
            {release.coverImageUrl && (
              <Image
                src={release.coverImageUrl}
                alt=""
                width={48}
                height={48}
                className="rounded-lg object-cover flex-shrink-0"
                unoptimized
              />
            )}
            <div className="min-w-0">
              <p className="font-medium text-zinc-900 dark:text-zinc-50">
                {release.title}
                <span className="ml-2 text-sm font-normal text-zinc-400">
                  ({release.originalReleaseYear})
                </span>
              </p>
              <p className="text-sm text-zinc-500">{release.artistNames.join(', ')}</p>
            </div>
          </div>

          {sections.map((section) => (
            <div key={section.heading} className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                {section.heading}
              </p>
              <ul className="space-y-3">
                {section.entries.map((entry) => (
                  <li key={entry.key} className="text-sm">
                    <p className="text-zinc-700 dark:text-zinc-300">
                      {entry.details.join(' · ')}
                      {entry.badge && (
                        <span
                          className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${
                            entry.badgeTone === 'neutral'
                              ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                              : 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300'
                          }`}
                        >
                          {entry.badge}
                        </span>
                      )}
                    </p>
                    {entry.note && <p className="text-xs text-zinc-400 mt-0.5">{entry.note}</p>}
                    {/* New tab: the user is mid-form, and navigating away would discard it. */}
                    <Link
                      href={entry.href}
                      target="_blank"
                      className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 underline"
                    >
                      View this entry
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Wraps so two long labels don't overflow a narrow dialog. */}
        <div className="flex flex-wrap items-center justify-end gap-3 px-6 py-4">
          <button
            type="button"
            onClick={onCancel}
            className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
          >
            Cancel
          </button>
          {actions.map((action, i) => {
            const isLast = i === actions.length - 1
            const secondary = action.variant === 'secondary' || !isLast
            return (
              <button
                key={action.label}
                ref={isLast ? confirmRef : undefined}
                type="button"
                onClick={action.onClick}
                disabled={pending}
                className={`rounded-full px-5 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
                  secondary
                    ? 'border border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                    : escalated
                      ? 'bg-amber-600 text-white hover:bg-amber-700'
                      : 'bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200'
                }`}
              >
                {pending ? 'Saving…' : action.label}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
