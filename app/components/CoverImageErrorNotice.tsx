'use client'

import Link from 'next/link'
import type { CoverImageError } from './useCoverImageRetrieval'

/**
 * The "Retrieve cover image" failure line. A rejected token is the one cause with a
 * specific fix, so only that case offers a way to it — the others (no match, network
 * trouble) would just be pointing somewhere useless.
 */
export default function CoverImageErrorNotice({ error }: { error: CoverImageError | null }) {
  if (!error) return null

  return (
    <p className="text-xs text-red-600 dark:text-red-400">
      {error.message}
      {error.tokenRejected && (
        <>
          {' '}
          {/* New tab: the form is mid-edit, and navigating away would discard it. */}
          <Link href="/account" target="_blank" className="underline font-medium">
            Update your Discogs token
          </Link>
          .
        </>
      )}
    </p>
  )
}
