import { countDistinctArtists } from '@/lib/collectionSummary'

/** Builds a pressing carrying just the artist ids the summary reads. */
function pressing(...artistIds: number[]) {
  return { release: { artists: artistIds.map((artistId) => ({ artist: { artistId } })) } }
}

describe('countDistinctArtists', () => {
  it('counts nothing for an empty collection', () => {
    expect(countDistinctArtists([])).toBe(0)
  })

  it('counts one artist per pressing when each is distinct', () => {
    expect(countDistinctArtists([pressing(1), pressing(2), pressing(3)])).toBe(3)
  })

  it('counts an artist once across several of their pressings', () => {
    expect(countDistinctArtists([pressing(1), pressing(1), pressing(1)])).toBe(1)
  })

  it('counts every credited artist on a collaboration', () => {
    expect(countDistinctArtists([pressing(1, 2, 3)])).toBe(3)
  })

  it('does not double-count an artist credited on one release and solo on another', () => {
    expect(countDistinctArtists([pressing(1, 2), pressing(2)])).toBe(2)
  })

  it('tolerates a release with no credited artist', () => {
    expect(countDistinctArtists([pressing(), pressing(1)])).toBe(1)
  })
})
