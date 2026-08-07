'use server'

import * as accounts from '@/lib/services/accounts'
import { requireSession } from '@/lib/session'

export type FormState = { error: string } | { success: true } | null

export async function changePassword(_prevState: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession()

  const result = await accounts.changePassword(session.email, {
    currentPassword: (formData.get('currentPassword') as string) ?? '',
    newPassword: (formData.get('newPassword') as string) ?? '',
    confirmNewPassword: (formData.get('confirmNewPassword') as string) ?? '',
  })

  return result.status === 'invalid' ? { error: result.message } : { success: true }
}
