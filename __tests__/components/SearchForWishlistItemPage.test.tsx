import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SearchForWishlistItemPage from '@/app/wishlist/search/page'

const mockPush = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

describe('SearchForWishlistItemPage', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('links Add Record Manually to a blank /wishlist/new', () => {
    render(<SearchForWishlistItemPage />)

    expect(screen.getByText('+ Add Record Manually')).toHaveAttribute('href', '/wishlist/new')
  })

  describe('Search for Existing Release in Collection', () => {
    it('navigates to /releases tagged for the wishlist with the entered query when Search is clicked', async () => {
      const user = userEvent.setup()
      render(<SearchForWishlistItemPage />)

      await user.type(screen.getByPlaceholderText('Search by title…'), 'Kind of Blue')
      await user.click(screen.getAllByText('Search')[1])

      const pushedUrl = new URL(mockPush.mock.calls[0][0], 'http://localhost')
      expect(pushedUrl.pathname).toBe('/releases')
      expect(pushedUrl.searchParams.get('q')).toBe('Kind of Blue')
      expect(pushedUrl.searchParams.get('for')).toBe('wishlist')
    })

    it('navigates to /releases tagged for the wishlist with no query when the box is left blank', async () => {
      const user = userEvent.setup()
      render(<SearchForWishlistItemPage />)

      await user.click(screen.getAllByText('Search')[1])

      const pushedUrl = new URL(mockPush.mock.calls[0][0], 'http://localhost')
      expect(pushedUrl.pathname).toBe('/releases')
      expect(pushedUrl.searchParams.get('q')).toBeNull()
      expect(pushedUrl.searchParams.get('for')).toBe('wishlist')
    })
  })

  describe('Search for Release/Pressing on Discogs', () => {
    it('navigates to /discogs with the entered query when Search is clicked', async () => {
      const user = userEvent.setup()
      render(<SearchForWishlistItemPage />)

      await user.type(screen.getByPlaceholderText('e.g. Kind of Blue, Miles Davis'), 'Exodus Bob Marley')
      await user.click(screen.getAllByText('Search')[0])

      expect(mockPush).toHaveBeenCalledWith('/discogs?q=' + encodeURIComponent('Exodus Bob Marley'))
    })

    it('navigates to /discogs with no query when the box is left blank', async () => {
      const user = userEvent.setup()
      render(<SearchForWishlistItemPage />)

      await user.click(screen.getAllByText('Search')[0])

      expect(mockPush).toHaveBeenCalledWith('/discogs')
    })
  })
})
