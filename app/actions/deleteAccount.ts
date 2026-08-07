'use server'

import * as accounts from '@/lib/services/accounts'
import { clearSessionCookie, requireSession } from '@/lib/session'
import { redirect } from 'next/navigation'

export type FormState = { error: string } | null

export async function deleteAccount(_prevState: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession()

  const result = await accounts.deleteAccount(session.email, (formData.get('password') as string) ?? '')
  if (result.status === 'invalid_password') return { error: 'Incorrect password.' }

  await clearSessionCookie()
  redirect('/login')
}
