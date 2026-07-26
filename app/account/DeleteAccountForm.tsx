'use client'

import { startTransition, useActionState, useState } from 'react'
import { deleteAccount, type FormState } from '@/app/actions/deleteAccount'

const initialState: FormState = null

export default function DeleteAccountForm() {
  const [state, formAction, pending] = useActionState(deleteAccount, initialState)
  const [confirming, setConfirming] = useState(false)
  const [password, setPassword] = useState('')

  function handleClick() {
    if (!confirming) {
      setConfirming(true)
      return
    }
    const formData = new FormData()
    formData.set('password', password)
    startTransition(() => formAction(formData))
  }

  return (
    // No `action` prop: toggling a button between type="button" and type="submit"
    // inside a <form action={...}> triggers a real submission on the very click that
    // flips it, bypassing the two-click confirmation entirely. Instead the confirm
    // button stays type="button" always (matching EditPressingForm's delete flow) and
    // dispatches the action directly once confirmed. onSubmit is still guarded as
    // defense-in-depth against any native submission path (e.g. Enter).
    <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
      {state?.error && (
        <p className="rounded-lg bg-red-50 dark:bg-red-950 px-4 py-2 text-sm text-red-700 dark:text-red-300">
          {state.error}
        </p>
      )}

      <div>
        <label className={labelClass}>Password</label>
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className={inputClass}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className={
          confirming
            ? 'rounded-full bg-red-600 px-6 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors disabled:opacity-50'
            : 'rounded-full border border-red-300 dark:border-red-800 px-6 py-2 text-sm font-medium text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 transition-colors'
        }
      >
        {pending ? 'Deleting…' : confirming ? 'Click again to permanently delete your account' : 'Delete account'}
      </button>
    </form>
  )
}

const labelClass = 'block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1'
const inputClass =
  'w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-500'
