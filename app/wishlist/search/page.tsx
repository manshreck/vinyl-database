import { requireSession } from '@/lib/session'
import WishlistSearchLauncher from './WishlistSearchLauncher'

export default async function SearchForWishlistItemPage() {
  const session = await requireSession()

  return <WishlistSearchLauncher hasDiscogsToken={Boolean(session.discogsToken)} />
}
