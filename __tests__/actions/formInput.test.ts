/**
 * @jest-environment node
 *
 * The web transport's translation layer: FormData in, typed service input out.
 *
 * Tested directly because it is the only place that knows form field names. The
 * services and lib/releaseIntake speak the typed shapes, and their tests construct
 * those shapes directly — so if this mapping were only exercised through them, a
 * second (test-only) translation would exist alongside this one and could drift from
 * it while every test still passed.
 */
import {
  isConfirmed,
  parseAcquisition,
  parseArtistRenames,
  parseCoverImageUrl,
  parsePressingDetails,
  parseReleaseSelection,
  parseWishlistDetails,
} from '@/app/actions/formInput'

function form(fields: Record<string, string | string[]>): FormData {
  const fd = new FormData()
  for (const [key, value] of Object.entries(fields)) {
    if (Array.isArray(value)) value.forEach((v) => fd.append(key, v))
    else fd.append(key, value)
  }
  return fd
}

describe('parseReleaseSelection', () => {
  it('reports an existing release when the form carries a releaseId', () => {
    expect(parseReleaseSelection(form({ releaseId: '42' }))).toEqual({
      kind: 'existing',
      releaseId: 42,
    })
  })

  it('describes a new release when no releaseId is present', () => {
    expect(
      parseReleaseSelection(
        form({
          newReleaseTitle: 'Kind Of Blue',
          newReleaseYear: '1959',
          newArtistName: 'Miles Davis',
          newArtistId: '12',
          genreIds: ['3', '7'],
          newReleaseCoverImageUrl: 'https://i.discogs.com/cover.jpg',
        })
      )
    ).toEqual({
      kind: 'new',
      title: 'Kind Of Blue',
      originalReleaseYear: 1959,
      artistId: 12,
      artistName: 'Miles Davis',
      genreIds: [3, 7],
      coverImageUrl: 'https://i.discogs.com/cover.jpg',
    })
  })

  it('trims the text fields', () => {
    const selection = parseReleaseSelection(
      form({ newReleaseTitle: '  Kind Of Blue  ', newArtistName: '  Miles Davis  ' })
    )
    expect(selection).toMatchObject({ title: 'Kind Of Blue', artistName: 'Miles Davis' })
  })

  // Regression: pressing Enter in the release search box submits with none of the
  // newRelease* fields present, which used to crash on .trim() of null.
  //
  // Note the year: Number(null) is 0, not NaN, so an absent year yields year 0 rather
  // than an obvious failure. Pinned here as the behavior that exists rather than the
  // behavior that is wanted — the web form marks the field required, so only a
  // non-browser caller can reach this. When the JSON API lands it must reject the
  // field outright (MOBILE_APP_PLAN D2), because 0 is a valid SMALLINT and would be
  // stored without complaint.
  it('survives the new-release fields being absent entirely', () => {
    expect(parseReleaseSelection(form({}))).toEqual({
      kind: 'new',
      title: '',
      originalReleaseYear: 0,
      artistId: null,
      artistName: '',
      genreIds: [],
      coverImageUrl: null,
    })
  })

  it('treats a picked artist as absent rather than zero when not chosen', () => {
    expect(parseReleaseSelection(form({ newArtistName: 'Miles' })).kind).toBe('new')
    expect(
      (parseReleaseSelection(form({ newArtistName: 'Miles' })) as { artistId: number | null })
        .artistId
    ).toBeNull()
  })

  it('drops empty genre ids rather than passing 0 through', () => {
    const selection = parseReleaseSelection(form({ genreIds: ['3', '', '7'] }))
    expect(selection).toMatchObject({ genreIds: [3, 7] })
  })
})

describe('parsePressingDetails', () => {
  const complete = {
    formatId: '4',
    pressingYear: '1959',
    country: 'US',
    label: 'Columbia',
    catalogNumber: 'CL 1355',
    vinylColor: 'Clear',
    discCount: '2',
    recordCondition: 'NM',
    sleeveCondition: 'VG_PLUS',
    notes: 'nice copy',
    purchasePrice: '42.50',
    purchaseDate: '2024-01-15',
    currentValue: '199.99',
  }

  it('maps every field to its typed form', () => {
    const details = parsePressingDetails(form(complete))
    expect(details).toMatchObject({
      formatId: 4,
      pressingYear: 1959,
      country: 'US',
      label: 'Columbia',
      catalogNumber: 'CL 1355',
      vinylColor: 'Clear',
      discCount: 2,
      recordCondition: 'NM',
      sleeveCondition: 'VG_PLUS',
      notes: 'nice copy',
      purchasePrice: 42.5,
      currentValue: 199.99,
    })
    expect(details.purchaseDate).toEqual(new Date('2024-01-15'))
  })

  // Every optional column is nullable; a blank input means "not provided", not "".
  it('turns blank optional fields into null, not empty strings or zero', () => {
    const details = parsePressingDetails(
      form({
        formatId: '4',
        recordCondition: 'NM',
        pressingYear: '',
        country: '',
        label: '',
        catalogNumber: '',
        vinylColor: '',
        notes: '',
        purchasePrice: '',
        purchaseDate: '',
        currentValue: '',
        discCount: '',
      })
    )
    expect(details).toEqual({
      formatId: 4,
      pressingYear: null,
      country: null,
      label: null,
      catalogNumber: null,
      vinylColor: null,
      discCount: 1,
      recordCondition: 'NM',
      sleeveCondition: null,
      notes: null,
      purchasePrice: null,
      purchaseDate: null,
      currentValue: null,
    })
  })

  it('defaults an absent disc count to one rather than zero', () => {
    expect(parsePressingDetails(form({ formatId: '4', recordCondition: 'NM' })).discCount).toBe(1)
  })

  it('trims text fields', () => {
    const details = parsePressingDetails(
      form({ formatId: '4', recordCondition: 'NM', label: '  Columbia  ' })
    )
    expect(details.label).toBe('Columbia')
  })
})

describe('parseWishlistDetails', () => {
  it('carries the pressing spec and notes, but no condition or cost', () => {
    const details = parseWishlistDetails(
      form({
        formatId: '3',
        pressingYear: '2007',
        country: 'USA',
        discCount: '2',
        notes: 'under $40',
        // Present in the form but meaningless for a wishlist entry:
        recordCondition: 'NM',
        purchasePrice: '10',
      })
    )
    expect(details).toEqual({
      formatId: 3,
      pressingYear: 2007,
      country: 'USA',
      label: null,
      catalogNumber: null,
      vinylColor: null,
      discCount: 2,
      notes: 'under $40',
    })
    expect(details).not.toHaveProperty('recordCondition')
    expect(details).not.toHaveProperty('purchasePrice')
  })
})

describe('parseAcquisition', () => {
  it('carries only what a wishlist entry never had', () => {
    expect(
      parseAcquisition(
        form({
          recordCondition: 'VG_PLUS',
          sleeveCondition: 'VG',
          purchasePrice: '25',
          purchaseDate: '2024-03-01',
          currentValue: '30',
          // The pressing spec comes from the stored wishlist item, not the form:
          formatId: '99',
          country: 'ignored',
        })
      )
    ).toEqual({
      recordCondition: 'VG_PLUS',
      sleeveCondition: 'VG',
      purchasePrice: 25,
      purchaseDate: new Date('2024-03-01'),
      currentValue: 30,
    })
  })
})

describe('parseArtistRenames', () => {
  it('pairs each artist id with its name and sort name', () => {
    expect(
      parseArtistRenames(
        form({
          artistIds: ['5', '9'],
          'name[5]': 'Miles Davis',
          'sortName[5]': 'Davis, Miles',
          'name[9]': 'John Coltrane',
          'sortName[9]': 'Coltrane, John',
        })
      )
    ).toEqual([
      { artistId: 5, name: 'Miles Davis', sortName: 'Davis, Miles' },
      { artistId: 9, name: 'John Coltrane', sortName: 'Coltrane, John' },
    ])
  })

  // A blank name is not a rename to "", it is an artist left alone.
  it('skips artists whose name field is blank', () => {
    expect(
      parseArtistRenames(form({ artistIds: ['5', '9'], 'name[5]': 'Miles Davis', 'name[9]': '  ' }))
    ).toEqual([{ artistId: 5, name: 'Miles Davis', sortName: '' }])
  })
})

describe('parseCoverImageUrl and isConfirmed', () => {
  it('reads a cover image url, blank meaning leave it alone', () => {
    expect(parseCoverImageUrl(form({ coverImageUrl: ' https://x/y.jpg ' }))).toBe('https://x/y.jpg')
    expect(parseCoverImageUrl(form({ coverImageUrl: '' }))).toBeNull()
    expect(parseCoverImageUrl(form({}))).toBeNull()
  })

  // The confirm flags are set by the dialogs; anything else must read as "not confirmed".
  it('treats only the exact string "true" as confirmation', () => {
    expect(isConfirmed(form({ confirmDuplicate: 'true' }), 'confirmDuplicate')).toBe(true)
    expect(isConfirmed(form({ confirmDuplicate: 'false' }), 'confirmDuplicate')).toBe(false)
    expect(isConfirmed(form({ confirmDuplicate: 'TRUE' }), 'confirmDuplicate')).toBe(false)
    expect(isConfirmed(form({ confirmDuplicate: '1' }), 'confirmDuplicate')).toBe(false)
    expect(isConfirmed(form({}), 'confirmDuplicate')).toBe(false)
  })
})
