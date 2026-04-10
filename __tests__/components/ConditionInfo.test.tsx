import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ConditionInfo from '@/app/pressings/ConditionInfo'

describe('ConditionInfo', () => {
  it('renders the info button', () => {
    render(<ConditionInfo />)
    expect(screen.getByRole('button', { name: /condition grade definitions/i })).toBeInTheDocument()
  })

  it('does not show the popover by default', () => {
    render(<ConditionInfo />)
    expect(screen.queryByText('Goldmine / Discogs Grading Scale')).not.toBeInTheDocument()
  })

  it('shows the popover when the button is clicked', async () => {
    const user = userEvent.setup()
    render(<ConditionInfo />)
    await user.click(screen.getByRole('button', { name: /condition grade definitions/i }))
    expect(screen.getByText('Goldmine / Discogs Grading Scale')).toBeInTheDocument()
  })

  it('lists all 10 condition grades in the popover', async () => {
    const user = userEvent.setup()
    render(<ConditionInfo />)
    await user.click(screen.getByRole('button', { name: /condition grade definitions/i }))

    const grades = ['S', 'M', 'NM', 'VG+', 'VG', 'VG-', 'G+', 'G', 'FR', 'P']
    for (const grade of grades) {
      expect(screen.getByText(grade)).toBeInTheDocument()
    }
  })

  it('shows Sealed description for grade S', async () => {
    const user = userEvent.setup()
    render(<ConditionInfo />)
    await user.click(screen.getByRole('button', { name: /condition grade definitions/i }))
    expect(screen.getByText(/Still in original factory shrink wrap/i)).toBeInTheDocument()
  })

  it('closes the popover when clicked again', async () => {
    const user = userEvent.setup()
    render(<ConditionInfo />)
    const button = screen.getByRole('button', { name: /condition grade definitions/i })
    await user.click(button)
    expect(screen.getByText('Goldmine / Discogs Grading Scale')).toBeInTheDocument()
    await user.click(button)
    expect(screen.queryByText('Goldmine / Discogs Grading Scale')).not.toBeInTheDocument()
  })

  it('closes the popover when clicking outside', async () => {
    const user = userEvent.setup()
    render(
      <div>
        <ConditionInfo />
        <div data-testid="outside">outside</div>
      </div>
    )
    await user.click(screen.getByRole('button', { name: /condition grade definitions/i }))
    expect(screen.getByText('Goldmine / Discogs Grading Scale')).toBeInTheDocument()
    await user.click(screen.getByTestId('outside'))
    expect(screen.queryByText('Goldmine / Discogs Grading Scale')).not.toBeInTheDocument()
  })
})
