import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DiscogsTokenForm from '@/app/account/DiscogsTokenForm'

const mockUpdateDiscogsToken = jest.fn()

jest.mock('@/app/actions/updateDiscogsToken', () => ({
  updateDiscogsToken: (...args: unknown[]) => mockUpdateDiscogsToken(...args),
}))

describe('DiscogsTokenForm', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('explains how to get a Discogs token regardless of whether one is set', () => {
    render(<DiscogsTokenForm token={null} />)

    expect(
      screen.getByText(/This app can look up releases on Discogs/)
    ).toBeInTheDocument()
    expect(screen.getByText('Log in to Discogs (or create a free account if you don’t have one).')).toBeInTheDocument()
  })

  it('shows a message that a token is set when token is present', () => {
    render(<DiscogsTokenForm token="my-real-token" />)

    expect(screen.getByText('A discogs token is set for your account.')).toBeInTheDocument()
  })

  it('shows a Replace Token button instead of Save Token when a token is present', () => {
    render(<DiscogsTokenForm token="my-real-token" />)

    expect(screen.getByRole('button', { name: 'Replace Token' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save Token' })).not.toBeInTheDocument()
  })

  it('links out to the Discogs developer settings page', () => {
    render(<DiscogsTokenForm token={null} />)

    expect(screen.getByText('Settings → Developers')).toHaveAttribute(
      'href',
      'https://www.discogs.com/settings/developers'
    )
  })

  it('does not show a Remove token button when no token is set', () => {
    render(<DiscogsTokenForm token={null} />)

    expect(screen.queryByText('Remove token')).not.toBeInTheDocument()
  })

  describe('reveal toggle', () => {
    it('does not show the current-token field when no token is set', () => {
      render(<DiscogsTokenForm token={null} />)

      expect(screen.queryByText('Click to reveal token')).not.toBeInTheDocument()
    })

    it('masks the current token by default', () => {
      const { container } = render(<DiscogsTokenForm token="my-real-token" />)

      const currentTokenInput = container.querySelector('input[readonly]') as HTMLInputElement
      expect(currentTokenInput.value).not.toBe('my-real-token')
      expect(currentTokenInput.value).toMatch(/^•+$/)
    })

    it('reveals the current token when clicked, and hides it again on a second click', async () => {
      const user = userEvent.setup()
      const { container } = render(<DiscogsTokenForm token="my-real-token" />)
      const currentTokenInput = container.querySelector('input[readonly]') as HTMLInputElement

      await user.click(screen.getByText('Click to reveal token'))
      expect(currentTokenInput.value).toBe('my-real-token')

      await user.click(screen.getByText('Hide token'))
      expect(currentTokenInput.value).toMatch(/^•+$/)
    })
  })

  it('submits the entered token', async () => {
    mockUpdateDiscogsToken.mockResolvedValue({ success: true })
    const user = userEvent.setup()
    const { container } = render(<DiscogsTokenForm token={null} />)

    await user.type(container.querySelector('input[name="discogsToken"]') as HTMLInputElement, 'new-token-abc')
    await user.click(screen.getByText('Save Token'))

    expect(mockUpdateDiscogsToken).toHaveBeenCalledTimes(1)
    const [, formData] = mockUpdateDiscogsToken.mock.calls[0]
    expect(formData.get('discogsToken')).toBe('new-token-abc')
  })

  it('shows the success message after a successful save', async () => {
    mockUpdateDiscogsToken.mockResolvedValue({ success: true })
    const user = userEvent.setup()
    const { container } = render(<DiscogsTokenForm token={null} />)

    await user.type(container.querySelector('input[name="discogsToken"]') as HTMLInputElement, 'new-token-abc')
    await user.click(screen.getByText('Save Token'))

    expect(await screen.findByText('Discogs token updated.')).toBeInTheDocument()
  })

  it('submits an empty token when Remove token is clicked', async () => {
    mockUpdateDiscogsToken.mockResolvedValue({ success: true })
    const user = userEvent.setup()
    render(<DiscogsTokenForm token="my-real-token" />)

    await user.click(screen.getByText('Remove token'))

    expect(mockUpdateDiscogsToken).toHaveBeenCalledTimes(1)
    const [, formData] = mockUpdateDiscogsToken.mock.calls[0]
    expect(formData.get('discogsToken')).toBe('')
  })
})
