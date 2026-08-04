'use client'

import { useCallback, useState } from 'react'

export type CoverImageError = {
  message: string
  /** Discogs rejected the token — the fix is on the Account page, not a retry. */
  tokenRejected: boolean
}

/**
 * "Retrieve cover image" for the collection and wishlist create forms, which ask for
 * it identically. Keeps the retrieval state together so both stay in step.
 *
 * Title and artist are passed at call time rather than captured: both are live form
 * fields, and the user typically edits them right up to pressing the button.
 */
export function useCoverImageRetrieval(initialUrl: string | null) {
  const [coverImageUrl, setCoverImageUrl] = useState(initialUrl)
  const [retrieving, setRetrieving] = useState(false)
  const [error, setError] = useState<CoverImageError | null>(null)

  const retrieve = useCallback(async (title: string, artist: string) => {
    setRetrieving(true)
    setError(null)
    try {
      const params = new URLSearchParams({ title, artist })
      const res = await fetch(`/api/discogs/cover-image?${params}`)
      const data = await res.json()
      if (!res.ok) {
        setError({
          message: data.error ?? 'Could not retrieve a cover image.',
          tokenRejected: Boolean(data.tokenRejected),
        })
        return
      }
      if (data.coverImageUrl) {
        setCoverImageUrl(data.coverImageUrl)
      } else {
        setError({
          message: 'No cover image found on Discogs for this release.',
          tokenRejected: false,
        })
      }
    } catch {
      setError({ message: 'Could not retrieve a cover image.', tokenRejected: false })
    } finally {
      setRetrieving(false)
    }
  }, [])

  return { coverImageUrl, retrieving, error, retrieve }
}
