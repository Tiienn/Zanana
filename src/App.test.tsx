import { beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { db, initializeDb } from './data/db'
import type { Session, TimelineEvent } from './domain/types'

const iso = (minutesFromNow: number) => new Date(Date.now() + minutesFromNow * 60_000).toISOString()

async function seedSession({ ended = false, laterEvent = false, endedMinutesAgo = 45 }: { ended?: boolean; laterEvent?: boolean; endedMinutesAgo?: number } = {}) {
  const startedAt = iso(-Math.max(60,endedMinutesAgo+30))
  const endedAt = ended ? iso(-endedMinutesAgo) : null
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

  it('reflects the latest self-report and effects through Zanana without replacing the text', async () => {
    const user = userEvent.setup()
    localStorage.setItem('ht-onboarded', 'true')
    await seedSession()
    history.replaceState({}, '', '/session/session-test/live')
    render(<App />)

    expect(await screen.findByTestId('zanana-mascot')).toHaveAttribute('data-pose', 'neutral')
    await user.click(screen.getByRole('button', { name: 'Effects' }))
    await user.click(screen.getByRole('button', { name: /Happy/ }))
    await user.click(screen.getByRole('button', { name: 'Save 1 effects' }))
    expect(await screen.findByLabelText('Active effects: Happy')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('zanana-mascot')).toHaveAttribute('data-pose', 'uplifted'))
    expect(screen.getByText('Effects saved: Happy')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'High' }))
    expect(await screen.findByRole('heading', { name: 'High' })).toBeVisible()
    expect(screen.getByTestId('zanana-mascot')).toHaveAttribute('data-pose', 'high-happy')

    await user.click(screen.getByRole('button', { name: 'Too high' }))
    const comfort = await screen.findByRole('dialog', { name: 'Comfort mode' })
    expect(within(comfort).getByText(/does not measure intoxication/i)).toBeVisible()
    expect(within(comfort).getByText(/4 in · 6 out · no hold/i)).toBeVisible()
    await user.click(within(comfort).getByRole('button', { name: 'Start breathing' }))
    expect(within(comfort).getByText('Breathe in gently')).toBeVisible()
    await user.click(within(comfort).getByRole('button', { name: 'Close' }))
    expect(await screen.findByRole('heading', { name: 'Too high' })).toBeVisible()
    expect(screen.getByTestId('zanana-mascot')).toHaveAttribute('data-pose', 'concerned')
    expect(document.querySelector<HTMLImageElement>('.zanana-image')).toHaveAttribute('alt', '')
  })

  it('opens Comfort mode manually and records support choices only as context', async () => {
    const user = userEvent.setup()
    localStorage.setItem('ht-onboarded', 'true')
    await seedSession()
    history.replaceState({}, '', '/session/session-test/live')
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Comfort' }))
    const comfort = screen.getByRole('dialog', { name: 'Comfort mode' })
    await user.click(within(comfort).getByRole('button', { name: /Add water/ }))
    await waitFor(async () => expect((await db.events.where('sessionId').equals('session-test').toArray()).some((event) => event.kind === 'CONTEXT' && event.category === 'Water')).toBe(true))
    expect(screen.getByText('Water added to your timeline')).toBeInTheDocument()
  })

  it('prioritizes an active timeline on home and keeps its actions in the bottom navigation', async () => {
    const user = userEvent.setup()
    localStorage.setItem('ht-onboarded', 'true')
    await seedSession()
    render(<App />)

    expect(await screen.findByText('Your live timeline')).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Not feeling it yet' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Game' })).toHaveAttribute('href', '/game')
    expect(screen.queryByRole('link', { name: 'Insights' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Timeline' })).toHaveAttribute('href', '/session/session-test/live')
    await user.click(screen.getByRole('button', { name: 'Add event to active timeline' }))
    expect(await screen.findByRole('dialog', { name: 'Add to this timeline' })).toBeVisible()
    expect(screen.getByRole('button', { name: /Mango/ })).toBeVisible()
    expect(screen.getByRole('button', { name: /Chocolate \/ sweets/ })).toBeVisible()
    await user.click(screen.getByRole('button', { name: /Mango/ }))
    await waitFor(async()=>expect((await db.events.where('sessionId').equals('session-test').toArray()).some(event=>event.category==='Mango')).toBe(true))
    expect(await db.effects.get('seed-munchies')).toMatchObject({label:'Munchies',sentiment:'NEUTRAL'})
  })

  it('earns play-only sunshine and uses it to dress Zanana', async () => {
    const user = userEvent.setup()
    localStorage.setItem('ht-onboarded', 'true')
    history.replaceState({}, '', '/game')
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Zanana Pop!' })).toBeVisible()
    expect(screen.getByText(/no penalties and no sound required/i)).toBeVisible()
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings')
    await user.click(screen.getByRole('button', { name: 'Start round' }))
    await user.click(screen.getByRole('button', { name: 'Bop Zanana' }))
    expect(document.querySelector('.game-scoreboard span:first-child strong')).toHaveTextContent('1')
    for(let count=1;count<5;count+=1)await user.click(screen.getByRole('button',{name:'Bop Zanana'}))
    expect(document.querySelector('.pop-stage')).toHaveAttribute('data-speed','2')
    for(let count=5;count<10;count+=1)await user.click(screen.getByRole('button',{name:'Bop Zanana'}))
    expect(document.querySelector('.pop-stage')).toHaveAttribute('data-speed','3')
    for(let count=10;count<15;count+=1)await user.click(screen.getByRole('button',{name:'Bop Zanana'}))
    expect(document.querySelector('.pop-stage')).toHaveAttribute('data-speed','4')
    expect(screen.getByRole('link', { name: /15 sunshine/ })).toBeVisible()
    await user.click(within(screen.getByRole('navigation', { name: 'Zanana play spaces' })).getByRole('link', { name: /Zanana’s Room/ }))
    expect(await screen.findByRole('heading', { name: 'Zanana’s Room' })).toBeVisible()
    expect(screen.getByLabelText('15 sunshine available')).toBeVisible()
    await user.click(screen.getByRole('button', { name: /Garden crown/ }))
    expect(screen.getByRole('button', { name: /Garden crown/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('7 sunshine available')).toBeVisible()
    expect(JSON.parse(localStorage.getItem('zanana-room-v1') || '{}')).toMatchObject({ sunshine: 7, outfit: 'outfit-crown' })
  })

  it('offers a dedicated end-session button from the live timeline', async () => {
    const user = userEvent.setup()
    localStorage.setItem('ht-onboarded', 'true')
    await seedSession()
    history.replaceState({}, '', '/session/session-test/live')
    render(<App />)

    await user.click(await screen.findByRole('button', { name: /End session/ }))
    expect(screen.getByRole('dialog', { name: 'End this session?' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'End now' }))
    expect(await screen.findByRole('link', { name: /Start session/ })).toBeVisible()
    expect((await db.sessions.get('session-test'))?.endedAt).not.toBeNull()
    expect(screen.queryByText('Session recap')).not.toBeInTheDocument()
  })

  it('bookmarks a timeline moment with a local photo and filters History', async () => {
    const user = userEvent.setup()
    localStorage.setItem('ht-onboarded', 'true')
    await seedSession({ ended: true })
    history.replaceState({}, '', '/session/session-test/summary')
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Bookmark consume' }))
    const dialog=screen.getByRole('dialog', { name: 'Save this moment' })
    await user.type(within(dialog).getByLabelText(/Label/), 'First quiet moment')
    const photo=new File(['pineapple-photo'], 'moment.png', { type:'image/png' })
    await user.upload(within(dialog).getByLabelText('Choose bookmark photo'), photo)
    await user.click(within(dialog).getByRole('button', { name: 'Save bookmark' }))

    await waitFor(async()=>expect(await db.events.get('event-consume')).toMatchObject({isBookmarked:true,bookmarkLabel:'First quiet moment'}))
    expect(await db.attachments.get('event-consume')).toMatchObject({photoName:'moment.png'})
    expect(screen.getByRole('button', { name: 'Edit bookmark for consume' })).toHaveAttribute('aria-pressed','true')

    await user.click(within(screen.getByRole('navigation', { name:'Primary' })).getByRole('link', { name:'History' }))
    expect(await screen.findByText('1 bookmark across your journal')).toBeVisible()
    await user.click(screen.getByRole('button', { name:'Show bookmarks only' }))
    expect(screen.getByText('Test Orchard')).toBeVisible()
  })

  it('repairs an end timestamp when later events prove the session continued', async () => {
    localStorage.setItem('ht-onboarded', 'true')
    await seedSession({ ended: true, laterEvent: true })
    render(<App />)

    expect(await screen.findByRole('link', { name: /Open live timeline/ })).toBeVisible()
    await waitFor(async () => expect((await db.sessions.get('session-test'))?.endedAt).toBeNull())
  })

  it('adds a missed context event from the live add-event sheet', async () => {
    const user = userEvent.setup()
    localStorage.setItem('ht-onboarded', 'true')
    await seedSession()
    history.replaceState({}, '', '/session/session-test/live')
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Add event to active timeline' }))
    await user.click(screen.getByRole('button', { name: /Add a missed event/ }))
    await user.selectOptions(screen.getByLabelText('Type'), 'CONTEXT')
    await user.type(screen.getByLabelText('Name or category'), 'Food')
    const saveButton = within(screen.getByRole('dialog')).getByRole('button', { name: 'Add event' })
    expect(saveButton.parentElement).toHaveClass('modal-footer')
    await user.click(saveButton)

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

  it('offers an optional next-day reflection after six hours and shows it in Session Details', async () => {
    const user=userEvent.setup()
    localStorage.setItem('ht-onboarded','true')
    await seedSession({ended:true,endedMinutesAgo:7*60})
    render(<App/>)

    expect(await screen.findByRole('heading',{name:'Want to remember how today feels?'})).toBeVisible()
    await user.click(screen.getByRole('button',{name:'Add reflection'}))
    const dialog=screen.getByRole('dialog',{name:'Add next-day reflection'})
    await user.click(within(within(dialog).getByRole('group',{name:'How was your sleep?'})).getByRole('button',{name:'Good'}))
    await user.click(within(within(dialog).getByRole('group',{name:'How was your mood?'})).getByRole('button',{name:'Low'}))
    await user.type(within(dialog).getByLabelText(/Worth remembering/),'A calm breakfast.')
    await user.click(within(dialog).getByRole('button',{name:'Save reflection'}))

    await waitFor(async()=>expect(await db.reflections.get('session-test')).toMatchObject({sleep:'GOOD',mood:'LOW',note:'A calm breakfast.'}))
    expect(screen.queryByRole('heading',{name:'Want to remember how today feels?'})).not.toBeInTheDocument()
    await user.click(screen.getByText('Test Orchard'))
    expect(await screen.findByRole('heading',{name:'Next-day reflection'})).toBeVisible()
    expect(screen.getByText('A calm breakfast.')).toBeVisible()
    expect(screen.getByRole('button',{name:'Edit reflection'})).toBeVisible()
  })

  it('permanently skips one prompt while keeping manual reflection available', async () => {
    const user=userEvent.setup()
    localStorage.setItem('ht-onboarded','true')
    await seedSession({ended:true,endedMinutesAgo:7*60})
    render(<App/>)

    await user.click(await screen.findByRole('button',{name:'Skip this one'}))
    await waitFor(async()=>expect((await db.sessions.get('session-test'))?.nextDayReflectionDismissedAt).toBeTruthy())
    expect(screen.queryByRole('heading',{name:'Want to remember how today feels?'})).not.toBeInTheDocument()
    await user.click(screen.getByText('Test Orchard'))
    expect(await screen.findByText('Nothing added yet.')).toBeVisible()
    expect(screen.getByRole('button',{name:'Add reflection'})).toBeVisible()
  })

  it('lets Settings disable automatic prompts without disabling manual reflections', async () => {
    const user=userEvent.setup()
    localStorage.setItem('ht-onboarded','true')
    await seedSession({ended:true,endedMinutesAgo:7*60})
    history.replaceState({},'','/settings')
    render(<App/>)

    const promptToggle=await screen.findByRole('checkbox',{name:'Show automatic reflection prompts'})
    expect(promptToggle).toBeChecked()
    await user.click(promptToggle)
    expect(localStorage.getItem('ht-reflection-prompts')).toBe('off')
    await user.click(screen.getByRole('link',{name:/Zanana home/}))
    expect(screen.queryByRole('heading',{name:'Want to remember how today feels?'})).not.toBeInTheDocument()
    await user.click(screen.getByText('Test Orchard'))
    expect(await screen.findByRole('button',{name:'Add reflection'})).toBeVisible()
  })

  it('keeps companion check-ins optional, inline, and snoozable', async () => {
    const user=userEvent.setup()
    localStorage.setItem('ht-onboarded','true')
    render(<App/>)

    expect(await screen.findByRole('heading',{name:'Want to note how you feel?'})).toBeVisible()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button',{name:'Snooze 2 hours'}))
    expect(screen.queryByRole('heading',{name:'Want to note how you feel?'})).not.toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('zanana-check-ins-v1')||'{}')).toMatchObject({enabled:true})
    expect(JSON.parse(localStorage.getItem('zanana-check-ins-v1')||'{}').nextAt).toBeGreaterThan(Date.now()+100*60_000)
  })

  it('never interrupts an active session with a companion check-in', async () => {
    localStorage.setItem('ht-onboarded','true')
    await seedSession()
    render(<App/>)

    expect(await screen.findByText('Your live timeline')).toBeVisible()
    expect(screen.queryByRole('heading',{name:'Want to note how you feel?'})).not.toBeInTheDocument()
  })

  it('shows context patterns only with thresholded raw counts', async () => {
    localStorage.setItem('ht-onboarded','true')
    const sessions:Session[]=[];const events:TimelineEvent[]=[]
    for(let index=1;index<=3;index+=1){
      const sessionId=`pattern-${index}`;const startedAt=iso(-index*300);const contextAt=new Date(Date.parse(startedAt)+20*60_000).toISOString();const effectAt=new Date(Date.parse(startedAt)+30*60_000).toISOString();const endedAt=new Date(Date.parse(startedAt)+120*60_000).toISOString()
      sessions.push({id:sessionId,startedAt,endedAt,initialMethod:'Joint',createdAt:startedAt,updatedAt:endedAt})
      events.push({id:`context-${index}`,sessionId,occurredAt:contextAt,sequence:1,kind:'CONTEXT',category:'Mango',createdAt:contextAt,updatedAt:contextAt})
      if(index<3)events.push({id:`effect-${index}`,sessionId,occurredAt:effectAt,sequence:2,kind:'EFFECTS_UPDATE',activeEffectIds:['seed-happy'],createdAt:effectAt,updatedAt:effectAt})
    }
    await db.sessions.bulkAdd(sessions);await db.events.bulkAdd(events)
    history.replaceState({},'','/insights')
    render(<App/>)

    expect(await screen.findByRole('heading',{name:'Context patterns'})).toBeVisible()
    expect(screen.getByText('3 completed sessions')).toBeVisible()
    expect(screen.getByText('2 of those sessions')).toBeVisible()
    expect(screen.getByText(/not evidence of cause or a stronger effect/i)).toBeVisible()
  })

  it('completes Fruit Pairs without a timer and earns play-only sunshine', async () => {
    const user=userEvent.setup()
    localStorage.setItem('ht-onboarded','true')
    history.replaceState({},'','/game/memory')
    render(<App/>)

    expect(await screen.findByRole('heading',{name:'Fruit Pairs'})).toBeVisible()
    expect(screen.getByText(/there is no timer, penalty, or sound/i)).toBeVisible()
    for(const pair of ['mango','pineapple','strawberry','orange','watermelon','grape']){
      const cards=[...document.querySelectorAll<HTMLButtonElement>(`.memory-card[data-pair="${pair}"]`)]
      await user.click(cards[0]);await user.click(cards[1])
    }
    expect(await screen.findByText('Every pair found!')).toBeVisible()
    expect(JSON.parse(localStorage.getItem('zanana-room-v1')||'{}')).toMatchObject({sunshine:6})
    expect(screen.getByText(/Sunshine comes from completing the game—not from sessions/i)).toBeVisible()
  })

  it('cancels a pending mismatch when Fruit Pairs is mixed again', async () => {
    const user=userEvent.setup()
    localStorage.setItem('ht-onboarded','true')
    history.replaceState({},'','/game/memory')
    render(<App/>)

    await screen.findByRole('heading',{name:'Fruit Pairs'})
    const mango=document.querySelector<HTMLButtonElement>('.memory-card[data-pair="mango"]')!
    const pineapple=document.querySelector<HTMLButtonElement>('.memory-card[data-pair="pineapple"]')!
    await user.click(mango);await user.click(pineapple)
    await user.click(screen.getByRole('button',{name:/Mix again/}))
    const firstCard=document.querySelector<HTMLButtonElement>('.memory-card')!
    await user.click(firstCard)

    await new Promise((resolve)=>window.setTimeout(resolve,750))
    expect(firstCard).toHaveAttribute('aria-pressed','true')
  })

  it('explains both play-only ways to earn Room sunshine', async () => {
    localStorage.setItem('ht-onboarded','true')
    history.replaceState({},'','/game/room')
    render(<App/>)

    expect(await screen.findByText(/Pop earns one sunshine per bop/)).toHaveTextContent(/Fruit Pairs earns six per completed board/)
    expect(screen.getByRole('link',{name:/Play games/})).toBeVisible()
  })
})
