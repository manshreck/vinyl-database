'use server'

import { clearAdminSessionCookie } from '@/lib/adminSession'
import { redirect } from 'next/navigation'

export async function logoutAdmin() {
  await clearAdminSessionCookie()
  redirect('/admin/login')
}
