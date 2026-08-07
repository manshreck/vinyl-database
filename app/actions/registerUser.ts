'use server'

import * as accounts from '@/lib/services/accounts'
import { createSessionCookie } from '@/lib/session'
import { redirect } from 'next/navigation'

export type FormState = { error: string } | null

export async function registerUser(_prevState: FormState, formData: FormData): Promise<FormState> {
  const result = await accounts.registerUser({
    email: (formData.get('email') as string) ?? '',
    password: (formData.get('password') as string) ?? '',
    confirmPassword: (formData.get('confirmPassword') as string) ?? '',
  })

  if (result.status === 'invalid') return { error: result.message }

  await createSessionCookie(result.userId)
  redirect('/setup')
}
