import React from 'react'
import { render, screen } from '@testing-library/react'
import CoverImageErrorNotice from '@/app/components/CoverImageErrorNotice'

describe('CoverImageErrorNotice', () => {
  it('renders nothing when there is no error', () => {
    const { container } = render(<CoverImageErrorNotice error={null} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('points at the Account page when Discogs rejected the token', () => {
    render(
      <CoverImageErrorNotice
        error={{ message: 'Discogs rejected your token.', tokenRejected: true }}
      />
    )

    expect(screen.getByText(/Discogs rejected your token/)).toBeInTheDocument()
    const link = screen.getByText('Update your Discogs token')
    expect(link).toHaveAttribute('href', '/account')
    // Opens in a new tab: the form is mid-edit and would otherwise be discarded.
    expect(link).toHaveAttribute('target', '_blank')
  })

  // Pointing at the Account page for these would send the user somewhere useless.
  it('offers no link for failures a new token would not fix', () => {
    render(
      <CoverImageErrorNotice
        error={{ message: 'No cover image found on Discogs for this release.', tokenRejected: false }}
      />
    )

    expect(screen.getByText(/No cover image found/)).toBeInTheDocument()
    expect(screen.queryByText('Update your Discogs token')).not.toBeInTheDocument()
  })
})
