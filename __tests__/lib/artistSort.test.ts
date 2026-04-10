import { artistSortKey } from '@/lib/artistSort'

describe('artistSortKey', () => {
  it('lowercases the sort name', () => {
    expect(artistSortKey('Davis, Miles')).toBe('davis, miles')
  })

  it('strips a leading "The " (case-insensitive)', () => {
    expect(artistSortKey('The Beatles')).toBe('beatles')
    expect(artistSortKey('the beatles')).toBe('beatles')
    expect(artistSortKey('THE BEATLES')).toBe('beatles')
  })

  it('strips a leading "A " (case-insensitive)', () => {
    expect(artistSortKey('A Tribe Called Quest')).toBe('tribe called quest')
    expect(artistSortKey('a flock of seagulls')).toBe('flock of seagulls')
  })

  it('strips a leading "An " (case-insensitive)', () => {
    expect(artistSortKey('An Artist')).toBe('artist')
    expect(artistSortKey('AN ARTIST')).toBe('artist')
  })

  it('does not strip articles that appear later in the name', () => {
    expect(artistSortKey('Neil the Young')).toBe('neil the young')
    expect(artistSortKey('Beatles, The')).toBe('beatles, the')
  })

  it('handles names that do not start with an article', () => {
    expect(artistSortKey('Miles Davis')).toBe('miles davis')
    expect(artistSortKey('Radiohead')).toBe('radiohead')
  })

  it('handles an empty string', () => {
    expect(artistSortKey('')).toBe('')
  })
})
