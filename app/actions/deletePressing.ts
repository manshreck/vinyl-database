'use server'

import { getTenantPrisma } from '@/lib/prisma'
import { requireSession } from '@/lib/session'
import * as pressings from '@/lib/services/pressings'
import { redirect } from 'next/navigation'

export async function deletePressing(id: number) {
  const session = await requireSession()
  const prisma = await getTenantPrisma(session.databaseName)

  await pressings.deletePressing(prisma, id)
  redirect('/pressings')
}
