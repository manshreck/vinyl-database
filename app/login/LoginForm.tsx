'use client'

import { useActionState } from 'react'
import { loginUser, type FormState } from '@/app/actions/loginUser'

const initialState: FormState = null

export default function LoginForm() {
  const [state, formAction, pending] = useActionState(loginUser, initialState)

  return (
    <form action={formAction} className="space-y-4">
      {state?.error && (
        <p className="rounded-lg bg-red-50 dark:bg-red-950 px-4 py-2 text-sm text-red-700 dark:text-red-300">
          {state.error}
        </p>
      )}

      <div>
        <label className={labelClass}>Email</label>
        <input name="email" type="email" required autoComplete="email" className={inputClass} />
      </div>

      <div>
        <label className={labelClass}>Password</label>
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className={inputClass}
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-full bg-zinc-900 px-6 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors disabled:opacity-50"
      >
        {pending ? 'Logging in…' : 'Log in'}
      </button>
    </form>
  )
}

const labelClass = 'block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1'
const inputClass =
  'w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-500'
