import React from 'react'
import { render, screen, within, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import WishlistForm from '@/app/wishlist/new/WishlistForm'

const mockCreateWishlistItem = jest.fn()

jest.mock('@/app/actions/createWishlistItem', () => ({
  createWishlistItem: (...args: unknown[]) => mockCreateWishlistItem(...args),
}))

describe('WishlistForm', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = jest.fn().mockResolvedValue({ json: () => Promise.resolve([]) }) as unknown as typeof fetch
  })

  it('opens directly on the manual New release form with Pressing details already visible', () => {
    const { container } = render(<WishlistForm formats={[]} genres={[]} />)

    expect(screen.getByText('New release')).toBeInTheDocument()
    expect(screen.getByText('Pressing details')).toBeInTheDocument()
    expect(container.querySelector('input[name="newReleaseTitle"]')).toHaveValue('')
  })

  it('submits once a release is created and required fields are filled', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <WishlistForm formats={[{ formatId: 1, name: 'LP' }]} genres={[]} />
    )

    await user.type(container.querySelector('input[name="newReleaseTitle"]') as HTMLInputElement, 'Kind of Blue')
    await user.type(
      container.querySelector('input[name="newReleaseYear"]') as HTMLInputElement,
      '1959'
    )
    await user.type(screen.getByPlaceholderText('Search or enter artist name…'), 'Miles Davis')
    await user.selectOptions(container.querySelector('select[name="formatId"]') as HTMLSelectElement, 'LP')

    await user.click(screen.getByText('Save to wishlist'))

    expect(mockCreateWishlistItem).toHaveBeenCalledTimes(1)
  })

  it('pre-populates the Title field when given an initial title', () => {
    render(<WishlistForm formats={[]} genres={[]} initialTitle="Kind of Blue" />)

    expect(screen.getByDisplayValue('Kind of Blue')).toBeInTheDocument()
  })

  it('links Cancel on the New release form to /wishlist/search', () => {
    render(<WishlistForm formats={[]} genres={[]} />)

    expect(screen.getAllByText('Cancel')[0]).toHaveAttribute('href', '/wishlist/search')
  })

  it('renders with a preselected release and shows Pressing details immediately', () => {
    render(
      <WishlistForm
        formats={[]}
        genres={[]}
        selectedRelease={{
          releaseId: 42,
          title: 'Kind of Blue',
          originalReleaseYear: 1959,
          coverImageUrl: null,
          artists: [{ artist: { name: 'Miles Davis' } }],
        }}
      />
    )

    expect(screen.getByText('Kind of Blue')).toBeInTheDocument()
    expect(screen.getByText('Miles Davis')).toBeInTheDocument()
    expect(screen.getByText('Pressing details')).toBeInTheDocument()
    expect(screen.queryByText('New release')).not.toBeInTheDocument()
  })

  it('links Change on a preselected release to /wishlist/search', () => {
    render(
      <WishlistForm
        formats={[]}
        genres={[]}
        selectedRelease={{
          releaseId: 42,
          title: 'Kind of Blue',
          originalReleaseYear: 1959,
          coverImageUrl: null,
          artists: [{ artist: { name: 'Miles Davis' } }],
        }}
      />
    )

    expect(screen.getByText('Change')).toHaveAttribute('href', '/wishlist/search')
  })

  describe('when the action reports the release is already owned or wanted', () => {
    const DUPLICATE = {
      releaseId: 42,
      title: 'Kind of Blue',
      originalReleaseYear: 1959,
      coverImageUrl: null,
      artistNames: ['Miles Davis'],
      pressings: [],
      wishlistItems: [
        {
          wishlistItemId: 3,
          formatName: 'LP',
          pressingYear: 1959,
          country: 'US',
          label: 'Columbia',
          catalogNumber: 'CL 1355',
          vinylColor: null,
          discCount: 1,
          identical: true,
        },
      ],
    }

    async function submitAgainstDuplicate() {
      const user = userEvent.setup()
      const { container } = render(
        <WishlistForm
          formats={[{ formatId: 1, name: 'LP' }]}
          genres={[]}
          selectedRelease={{
            releaseId: 42,
            title: 'Kind of Blue',
            originalReleaseYear: 1959,
            coverImageUrl: null,
            artists: [{ artist: { name: 'Miles Davis' } }],
          }}
        />
      )

      await user.selectOptions(
        container.querySelector('select[name="formatId"]') as HTMLSelectElement,
        'LP'
      )
      await user.click(screen.getByText('Save to wishlist'))
      return user
    }

    it('shows the confirmation dialog instead of navigating away', async () => {
      mockCreateWishlistItem.mockResolvedValue({ duplicate: DUPLICATE })

      await submitAgainstDuplicate()

      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByText('This exact pressing is already on your wishlist')).toBeInTheDocument()
    })

    it('resubmits with confirmation when the user accepts the duplicate', async () => {
      mockCreateWishlistItem.mockResolvedValue({ duplicate: DUPLICATE })
      const user = await submitAgainstDuplicate()

      mockCreateWishlistItem.mockResolvedValue(undefined)
      await user.click(screen.getByText('Yes, add a second identical entry'))

      expect(mockCreateWishlistItem).toHaveBeenCalledTimes(2)
      const resubmitted = mockCreateWishlistItem.mock.calls[1][0] as FormData
      expect(resubmitted.get('confirmDuplicate')).toBe('true')
      expect(resubmitted.get('releaseId')).toBe('42')
    })

    it('does not resubmit when the user cancels, and leaves the form usable', async () => {
      mockCreateWishlistItem.mockResolvedValue({ duplicate: DUPLICATE })
      const user = await submitAgainstDuplicate()

      await user.click(within(screen.getByRole('dialog')).getByText('Cancel'))

      expect(mockCreateWishlistItem).toHaveBeenCalledTimes(1)
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.getByText('Save to wishlist')).not.toBeDisabled()
    })
  })

  // Same defect as PressingsForm: the artist box is a search field that is also
  // pre-filled from Discogs, and offered a dropdown duplicating the name already there.
  describe('artist autocomplete only searches for typed text', () => {
    const settleDebounce = () =>
      act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 400))
      })

    const searchedForArtists = () =>
      (global.fetch as jest.Mock).mock.calls.some(([url]) =>
        String(url).includes('/api/artists/search')
      )

    it('does not search for an artist name arriving pre-filled from Discogs', async () => {
      render(
        <WishlistForm
          formats={[]}
          genres={[]}
          initialValues={{
            title: 'Kind of Blue',
            originalReleaseYear: 1959,
            pressingYear: null,
            artistName: 'Miles Davis',
            genreIds: [],
            formatId: null,
            country: null,
            label: null,
            catalogNumber: null,
            discCount: 1,
            vinylColor: null,
            coverImageUrl: null,
          }}
        />
      )

      expect(screen.getByPlaceholderText('Search or enter artist name…')).toHaveValue('Miles Davis')
      await settleDebounce()

      expect(searchedForArtists()).toBe(false)
    })

    it('searches once the user actually types', async () => {
      const user = userEvent.setup()
      render(<WishlistForm formats={[]} genres={[]} />)

      await user.type(screen.getByPlaceholderText('Search or enter artist name…'), 'Miles')
      await settleDebounce()

      expect(searchedForArtists()).toBe(true)
    })
  })
})
