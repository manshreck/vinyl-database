import { requireSession } from '@/lib/session'
import PressingSearchLauncher from './PressingSearchLauncher'

export default async function SearchForPressingPage() {
  const session = await requireSession()

  return <PressingSearchLauncher hasDiscogsToken={Boolean(session.discogsToken)} />
}
