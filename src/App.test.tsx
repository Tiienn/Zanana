import { beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { db, initializeDb } from './data/db'

beforeEach(async () => {
  cleanup(); localStorage.clear(); history.replaceState({}, '', '/')
  db.close(); await db.delete(); await db.open(); await initializeDb()
})

describe('important interface interactions', () => {
  it('requires the age confirmation before completing onboarding', async () => {
    const user = userEvent.setup(); render(<App />)
    await user.click(screen.getByRole('button', { name: 'Skip intro' }))
    expect(screen.getByRole('button', { name: /Enter journal/ })).toBeDisabled()
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: /Enter journal/ }))
    expect(await screen.findByRole('link', { name: /Start session/ })).toBeVisible()
  })

  it('starts a persisted joint timeline and exposes Super high in one tap', async () => {
    const user = userEvent.setup(); localStorage.setItem('ht-onboarded', 'true'); render(<App />)
    await user.click(await screen.findByRole('link', { name: /Start session/ }))
    await user.type(screen.getByLabelText(/Product or strain/), 'Test Orchard')
    await user.click(screen.getByRole('button', { name: /Start timeline/ }))
    expect(await screen.findByRole('button', { name: 'Super high' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Super high' }))
    await waitFor(async () => expect((await db.events.where('kind').equals('STATE_CHANGE').toArray()).some((event) => event.state === 'SUPER_HIGH')).toBe(true))
  })
})
