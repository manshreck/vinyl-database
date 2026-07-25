import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SearchForm from '@/app/search/SearchForm'

const mockPush = jest.fn()
let mockParams = new URLSearchParams()

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => mockParams,
}))

describe('SearchForm', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockParams = new URLSearchParams()
  })

  it('shows wildcard-mode placeholders by default', () => {
    render(<SearchForm />)
    expect(screen.getByPlaceholderText('e.g. Kind* or *Blue*')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('e.g. Miles* or *Davis*')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('e.g. 1969')).toBeInTheDocument()
    expect(screen.getByText(/Wildcard mode/)).toBeInTheDocument()
  })

  it('switches to regex-mode placeholders and label when the toggle is checked', async () => {
    const user = userEvent.setup()
    render(<SearchForm />)

    await user.click(screen.getByRole('checkbox'))

    expect(screen.getByText(/Regex mode \(PostgreSQL\)/)).toBeInTheDocument()
    expect(screen.getByPlaceholderText('e.g. ^Kind of Blue$ or blue|green')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('e.g. ^Miles|Coltrane')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('e.g. 196[0-9] or ^197')).toBeInTheDocument()
  })

  it('submits Search Collection with the entered fields as query params', async () => {
    const user = userEvent.setup()
    render(<SearchForm />)

    await user.type(screen.getByPlaceholderText('e.g. Kind* or *Blue*'), 'Kind*')
    await user.type(screen.getByPlaceholderText('e.g. Miles* or *Davis*'), 'Miles*')
    await user.click(screen.getByText('Search Collection'))

    expect(mockPush).toHaveBeenCalledWith('/search?title=Kind*&artist=Miles*')
  })

  it('includes regex=1 when regex mode is on at submit time', async () => {
    const user = userEvent.setup()
    render(<SearchForm />)

    await user.click(screen.getByRole('checkbox'))
    await user.type(screen.getByPlaceholderText('e.g. ^Kind of Blue$ or blue|green'), '^Kind')
    await user.click(screen.getByText('Search Collection'))

    expect(mockPush).toHaveBeenCalledWith('/search?title=%5EKind&regex=1')
  })

  it('builds a Discogs query from artist and title, in artist-then-title order', async () => {
    const user = userEvent.setup()
    render(<SearchForm />)

    await user.type(screen.getByPlaceholderText('e.g. Kind* or *Blue*'), 'Kind of Blue')
    await user.type(screen.getByPlaceholderText('e.g. Miles* or *Davis*'), 'Miles Davis')
    await user.click(screen.getByText('Search Discogs'))

    expect(mockPush).toHaveBeenCalledWith('/discogs?q=' + encodeURIComponent('Miles Davis Kind of Blue'))
  })

  it('omits blank fields when building the Discogs query', async () => {
    const user = userEvent.setup()
    render(<SearchForm />)

    await user.type(screen.getByPlaceholderText('e.g. Kind* or *Blue*'), 'Kind of Blue')
    await user.click(screen.getByText('Search Discogs'))

    expect(mockPush).toHaveBeenCalledWith('/discogs?q=' + encodeURIComponent('Kind of Blue'))
  })

  it('navigates to /discogs with no query when every field is blank', async () => {
    const user = userEvent.setup()
    render(<SearchForm />)

    await user.click(screen.getByText('Search Discogs'))

    expect(mockPush).toHaveBeenCalledWith('/discogs')
  })

  it('does not navigate to /search when Search Discogs is clicked', async () => {
    const user = userEvent.setup()
    render(<SearchForm />)

    await user.type(screen.getByPlaceholderText('e.g. Kind* or *Blue*'), 'Kind of Blue')
    await user.click(screen.getByText('Search Discogs'))

    expect(mockPush).toHaveBeenCalledTimes(1)
    expect(mockPush).not.toHaveBeenCalledWith(expect.stringContaining('/search'))
  })
})
