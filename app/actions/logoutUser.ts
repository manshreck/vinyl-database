'use server'

import { clearSessionCookie } from '@/lib/session'
import { redirect } from 'next/navigation'

export async function logoutUser() {
  await clearSessionCookie()
  redirect('/login')
}
