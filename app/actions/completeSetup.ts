'use server'

import * as accounts from '@/lib/services/accounts'
import { requireSession } from '@/lib/session'
import { redirect } from 'next/navigation'

export async function completeSetup(formData: FormData) {
  const session = await requireSession()

  await accounts.completeSetup(
    session.userId,
    (formData.get('fullName') as string) ?? '',
    (formData.get('discogsToken') as string) ?? ''
  )

  redirect('/')
}
