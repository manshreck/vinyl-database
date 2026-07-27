'use server'

import { updateFullName as updateFullNameInDb } from '@/lib/controlDb'
import { requireSession } from '@/lib/session'
import { revalidatePath } from 'next/cache'

export type FormState = { error: string } | { success: true } | null

export async function updateFullName(_prevState: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession()

  const fullName = (formData.get('fullName') as string).trim()

  await updateFullNameInDb(session.userId, fullName || null)
  revalidatePath('/account')
  revalidatePath('/')
  return { success: true }
}
