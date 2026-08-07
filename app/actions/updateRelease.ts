'use server'

import { getTenantPrisma } from '@/lib/prisma'
import { requireSession } from '@/lib/session'
import * as releases from '@/lib/services/releases'
import { parseArtistRenames } from '@/app/actions/formInput'
import { redirect } from 'next/navigation'

export type FormState = { error: string } | null

export async function updateRelease(
  releaseId: number,
  returnTo: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const session = await requireSession()
  const prisma = await getTenantPrisma(session.databaseName)

  const result = await releases.updateRelease(prisma, releaseId, {
    title: ((formData.get('title') as string) ?? '').trim(),
    originalReleaseYear: Number(formData.get('originalReleaseYear')),
    notes: ((formData.get('notes') as string) ?? '').trim() || null,
    coverImageUrl: ((formData.get('coverImageUrl') as string) ?? '').trim() || null,
    genreIds: formData.getAll('genreIds').map(Number).filter(Boolean),
    renames: parseArtistRenames(formData),
  })

  if (result.status === 'artist_name_conflict') {
    return {
      error: `An artist named "${result.name}" already exists. Choose a different name, or edit that artist directly.`,
    }
  }

  redirect(returnTo)
}
