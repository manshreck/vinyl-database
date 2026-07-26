import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ChangePasswordForm from '@/app/account/ChangePasswordForm'

const mockChangePassword = jest.fn()

jest.mock('@/app/actions/changePassword', () => ({
  changePassword: (...args: unknown[]) => mockChangePassword(...args),
}))

describe('ChangePasswordForm', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  async function fillAndSubmit(container: HTMLElement) {
    const user = userEvent.setup()
    await user.type(container.querySelector('input[name="currentPassword"]') as HTMLInputElement, 'old-pw-12345')
    await user.type(container.querySelector('input[name="newPassword"]') as HTMLInputElement, 'new-pw-12345')
    await user.type(container.querySelector('input[name="confirmNewPassword"]') as HTMLInputElement, 'new-pw-12345')
    await user.click(screen.getByText('Change password'))
  }

  it('submits the entered current/new/confirm passwords', async () => {
    mockChangePassword.mockResolvedValue({ success: true })
    const { container } = render(<ChangePasswordForm />)

    await fillAndSubmit(container)

    expect(mockChangePassword).toHaveBeenCalledTimes(1)
    const [, formData] = mockChangePassword.mock.calls[0]
    expect(formData.get('currentPassword')).toBe('old-pw-12345')
    expect(formData.get('newPassword')).toBe('new-pw-12345')
    expect(formData.get('confirmNewPassword')).toBe('new-pw-12345')
  })

  it('shows the success message after a successful change', async () => {
    mockChangePassword.mockResolvedValue({ success: true })
    const { container } = render(<ChangePasswordForm />)

    await fillAndSubmit(container)

    expect(await screen.findByText('Password changed.')).toBeInTheDocument()
  })

  it('shows the error message when changePassword rejects the request', async () => {
    mockChangePassword.mockResolvedValue({ error: 'Current password is incorrect.' })
    const { container } = render(<ChangePasswordForm />)

    await fillAndSubmit(container)

    expect(await screen.findByText('Current password is incorrect.')).toBeInTheDocument()
  })
})
