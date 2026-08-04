/** The shape the summary needs from a loaded pressing — its release's artists. */
type PressingWithArtists = {
  release: { artists: Array<{ artist: { artistId: number } }> }
}

/**
 * Counts the distinct artists represented across a set of pressings.
 *
 * Not the same as counting artist rows: an artist can exist with no pressings (added
 * via the wishlist, or left behind when a pressing was deleted), and a release can
 * credit several artists. Derived from pressings already in memory so a filtered view
 * can report its own subset without a second query.
 */
export function countDistinctArtists(pressings: PressingWithArtists[]): number {
  const ids = new Set<number>()
  for (const pressing of pressings) {
    for (const { artist } of pressing.release.artists) ids.add(artist.artistId)
  }
  return ids.size
}
