'use server'

import { getTenantPrisma } from '@/lib/prisma'
import { requireSession } from '@/lib/session'
import { redirect } from 'next/navigation'

export async function deletePressing(id: number) {
  const session = await requireSession()
  const prisma = await getTenantPrisma(session.databaseName)

  await prisma.pressing.delete({ where: { pressingId: id } })
  redirect('/pressings')
}
