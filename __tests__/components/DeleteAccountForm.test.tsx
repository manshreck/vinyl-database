import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DeleteAccountForm from '@/app/account/DeleteAccountForm'

const mockDeleteAccount = jest.fn()

jest.mock('@/app/actions/deleteAccount', () => ({
  deleteAccount: (...args: unknown[]) => mockDeleteAccount(...args),
}))

describe('DeleteAccountForm', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockDeleteAccount.mockResolvedValue(null)
  })

  it('does not submit on the first click; reveals a confirm button instead', async () => {
    const user = userEvent.setup()
    const { container } = render(<DeleteAccountForm />)

    await user.type(container.querySelector('input[name="password"]') as HTMLInputElement, 'my-password')
    await user.click(screen.getByText('Delete account'))

    expect(mockDeleteAccount).not.toHaveBeenCalled()
    expect(screen.getByText('Click again to permanently delete your account')).toBeInTheDocument()
  })

  // Regression: a lone text input in a form is natively submittable on Enter even
  // when the only visible button is type="button" (per the HTML spec's implicit
  // submission rule for single-field forms) — this bypassed the two-click
  // confirmation and deleted the account on the very first keystroke's Enter.
  it('does not submit when Enter is pressed in the password field before confirming', async () => {
    const user = userEvent.setup()
    const { container } = render(<DeleteAccountForm />)

    await user.type(container.querySelector('input[name="password"]') as HTMLInputElement, 'my-password{Enter}')

    expect(mockDeleteAccount).not.toHaveBeenCalled()
  })

  it('submits with the entered password on the second click', async () => {
    const user = userEvent.setup()
    const { container } = render(<DeleteAccountForm />)

    await user.type(container.querySelector('input[name="password"]') as HTMLInputElement, 'my-password')
    await user.click(screen.getByText('Delete account'))
    await user.click(screen.getByText('Click again to permanently delete your account'))

    expect(mockDeleteAccount).toHaveBeenCalledTimes(1)
    const [, formData] = mockDeleteAccount.mock.calls[0]
    expect(formData.get('password')).toBe('my-password')
  })

  it('shows an error message when deleteAccount rejects the password', async () => {
    mockDeleteAccount.mockResolvedValue({ error: 'Incorrect password.' })
    const user = userEvent.setup()
    const { container } = render(<DeleteAccountForm />)

    await user.type(container.querySelector('input[name="password"]') as HTMLInputElement, 'wrong-password')
    await user.click(screen.getByText('Delete account'))
    await user.click(screen.getByText('Click again to permanently delete your account'))

    expect(await screen.findByText('Incorrect password.')).toBeInTheDocument()
  })
})
