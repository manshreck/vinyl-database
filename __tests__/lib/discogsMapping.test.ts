import {
  cleanDiscogsArtistName,
  guessFormatName,
  guessGenreNames,
  guessDiscCount,
  buildDiscogsInitialValues,
} from '@/lib/discogsMapping'
import type { DiscogsReleaseDetail } from '@/lib/discogs'

describe('cleanDiscogsArtistName', () => {
  it('strips a numeric disambiguation suffix', () => {
    expect(cleanDiscogsArtistName('Genesis (2)')).toBe('Genesis')
  })

  it('leaves names without a suffix untouched', () => {
    expect(cleanDiscogsArtistName('Miles Davis')).toBe('Miles Davis')
  })

  it('does not strip a number that is part of the actual name', () => {
    expect(cleanDiscogsArtistName('Blink-182')).toBe('Blink-182')
  })
})

describe('guessFormatName', () => {
  it('matches LP from descriptions', () => {
    expect(guessFormatName([{ descriptions: ['LP', 'Album', 'Stereo'] }])).toBe('LP')
  })

  it('matches quoted inch formats', () => {
    expect(guessFormatName([{ descriptions: ['12"', 'Maxi-Single'] }])).toBe('12"')
  })

  it('returns null when nothing matches', () => {
    expect(guessFormatName([{ descriptions: ['Album', 'Reissue'] }])).toBeNull()
  })

  it('returns null for an empty formats array', () => {
    expect(guessFormatName([])).toBeNull()
  })
})

describe('guessGenreNames', () => {
  it('maps Discogs "Electronic" to our "Electronica"', () => {
    expect(guessGenreNames(['Electronic'])).toEqual(['Electronica'])
  })

  it('passes through genres with no alias unchanged', () => {
    expect(guessGenreNames(['Rock', 'Jazz'])).toEqual(['Rock', 'Jazz'])
  })
})

describe('guessDiscCount', () => {
  it('reads qty from the first format with a valid quantity', () => {
    expect(guessDiscCount([{ qty: '2' }])).toBe(2)
  })

  it('defaults to 1 when qty is missing', () => {
    expect(guessDiscCount([{ qty: null }])).toBe(1)
  })

  it('defaults to 1 when qty is not a valid number', () => {
    expect(guessDiscCount([{ qty: 'n/a' }])).toBe(1)
  })
})

describe('buildDiscogsInitialValues', () => {
  const release: DiscogsReleaseDetail = {
    id: 123,
    title: 'Kind Of Blue',
    artists: ['Miles Davis'],
    pressingYear: 2010,
    originalReleaseYear: 1959,
    country: 'US',
    genres: ['Jazz'],
    labels: [{ name: 'Columbia', catno: 'CS 8163' }],
    formats: [{ name: 'Vinyl', qty: '1', descriptions: ['LP', 'Album', 'Reissue'] }],
    notes: 'Some notes',
    coverImageUrl: 'https://i.discogs.com/cover.jpg',
  }

  it('maps release fields into the form prefill shape', () => {
    expect(buildDiscogsInitialValues(release)).toEqual({
      title: 'Kind Of Blue',
      originalReleaseYear: 1959,
      artistName: 'Miles Davis',
      genreNames: ['Jazz'],
      formatName: 'LP',
      country: 'US',
      label: 'Columbia',
      catalogNumber: 'CS 8163',
      discCount: 1,
      coverImageUrl: 'https://i.discogs.com/cover.jpg',
    })
  })

  it('falls back to an empty artist name and null label/catalog when absent', () => {
    const result = buildDiscogsInitialValues({ ...release, artists: [], labels: [] })
    expect(result.artistName).toBe('')
    expect(result.label).toBeNull()
    expect(result.catalogNumber).toBeNull()
  })
})
