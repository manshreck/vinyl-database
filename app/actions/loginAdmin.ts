'use server'

import { createAdminSessionCookie } from '@/lib/adminSession'
import { ADMIN_PASSWORD, ADMIN_USERNAME } from '@/lib/adminCredentials'
import { redirect } from 'next/navigation'

export type FormState = { error: string } | null

export async function loginAdmin(_prevState: FormState, formData: FormData): Promise<FormState> {
  const username = formData.get('username') as string
  const password = formData.get('password') as string

  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    return { error: 'Invalid username or password.' }
  }

  await createAdminSessionCookie()
  redirect('/admin')
}
