'use server'

import { findUserByEmail, updatePasswordHash } from '@/lib/controlDb'
import { hashPassword, verifyPassword } from '@/lib/password'
import { requireSession } from '@/lib/session'

export type FormState = { error: string } | { success: true } | null

export async function changePassword(_prevState: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession()

  const currentPassword = formData.get('currentPassword') as string
  const newPassword = formData.get('newPassword') as string
  const confirmNewPassword = formData.get('confirmNewPassword') as string

  if (!currentPassword || !newPassword) return { error: 'All fields are required.' }
  if (newPassword.length < 8) return { error: 'New password must be at least 8 characters.' }
  if (newPassword !== confirmNewPassword) return { error: 'New passwords do not match.' }

  const user = await findUserByEmail(session.email)
  if (!user || !verifyPassword(currentPassword, user.passwordHash)) {
    return { error: 'Current password is incorrect.' }
  }

  await updatePasswordHash(user.id, hashPassword(newPassword))
  return { success: true }
}
