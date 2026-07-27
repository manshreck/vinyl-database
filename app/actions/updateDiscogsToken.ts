'use server'

import { updateDiscogsToken as updateDiscogsTokenInDb } from '@/lib/controlDb'
import { requireSession } from '@/lib/session'
import { revalidatePath } from 'next/cache'

export type FormState = { error: string } | { success: true } | null

export async function updateDiscogsToken(_prevState: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession()

  const token = (formData.get('discogsToken') as string).trim()

  await updateDiscogsTokenInDb(session.userId, token || null)
  revalidatePath('/account')
  return { success: true }
}
