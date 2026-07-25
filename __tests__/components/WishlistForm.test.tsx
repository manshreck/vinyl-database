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

  // Regression: this is the same crash class fixed in PressingsForm — pressing
  // Enter in the search box before a release is selected/created used to submit
  // the form with none of the newRelease* fields present, crashing resolveReleaseId.
  it('does not submit when Enter is pressed in the release search box before a release is chosen', async () => {
    const user = userEvent.setup()
    render(<WishlistForm formats={[]} genres={[]} />)

    await user.type(screen.getByPlaceholderText('Search by title…'), 'Kind of Blue{Enter}')

    expect(mockCreateWishlistItem).not.toHaveBeenCalled()
  })

  it('submits once a release is created and required fields are filled', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <WishlistForm formats={[{ formatId: 1, name: 'LP' }]} genres={[]} />
    )

    await user.type(screen.getByPlaceholderText('Search by title…'), 'Kind of Blue')
    await user.click(screen.getByText(/No results/))

    await user.type(
      container.querySelector('input[name="newReleaseYear"]') as HTMLInputElement,
      '1959'
    )
    await user.type(screen.getByPlaceholderText('Search or enter artist name…'), 'Miles Davis')
    await user.selectOptions(container.querySelector('select[name="formatId"]') as HTMLSelectElement, 'LP')

    await user.click(screen.getByText('Save to wishlist'))

    expect(mockCreateWishlistItem).toHaveBeenCalledTimes(1)
  })
})
