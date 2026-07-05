'use server'

import { findUserByEmail } from '@/lib/controlDb'
import { verifyPassword } from '@/lib/password'
import { createSessionCookie } from '@/lib/session'
import { redirect } from 'next/navigation'

export type FormState = { error: string } | null

export async function loginUser(_prevState: FormState, formData: FormData): Promise<FormState> {
  const email = (formData.get('email') as string).trim().toLowerCase()
  const password = formData.get('password') as string

  const user = await findUserByEmail(email)
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return { error: 'Invalid email or password.' }
  }

  await createSessionCookie(user.id)
  redirect('/')
}
