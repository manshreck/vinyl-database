'use client'

import { useActionState, useRef, useState } from 'react'
import { updateDiscogsToken, type FormState } from '@/app/actions/updateDiscogsToken'
import type { DiscogsTokenStatus } from '@/lib/discogs'

const initialState: FormState = null

type Props = {
  token: string | null
  /** Checked against Discogs when the page loaded; 'unknown' if it couldn't be reached. */
  tokenStatus: DiscogsTokenStatus
}

export default function DiscogsTokenForm({ token, tokenStatus }: Props) {
  const hasToken = Boolean(token)
  const rejected = hasToken && tokenStatus === 'invalid'
  const [state, formAction, pending] = useActionState(updateDiscogsToken, initialState)
  const [revealed, setRevealed] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  function handleRemove() {
    if (formRef.current) {
      const input = formRef.current.elements.namedItem('discogsToken') as HTMLInputElement
      input.value = ''
    }
    formRef.current?.requestSubmit()
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      {state && 'error' in state && (
        <p className="rounded-lg bg-red-50 dark:bg-red-950 px-4 py-2 text-sm text-red-700 dark:text-red-300">
          {state.error}
        </p>
      )}
      {state && 'success' in state && (
        <p className="rounded-lg bg-green-50 dark:bg-green-950 px-4 py-2 text-sm text-green-700 dark:text-green-300">
          Discogs token updated.
        </p>
      )}

      {/* Reports what Discogs actually said, not merely whether a token is stored. */}
      <p className={statusClass(hasToken, tokenStatus)}>{statusMessage(hasToken, tokenStatus)}</p>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        This app can look up releases on Discogs to save you from typing in every detail by hand.
      </p>

      {hasToken && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {rejected
            ? 'To replace it with a working token:'
            : 'If you wish to replace this token with a new Discogs token:'}
        </p>
      )}

      <div>
        <ol className="list-decimal list-inside text-sm text-zinc-500 dark:text-zinc-400 space-y-1">
          <li>Log in to Discogs (or create a free account if you don&rsquo;t have one).</li>
          <li>
            Go to{' '}
            <a
              href="https://www.discogs.com/settings/developers"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-zinc-800 dark:hover:text-zinc-200"
            >
              Settings → Developers
            </a>
            . (Opens in new tab.)
          </li>
          <li>Click Generate new token, then copy it.</li>
          <li>Paste it below.</li>
        </ol>
      </div>

      {hasToken && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className={labelClass}>Current token</label>
            <button
              type="button"
              onClick={() => setRevealed((prev) => !prev)}
              className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 underline"
            >
              {revealed ? 'Hide token' : 'Click to reveal token'}
            </button>
          </div>
          <input
            type="text"
            readOnly
            value={revealed ? (token as string) : '•'.repeat(24)}
            className={`${inputClass} font-mono`}
          />
        </div>
      )}

      <div>
        <label className={labelClass}>Discogs token</label>
        <input
          name="discogsToken"
          type="password"
          autoComplete="off"
          placeholder={hasToken ? 'Enter a new token to replace the current one' : 'Paste your Discogs token here'}
          className={inputClass}
        />
      </div>

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-zinc-900 px-6 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors disabled:opacity-50"
        >
          {pending ? (hasToken ? 'Replacing…' : 'Saving…') : hasToken ? 'Replace Token' : 'Save Token'}
        </button>
        {hasToken && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={pending}
            className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 disabled:opacity-50"
          >
            Remove token
          </button>
        )}
      </div>
    </form>
  )
}

/**
 * Four honest states. Notably 'unknown' stays neutral: if Discogs couldn't be reached
 * we know a token is stored but not whether it works, and claiming either would be a
 * guess — a red warning that turns out to be wrong is worse than no warning, because
 * it teaches people to ignore the next one.
 */
function statusMessage(hasToken: boolean, status: DiscogsTokenStatus): string {
  if (!hasToken) return 'A Discogs token is not set for your account.'
  if (status === 'invalid') {
    return 'Discogs is rejecting this token — it has been revoked or regenerated. Replace it below to restore Discogs search.'
  }
  if (status === 'valid') return 'A Discogs token is set for your account and Discogs accepts it.'
  return 'A Discogs token is set for your account. It could not be checked just now.'
}

function statusClass(hasToken: boolean, status: DiscogsTokenStatus): string {
  if (hasToken && status === 'invalid') return 'text-sm font-medium text-red-700 dark:text-red-400'
  if (hasToken && status === 'valid') return 'text-sm text-green-700 dark:text-green-400'
  return 'text-sm text-zinc-500 dark:text-zinc-400'
}

const labelClass = 'block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1'
const inputClass =
  'w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-500'
