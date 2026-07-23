import { beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { db, initializeDb } from './data/db'
import type { Session, TimelineEvent } from './domain/types'

const iso = (minutesFromNow: number) => new Date(Date.now() + minutesFromNow * 60_000).toISOString()

async function seedSession({ ended = false, laterEvent = false }: { ended?: boolean; laterEvent?: boolean } = {}) {
  const startedAt = iso(-60)
  const endedAt = ended ? iso(-45) : null
  const session: Session = {
    id: 'session-test',
    startedAt,
    endedAt,
    initialMethod: 'Joint',
    productName: 'Test Orchard',
    createdAt: startedAt,
    updatedAt: startedAt,
  }
  const events: TimelineEvent[] = [
    { id:'event-consume',sessionId:session.id,occurredAt:startedAt,sequence:1,kind:'CONSUME',createdAt:startedAt,updatedAt:startedAt },
    { id:'event-start',sessionId:session.id,occurredAt:startedAt,sequence:2,kind:'STATE_CHANGE',state:'NOT_FEELING_IT',createdAt:startedAt,updatedAt:startedAt },
  ]
  if (endedAt) events.push({ id:'event-normal',sessionId:session.id,occurredAt:endedAt,sequence:3,kind:'STATE_CHANGE',state:'NORMAL',createdAt:endedAt,updatedAt:endedAt })
  if (laterEvent) events.push({ id:'event-high',sessionId:session.id,occurredAt:iso(-6),sequence:4,kind:'STATE_CHANGE',state:'HIGH',createdAt:iso(-6),updatedAt:iso(-6) })
  await db.sessions.add(session)
  await db.events.bulkAdd(events)
  return session
}

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

  it('repairs an end timestamp when later events prove the session continued', async () => {
    localStorage.setItem('ht-onboarded', 'true')
    await seedSession({ ended: true, laterEvent: true })
    render(<App />)

    expect(await screen.findByText('Resume where you left off')).toBeVisible()
    await waitFor(async () => expect((await db.sessions.get('session-test'))?.endedAt).toBeNull())
  })

  it('adds a missed context event from the live add-event sheet', async () => {
    const user = userEvent.setup()
    localStorage.setItem('ht-onboarded', 'true')
    await seedSession()
    history.replaceState({}, '', '/session/session-test/live')
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Add event' }))
    await user.click(screen.getByRole('button', { name: /Add a missed event/ }))
    await user.selectOptions(screen.getByLabelText('Type'), 'CONTEXT')
    await user.type(screen.getByLabelText('Name or category'), 'Food')
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add event' }))

    await waitFor(async () => expect((await db.events.where('sessionId').equals('session-test').toArray()).some((event) => event.category === 'Food')).toBe(true))
  })

  it('lets the user explicitly resume an ended session', async () => {
    const user = userEvent.setup()
    localStorage.setItem('ht-onboarded', 'true')
    await seedSession({ ended: true })
    history.replaceState({}, '', '/session/session-test/summary')
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Resume tracking' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Resume tracking' }))

    expect(await screen.findByText('How are you now?')).toBeVisible()
    expect((await db.sessions.get('session-test'))?.endedAt).toBeNull()
    expect(await db.events.get('event-normal')).toBeUndefined()
  })
})
