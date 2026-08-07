'use server'

import * as accounts from '@/lib/services/accounts'
import { requireSession } from '@/lib/session'
import { revalidatePath } from 'next/cache'

export type FormState = { error: string } | { success: true } | null

export async function updateDiscogsToken(_prevState: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession()

  await accounts.setDiscogsToken(session.userId, (formData.get('discogsToken') as string) ?? '')
  revalidatePath('/account')
  return { success: true }
}
