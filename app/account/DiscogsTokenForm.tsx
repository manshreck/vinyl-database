'use client'

import { useActionState, useRef, useState } from 'react'
import { updateDiscogsToken, type FormState } from '@/app/actions/updateDiscogsToken'

const initialState: FormState = null

type Props = {
  token: string | null
}

export default function DiscogsTokenForm({ token }: Props) {
  const hasToken = Boolean(token)
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

      <p className={hasToken ? 'text-sm text-green-700 dark:text-green-400' : 'text-sm text-zinc-500 dark:text-zinc-400'}>
        {hasToken ? 'A discogs token is set for your account.' : 'A discogs token is not set for your account.'}
      </p>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        This app can look up releases on Discogs to save you from typing in every detail by hand.
      </p>

      {hasToken && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          If you wish to replace this token with a new Discogs token:
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

const labelClass = 'block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1'
const inputClass =
  'w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-500'
