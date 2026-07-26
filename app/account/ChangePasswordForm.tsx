'use client'

import { useActionState } from 'react'
import { changePassword, type FormState } from '@/app/actions/changePassword'

const initialState: FormState = null

export default function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState(changePassword, initialState)

  return (
    <form action={formAction} className="space-y-4">
      {state && 'error' in state && (
        <p className="rounded-lg bg-red-50 dark:bg-red-950 px-4 py-2 text-sm text-red-700 dark:text-red-300">
          {state.error}
        </p>
      )}
      {state && 'success' in state && (
        <p className="rounded-lg bg-green-50 dark:bg-green-950 px-4 py-2 text-sm text-green-700 dark:text-green-300">
          Password changed.
        </p>
      )}

      <div>
        <label className={labelClass}>Current password</label>
        <input
          name="currentPassword"
          type="password"
          required
          autoComplete="current-password"
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass}>New password</label>
        <input
          name="newPassword"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass}>Confirm new password</label>
        <input
          name="confirmNewPassword"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className={inputClass}
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-zinc-900 px-6 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors disabled:opacity-50"
      >
        {pending ? 'Saving…' : 'Change password'}
      </button>
    </form>
  )
}

const labelClass = 'block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1'
const inputClass =
  'w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-500'
