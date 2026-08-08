import {
  cleanDiscogsArtistName,
  guessFormatName,
  guessGenreNames,
  matchGenreIds,
  guessDiscCount,
  guessVinylColorFromFormatText,
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

  it('spells out Discogs\' compilation placeholder', () => {
    expect(cleanDiscogsArtistName('Various')).toBe('Various Artists')
  })

  it('leaves a name that is already spelled out alone', () => {
    expect(cleanDiscogsArtistName('Various Artists')).toBe('Various Artists')
  })

  // "Various Production" is a real artist, so this must match the whole name and not
  // merely start with it.
  it('does not rewrite a real artist whose name begins with Various', () => {
    expect(cleanDiscogsArtistName('Various Production')).toBe('Various Production')
  })

  it('still strips the suffix before recognising the placeholder', () => {
    expect(cleanDiscogsArtistName('Various (3)')).toBe('Various Artists')
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

  it('splits the genres that bundle several of ours', () => {
    expect(guessGenreNames(['Funk / Soul'])).toEqual(['Funk', 'R&B / Soul'])
    expect(guessGenreNames(['Folk, World, & Country'])).toEqual(['Folk', 'World', 'Country'])
  })

  it('accepts the unpunctuated spelling of the same bundled genre', () => {
    expect(guessGenreNames(['Folk World & Country'])).toEqual(['Folk', 'World', 'Country'])
  })

  it('renames "Stage & Screen" to Soundtrack', () => {
    expect(guessGenreNames(['Stage & Screen'])).toEqual(['Soundtrack'])
  })

  it('does not invent a genre for Discogs genres we have no counterpart for', () => {
    expect(guessGenreNames(['Brass & Military'])).toEqual(['Brass & Military'])
  })

  describe('genres Discogs only files as styles', () => {
    it('reads Punk, Ambient, Metal and Spoken Word out of styles', () => {
      expect(guessGenreNames(['Rock'], ['Punk'])).toEqual(['Rock', 'Punk'])
      expect(guessGenreNames(['Electronic'], ['Ambient'])).toEqual(['Electronica', 'Ambient'])
      expect(guessGenreNames(['Non-Music'], ['Spoken Word'])).toContain('Spoken Word')
    })

    it('reaches the plain genre through a qualified style', () => {
      expect(guessGenreNames(['Rock'], ['Nu Metal'])).toEqual(['Rock', 'Metal'])
      expect(guessGenreNames(['Rock'], ['Post-Punk'])).toEqual(['Rock', 'Punk'])
      expect(guessGenreNames(['Electronic'], ['Dark Ambient'])).toEqual(['Electronica', 'Ambient'])
    })

    it('ignores styles that map to none of the four', () => {
      expect(guessGenreNames(['Jazz'], ['Fusion', 'Modal'])).toEqual(['Jazz'])
      expect(guessGenreNames(['Rock'], ['Rock & Roll'])).toEqual(['Rock'])
    })

    it('does not duplicate a genre already present', () => {
      expect(guessGenreNames(['Rock'], ['Punk', 'Punk Rock', 'Pop Punk'])).toEqual(['Rock', 'Punk'])
    })
  })

  /**
   * End-to-end over both functions, since guessGenreNames emits candidates and
   * matchGenreIds does the normalizing — only the pair shows what actually gets
   * ticked in the form. Payloads copied verbatim from the Discogs API.
   */
  describe('against real Discogs responses', () => {
    const OUR_GENRES = [
      'Ambient', 'Blues', 'Classical', 'Country', 'Electronica', 'Folk', 'Funk',
      'Hip-Hop', 'Jazz', 'Latin', 'Metal', 'Pop', 'Punk', 'R&B / Soul', 'Reggae',
      'Rock', 'Soundtrack', 'Spoken Word', 'World',
    ].map((name, i) => ({ genreId: i + 1, name }))

    function prefilled(genres: string[], styles: string[]): string[] {
      const ids = matchGenreIds(guessGenreNames(genres, styles), OUR_GENRES)
      return OUR_GENRES.filter((g) => ids.includes(g.genreId)).map((g) => g.name)
    }

    it.each([
      ['Illmatic', ['Hip Hop'], ['Conscious', 'Boom Bap'], ['Hip-Hop']],
      ['Ramones', ['Rock'], ['Rock & Roll', 'Punk'], ['Punk', 'Rock']],
      ['Music For Airports', ['Electronic'], ['Ambient', 'Minimal'], ['Ambient', 'Electronica']],
      ['Meteora', ['Rock'], ['Nu Metal'], ['Metal', 'Rock']],
      ['Star Wars', ['Stage & Screen'], ['Soundtrack', 'Score'], ['Soundtrack']],
      ['Bitches Brew', ['Jazz'], ['Fusion'], ['Jazz']],
      ['Talk Is Cheap', ['Non-Music'], ['Spoken Word'], ['Spoken Word']],
      [
        'Pink Moon',
        ['Rock', 'Folk, World, & Country'],
        ['Acoustic', 'Folk', 'Folk Rock'],
        ['Country', 'Folk', 'Rock', 'World'],
      ],
      [
        'Small Talk',
        ['Jazz', 'Funk / Soul'],
        ['Jazz-Funk', 'Rhythm & Blues', 'Funk'],
        ['Funk', 'Jazz', 'R&B / Soul'],
      ],
    ])('%s', (_title, genres, styles, expected) => {
      expect(prefilled(genres, styles)).toEqual(expected)
    })

    it('ticks nothing when Discogs offers no genre we carry', () => {
      expect(prefilled(['Brass & Military'], [])).toEqual([])
    })
  })
})

describe('matchGenreIds', () => {
  const AVAILABLE = [
    { genreId: 8, name: 'Hip-Hop' },
    { genreId: 16, name: 'Rock' },
    { genreId: 14, name: 'R&B / Soul' },
    { genreId: 17, name: 'Spoken Word' },
  ]

  it('matches across a punctuation difference between the two vocabularies', () => {
    expect(matchGenreIds(['Hip Hop'], AVAILABLE)).toEqual([8])
  })

  it('matches regardless of case and spacing', () => {
    expect(matchGenreIds(['hip hop', 'r&b/soul', 'spokenword'], AVAILABLE)).toEqual([8, 14, 17])
  })

  it('returns ids for only the genres actually on hand', () => {
    expect(matchGenreIds(['Rock', 'Klezmer'], AVAILABLE)).toEqual([16])
  })

  it('returns nothing when there are no candidates', () => {
    expect(matchGenreIds([], AVAILABLE)).toEqual([])
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

describe('guessVinylColorFromFormatText', () => {
  it('extracts a single color', () => {
    expect(guessVinylColorFromFormatText('Blue, 180g')).toBe('Blue')
  })

  it('keeps a multi-word color/finish segment intact', () => {
    expect(guessVinylColorFromFormatText('Orange Transparent')).toBe('Orange Transparent')
  })

  it('joins multiple color segments', () => {
    expect(guessVinylColorFromFormatText('Red, Clear, 180g')).toBe('Red, Clear')
  })

  it('returns null for pressing-plant notes with no color info', () => {
    expect(guessVinylColorFromFormatText('Terre Haute Pressing')).toBeNull()
  })

  it('returns null for null or empty input', () => {
    expect(guessVinylColorFromFormatText(null)).toBeNull()
    expect(guessVinylColorFromFormatText(undefined)).toBeNull()
    expect(guessVinylColorFromFormatText('')).toBeNull()
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
    styles: [],
    labels: [{ name: 'Columbia', catno: 'CS 8163' }],
    formats: [{ name: 'Vinyl', qty: '1', descriptions: ['LP', 'Album', 'Reissue'] }],
    vinylColor: 'Blue',
    notes: 'Some notes',
    coverImageUrl: 'https://i.discogs.com/cover.jpg',
  }

  it('maps release fields into the form prefill shape', () => {
    expect(buildDiscogsInitialValues(release)).toEqual({
      title: 'Kind Of Blue',
      originalReleaseYear: 1959,
      pressingYear: 2010,
      artistName: 'Miles Davis',
      genreNames: ['Jazz'],
      formatName: 'LP',
      country: 'US',
      label: 'Columbia',
      catalogNumber: 'CS 8163',
      discCount: 1,
      vinylColor: 'Blue',
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
