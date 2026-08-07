'use server'

import * as accounts from '@/lib/services/accounts'
import { createSessionCookie } from '@/lib/session'
import { redirect } from 'next/navigation'

export type FormState = { error: string } | null

export async function loginUser(_prevState: FormState, formData: FormData): Promise<FormState> {
  const result = await accounts.authenticate(
    (formData.get('email') as string) ?? '',
    (formData.get('password') as string) ?? ''
  )

  if (result.status === 'invalid_credentials') return { error: 'Invalid email or password.' }

  await createSessionCookie(result.userId)
  redirect('/')
}
