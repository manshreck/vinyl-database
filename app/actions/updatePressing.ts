'use server'

import { getTenantPrisma } from '@/lib/prisma'
import { requireSession } from '@/lib/session'
import * as pressings from '@/lib/services/pressings'
import { parseCoverImageUrl, parsePressingDetails } from '@/app/actions/formInput'
import { redirect } from 'next/navigation'

export async function updatePressing(id: number, formData: FormData) {
  const session = await requireSession()
  const prisma = await getTenantPrisma(session.databaseName)

  await pressings.updatePressing(prisma, id, {
    details: parsePressingDetails(formData),
    coverImageUrl: parseCoverImageUrl(formData),
  })

  redirect('/pressings')
}
