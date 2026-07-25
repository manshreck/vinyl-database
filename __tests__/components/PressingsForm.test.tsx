import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PressingsForm from '@/app/pressings/new/PressingsForm'

const mockCreatePressing = jest.fn()

jest.mock('@/app/actions/createPressing', () => ({
  createPressing: (...args: unknown[]) => mockCreatePressing(...args),
}))

describe('PressingsForm', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = jest.fn().mockResolvedValue({ json: () => Promise.resolve([]) }) as unknown as typeof fetch
  })

  it('does not submit when Enter is pressed in the release search box before a release is chosen', async () => {
    const user = userEvent.setup()
    render(<PressingsForm formats={[]} genres={[]} />)

    await user.type(screen.getByPlaceholderText('Search by title…'), 'Kind of Blue{Enter}')

    expect(mockCreatePressing).not.toHaveBeenCalled()
  })

  it('submits once a release is created and required fields are filled', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <PressingsForm formats={[{ formatId: 1, name: 'LP' }]} genres={[]} />
    )

    await user.type(screen.getByPlaceholderText('Search by title…'), 'Kind of Blue')
    await user.click(screen.getByText(/No results/))

    await user.type(
      container.querySelector('input[name="newReleaseYear"]') as HTMLInputElement,
      '1959'
    )
    await user.type(screen.getByPlaceholderText('Search or enter artist name…'), 'Miles Davis')
    await user.selectOptions(container.querySelector('select[name="formatId"]') as HTMLSelectElement, 'LP')
    await user.selectOptions(
      container.querySelector('select[name="recordCondition"]') as HTMLSelectElement,
      'VG'
    )

    await user.click(screen.getByText('Save pressing'))

    expect(mockCreatePressing).toHaveBeenCalledTimes(1)
  })
})
