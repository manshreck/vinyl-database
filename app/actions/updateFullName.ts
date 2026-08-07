'use server'

import * as accounts from '@/lib/services/accounts'
import { requireSession } from '@/lib/session'
import { revalidatePath } from 'next/cache'

export type FormState = { error: string } | { success: true } | null

export async function updateFullName(_prevState: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession()

  await accounts.setFullName(session.userId, (formData.get('fullName') as string) ?? '')
  revalidatePath('/account')
  revalidatePath('/')
  return { success: true }
}
