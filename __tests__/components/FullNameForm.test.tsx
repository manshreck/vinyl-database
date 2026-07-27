import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FullNameForm from '@/app/account/FullNameForm'

const mockUpdateFullName = jest.fn()

jest.mock('@/app/actions/updateFullName', () => ({
  updateFullName: (...args: unknown[]) => mockUpdateFullName(...args),
}))

describe('FullNameForm', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('prefills the input with the current full name', () => {
    render(<FullNameForm fullName="Miles Davis" />)

    expect(screen.getByDisplayValue('Miles Davis')).toBeInTheDocument()
  })

  it('leaves the input blank when no full name is set', () => {
    render(<FullNameForm fullName={null} />)

    expect(screen.getByPlaceholderText('e.g. Miles Davis')).toHaveValue('')
  })

  it('submits the entered name', async () => {
    mockUpdateFullName.mockResolvedValue({ success: true })
    const user = userEvent.setup()
    const { container } = render(<FullNameForm fullName={null} />)

    await user.type(container.querySelector('input[name="fullName"]') as HTMLInputElement, 'John Coltrane')
    await user.click(screen.getByText('Save'))

    expect(mockUpdateFullName).toHaveBeenCalledTimes(1)
    const [, formData] = mockUpdateFullName.mock.calls[0]
    expect(formData.get('fullName')).toBe('John Coltrane')
  })

  it('shows the success message after a successful save', async () => {
    mockUpdateFullName.mockResolvedValue({ success: true })
    const user = userEvent.setup()
    const { container } = render(<FullNameForm fullName={null} />)

    await user.type(container.querySelector('input[name="fullName"]') as HTMLInputElement, 'John Coltrane')
    await user.click(screen.getByText('Save'))

    expect(await screen.findByText('Full name updated.')).toBeInTheDocument()
  })
})
