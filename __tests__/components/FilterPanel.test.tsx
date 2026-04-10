import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FilterPanel from '@/app/pressings/FilterPanel'

const mockPush = jest.fn()
let mockParams = new URLSearchParams()

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => mockParams,
}))

const ARTISTS = [
  { artistId: 1, name: 'Miles Davis' },
  { artistId: 2, name: 'John Coltrane' },
]
const FORMATS = [
  { formatId: 1, name: 'LP' },
  { formatId: 2, name: '45' },
]
const GENRES = [
  { genreId: 1, name: 'Jazz' },
  { genreId: 2, name: 'Blues' },
]

describe('FilterPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockParams = new URLSearchParams()
  })

  it('renders all three filter selects', () => {
    render(<FilterPanel artists={ARTISTS} formats={FORMATS} genres={GENRES} />)
    expect(screen.getByDisplayValue('All artists')).toBeInTheDocument()
    expect(screen.getByDisplayValue('All formats')).toBeInTheDocument()
    expect(screen.getByDisplayValue('All genres')).toBeInTheDocument()
  })

  it('populates artist options from props', () => {
    render(<FilterPanel artists={ARTISTS} formats={FORMATS} genres={GENRES} />)
    expect(screen.getByRole('option', { name: 'Miles Davis' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'John Coltrane' })).toBeInTheDocument()
  })

  it('does not show the clear button when no filters are active', () => {
    render(<FilterPanel artists={ARTISTS} formats={FORMATS} genres={GENRES} />)
    expect(screen.queryByRole('button', { name: /clear filters/i })).not.toBeInTheDocument()
  })

  it('shows the clear button when a filter param is set', () => {
    mockParams = new URLSearchParams('artistId=1')
    render(<FilterPanel artists={ARTISTS} formats={FORMATS} genres={GENRES} />)
    expect(screen.getByRole('button', { name: /clear filters/i })).toBeInTheDocument()
  })

  it('pushes a new URL with the artistId param when an artist is selected', async () => {
    const user = userEvent.setup()
    render(<FilterPanel artists={ARTISTS} formats={FORMATS} genres={GENRES} />)
    const artistSelect = screen.getByDisplayValue('All artists')
    await user.selectOptions(artistSelect, '1')
    expect(mockPush).toHaveBeenCalledWith('/pressings?artistId=1')
  })

  it('pushes a new URL with the formatId param when a format is selected', async () => {
    const user = userEvent.setup()
    render(<FilterPanel artists={ARTISTS} formats={FORMATS} genres={GENRES} />)
    const formatSelect = screen.getByDisplayValue('All formats')
    await user.selectOptions(formatSelect, '1')
    expect(mockPush).toHaveBeenCalledWith('/pressings?formatId=1')
  })

  it('removes the param when selecting the default empty option', async () => {
    mockParams = new URLSearchParams('artistId=1')
    const user = userEvent.setup()
    render(<FilterPanel artists={ARTISTS} formats={FORMATS} genres={GENRES} />)
    const artistSelect = screen.getByDisplayValue('Miles Davis')
    await user.selectOptions(artistSelect, '')
    expect(mockPush).toHaveBeenCalledWith('/pressings?')
  })

  it('navigates to /pressings when clear filters is clicked', async () => {
    mockParams = new URLSearchParams('artistId=1')
    const user = userEvent.setup()
    render(<FilterPanel artists={ARTISTS} formats={FORMATS} genres={GENRES} />)
    await user.click(screen.getByRole('button', { name: /clear filters/i }))
    expect(mockPush).toHaveBeenCalledWith('/pressings')
  })
})
