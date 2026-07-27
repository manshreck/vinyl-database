import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SearchForPressingPage from '@/app/pressings/search/page'

const mockPush = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

describe('SearchForPressingPage', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('links Add Record Manually to a blank /pressings/new', () => {
    render(<SearchForPressingPage />)

    expect(screen.getByText('+ Add Record Manually')).toHaveAttribute('href', '/pressings/new')
  })

  describe('Search for Existing Release in Collection', () => {
    it('navigates to /releases with the entered query when Search is clicked', async () => {
      const user = userEvent.setup()
      render(<SearchForPressingPage />)

      await user.type(screen.getByPlaceholderText('Search by title…'), 'Kind of Blue')
      await user.click(screen.getAllByText('Search')[1])

      expect(mockPush).toHaveBeenCalledWith('/releases?q=' + encodeURIComponent('Kind of Blue'))
    })

    it('navigates to /releases with no query when the box is left blank', async () => {
      const user = userEvent.setup()
      render(<SearchForPressingPage />)

      await user.click(screen.getAllByText('Search')[1])

      expect(mockPush).toHaveBeenCalledWith('/releases')
    })

    it('navigates on Enter without submitting anything', async () => {
      const user = userEvent.setup()
      render(<SearchForPressingPage />)

      await user.type(screen.getByPlaceholderText('Search by title…'), 'Kind of Blue{Enter}')

      expect(mockPush).toHaveBeenCalledWith('/releases?q=' + encodeURIComponent('Kind of Blue'))
    })
  })

  describe('Search for Release/Pressing on Discogs', () => {
    it('navigates to /discogs with the entered query when Search is clicked', async () => {
      const user = userEvent.setup()
      render(<SearchForPressingPage />)

      await user.type(screen.getByPlaceholderText('e.g. Kind of Blue, Miles Davis'), 'Exodus Bob Marley')
      await user.click(screen.getAllByText('Search')[0])

      expect(mockPush).toHaveBeenCalledWith('/discogs?q=' + encodeURIComponent('Exodus Bob Marley'))
    })

    it('navigates to /discogs with no query when the box is left blank', async () => {
      const user = userEvent.setup()
      render(<SearchForPressingPage />)

      await user.click(screen.getAllByText('Search')[0])

      expect(mockPush).toHaveBeenCalledWith('/discogs')
    })

    it('navigates on Enter without submitting anything', async () => {
      const user = userEvent.setup()
      render(<SearchForPressingPage />)

      await user.type(screen.getByPlaceholderText('e.g. Kind of Blue, Miles Davis'), 'Exodus{Enter}')

      expect(mockPush).toHaveBeenCalledWith('/discogs?q=' + encodeURIComponent('Exodus'))
    })
  })
})
