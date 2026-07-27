import React from 'react'
import { render, screen } from '@testing-library/react'
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
})
