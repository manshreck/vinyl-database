'use server'

import { updateDiscogsToken, updateFullName } from '@/lib/controlDb'
import { requireSession } from '@/lib/session'
import { redirect } from 'next/navigation'

export async function completeSetup(formData: FormData) {
  const session = await requireSession()

  const fullName = (formData.get('fullName') as string).trim()
  const discogsToken = (formData.get('discogsToken') as string).trim()

  await Promise.all([
    updateFullName(session.userId, fullName || null),
    updateDiscogsToken(session.userId, discogsToken || null),
  ])

  redirect('/')
}
