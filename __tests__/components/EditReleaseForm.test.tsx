import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EditReleaseForm from '@/app/releases/[id]/edit/EditReleaseForm'

const mockUpdateRelease = jest.fn()

jest.mock('@/app/actions/updateRelease', () => ({
  updateRelease: (...args: unknown[]) => mockUpdateRelease(...args),
}))

const RELEASE = {
  releaseId: 1,
  title: 'Kind of Blue',
  originalReleaseYear: 1959,
  notes: null,
  coverImageUrl: null,
  artists: [
    {
      artist: { artistId: 1, name: 'Miles Davis', sortName: 'Davis, Miles' },
      artistOrder: 1,
    },
  ],
  genres: [],
}

describe('EditReleaseForm', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = jest.fn() as unknown as typeof fetch
  })

  it('shows a placeholder when the release has no cover image', () => {
    render(<EditReleaseForm release={RELEASE} allGenres={[]} returnTo="/pressings" />)

    expect(screen.getByText('Retrieve cover image')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('https://…')).toHaveValue('')
  })

  it('shows the existing cover image when the release already has one', () => {
    render(
      <EditReleaseForm
        release={{ ...RELEASE, coverImageUrl: 'https://example.com/cover.jpg' }}
        allGenres={[]}
        returnTo="/pressings"
      />
    )

    expect(screen.getByPlaceholderText('https://…')).toHaveValue('https://example.com/cover.jpg')
  })

  it('retrieves a cover image using the current title and primary artist, and fills the URL field', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ coverImageUrl: 'https://example.com/retrieved.jpg' }),
    })
    const user = userEvent.setup()
    render(<EditReleaseForm release={RELEASE} allGenres={[]} returnTo="/pressings" />)

    await user.click(screen.getByText('Retrieve cover image'))

    const calledUrl = new URL((global.fetch as jest.Mock).mock.calls[0][0], 'http://localhost')
    expect(calledUrl.pathname).toBe('/api/discogs/cover-image')
    expect(calledUrl.searchParams.get('title')).toBe('Kind of Blue')
    expect(calledUrl.searchParams.get('artist')).toBe('Miles Davis')

    expect(await screen.findByPlaceholderText('https://…')).toHaveValue('https://example.com/retrieved.jpg')
  })

  it('shows an error message when no cover image is found', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ coverImageUrl: null }),
    })
    const user = userEvent.setup()
    render(<EditReleaseForm release={RELEASE} allGenres={[]} returnTo="/pressings" />)

    await user.click(screen.getByText('Retrieve cover image'))

    expect(await screen.findByText('No cover image found on Discogs for this release.')).toBeInTheDocument()
  })

  it('shows the server error message when the request fails', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'Discogs search is rate-limited right now. Please try again in a minute.' }),
    })
    const user = userEvent.setup()
    render(<EditReleaseForm release={RELEASE} allGenres={[]} returnTo="/pressings" />)

    await user.click(screen.getByText('Retrieve cover image'))

    expect(
      await screen.findByText('Discogs search is rate-limited right now. Please try again in a minute.')
    ).toBeInTheDocument()
  })

  it('lets the user type a cover image URL in directly', async () => {
    const user = userEvent.setup()
    render(<EditReleaseForm release={RELEASE} allGenres={[]} returnTo="/pressings" />)

    const input = screen.getByPlaceholderText('https://…')
    await user.type(input, 'https://example.com/manual.jpg')

    expect(input).toHaveValue('https://example.com/manual.jpg')
  })
})
