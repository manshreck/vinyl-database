'use server'

import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'

export async function deletePressing(id: number) {
  await prisma.pressing.delete({ where: { pressingId: id } })
  redirect('/pressings')
}
