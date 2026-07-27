import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EditWishlistItemForm from '@/app/wishlist/[id]/edit/EditWishlistItemForm'

const mockUpdateWishlistItem = jest.fn()
const mockDeleteWishlistItem = jest.fn()

jest.mock('@/app/actions/updateWishlistItem', () => ({
  updateWishlistItem: (...args: unknown[]) => mockUpdateWishlistItem(...args),
}))

jest.mock('@/app/actions/deleteWishlistItem', () => ({
  deleteWishlistItem: (...args: unknown[]) => mockDeleteWishlistItem(...args),
}))

const FORMATS = [{ formatId: 1, name: 'LP' }]

const BASE_ITEM = {
  wishlistItemId: 7,
  releaseId: 3,
  formatId: 1,
  pressingYear: 1973,
  country: 'US',
  label: 'Island',
  catalogNumber: 'ILPS 9329',
  vinylColor: null,
  discCount: 1,
  notes: null,
  release: {
    title: 'Exodus',
    originalReleaseYear: 1977,
    coverImageUrl: null as string | null,
    artists: [{ artist: { name: 'Bob Marley & The Wailers' } }],
  },
}

describe('EditWishlistItemForm', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('shows the release cover image when one already exists, with no retrieve button', () => {
    const { container } = render(
      <EditWishlistItemForm
        item={{ ...BASE_ITEM, release: { ...BASE_ITEM.release, coverImageUrl: 'https://i.discogs.com/cover.jpg' } }}
        formats={FORMATS}
      />
    )
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://i.discogs.com/cover.jpg')
    expect(screen.queryByText('Retrieve cover image')).not.toBeInTheDocument()
  })

  it('shows a "Retrieve cover image" affordance when there is no cover image yet', () => {
    const { container } = render(<EditWishlistItemForm item={BASE_ITEM} formats={FORMATS} />)
    expect(screen.getByText('Retrieve cover image')).toBeInTheDocument()
    expect(container.querySelector('img')).not.toBeInTheDocument()
  })

  it('displays the retrieved image after clicking "Retrieve cover image"', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ coverImageUrl: 'https://i.discogs.com/found.jpg' }),
    }) as unknown as typeof fetch
    const user = userEvent.setup()
    const { container } = render(<EditWishlistItemForm item={BASE_ITEM} formats={FORMATS} />)

    await user.click(screen.getByText('Retrieve cover image'))

    await waitFor(() => {
      expect(container.querySelector('img')).toHaveAttribute('src', 'https://i.discogs.com/found.jpg')
    })
  })

  it('shows an error message when Discogs has no cover image for this release', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ coverImageUrl: null }),
    }) as unknown as typeof fetch
    const user = userEvent.setup()
    render(<EditWishlistItemForm item={BASE_ITEM} formats={FORMATS} />)

    await user.click(screen.getByText('Retrieve cover image'))

    expect(await screen.findByText('No cover image found on Discogs for this release.')).toBeInTheDocument()
  })

  it('requires a second click on "Remove from wishlist" before calling deleteWishlistItem', async () => {
    const user = userEvent.setup()
    render(<EditWishlistItemForm item={BASE_ITEM} formats={FORMATS} />)

    await user.click(screen.getByText('Remove from wishlist'))
    expect(mockDeleteWishlistItem).not.toHaveBeenCalled()
    expect(screen.getByText('Click again to confirm removal')).toBeInTheDocument()

    await user.click(screen.getByText('Click again to confirm removal'))
    expect(mockDeleteWishlistItem).toHaveBeenCalledWith(7)
  })

  it('submits the updated fields via updateWishlistItem', async () => {
    const user = userEvent.setup()
    render(<EditWishlistItemForm item={BASE_ITEM} formats={FORMATS} />)

    await user.click(screen.getByText('Save changes'))

    expect(mockUpdateWishlistItem).toHaveBeenCalledTimes(1)
    expect(mockUpdateWishlistItem.mock.calls[0][0]).toBe(7)
  })
})
