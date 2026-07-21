import { db } from './db'
import { SEEDED_EFFECTS } from '../domain/constants'
import type { Session, SessionState, TimelineEvent } from '../domain/types'

const base = Date.parse('2026-07-12T18:00:00.000Z')
const iso = (day: number, minutes: number) => new Date(base + day * 86_400_000 + minutes * 60_000).toISOString()
const makeSession = (id: string, day: number, method: string, product: string, duration: number, rating: number): Session => ({
  id, startedAt: iso(day, 0), endedAt: iso(day, duration), initialMethod: method, productName: product, rating,
  wouldUseAgain: rating > 7 ? 'YES' : rating > 4 ? 'MAYBE' : 'NO', isDemo: true, createdAt: iso(day, 0), updatedAt: iso(day, duration),
})
const makeEvent = (sessionId: string, sequence: number, minute: number, input: Partial<TimelineEvent> & Pick<TimelineEvent, 'kind'>, day: number): TimelineEvent => ({
  id: `demo-event-${sessionId}-${sequence}`, sessionId, sequence, occurredAt: iso(day, minute), createdAt: iso(day, minute), updatedAt: iso(day, minute), ...input,
})
const states = (sessionId: string, day: number, values: [number, SessionState][]) => values.map(([minute, state], index) => makeEvent(sessionId, index + 2, minute, { kind: 'STATE_CHANGE', state }, day))

export async function loadDemoData() {
  await clearDemoData()
  const sessions = [
    makeSession('demo-sunroom', 0, 'Joint', 'Sunroom', 190, 8),
    makeSession('demo-night-orchard', 3, 'Joint', 'Night Orchard', 245, 9),
    makeSession('demo-soft-focus', 6, 'Vape', 'Soft Focus', 150, 4),
  ]
  const events: TimelineEvent[] = [
    makeEvent('demo-sunroom', 1, 0, { kind: 'CONSUME', method: 'Joint', productName: 'Sunroom' }, 0),
    ...states('demo-sunroom', 0, [[0,'NOT_FEELING_IT'],[18,'FEELING_IT'],[42,'HIGH'],[65,'SUPER_HIGH'],[95,'COMING_DOWN'],[190,'NORMAL']]),
    makeEvent('demo-sunroom', 8, 50, { kind: 'EFFECTS_UPDATE', activeEffectIds: ['seed-creative','seed-relaxed','seed-happy'] }, 0),
    makeEvent('demo-night-orchard', 1, 0, { kind: 'CONSUME', method: 'Joint', productName: 'Night Orchard' }, 3),
    ...states('demo-night-orchard', 3, [[0,'NOT_FEELING_IT'],[15,'FEELING_IT'],[34,'HIGH'],[48,'SUPER_HIGH'],[82,'COMING_DOWN'],[105,'SUPER_HIGH'],[145,'COMING_DOWN'],[245,'NORMAL']]),
    makeEvent('demo-night-orchard', 10, 95, { kind: 'CONSUME', category: 'More of the same', method: 'Joint', productName: 'Night Orchard' }, 3),
    makeEvent('demo-night-orchard', 11, 72, { kind: 'CONTEXT', category: 'Cigarette/nicotine' }, 3),
    makeEvent('demo-night-orchard', 12, 130, { kind: 'CONTEXT', category: 'Food' }, 3),
    makeEvent('demo-night-orchard', 13, 110, { kind: 'EFFECTS_UPDATE', activeEffectIds: ['seed-dreamy','seed-hungry','seed-calm'] }, 3),
    makeEvent('demo-soft-focus', 1, 0, { kind: 'CONSUME', method: 'Vape', productName: 'Soft Focus' }, 6),
    ...states('demo-soft-focus', 6, [[0,'NOT_FEELING_IT'],[5,'FEELING_IT'],[15,'HIGH'],[28,'TOO_HIGH'],[52,'COMING_DOWN'],[150,'NORMAL']]),
    makeEvent('demo-soft-focus', 8, 30, { kind: 'EFFECTS_UPDATE', activeEffectIds: ['seed-anxious','seed-dizzy','seed-dry-mouth'] }, 6),
  ]
  await db.transaction('rw', db.sessions, db.events, db.effects, async () => {
    await db.sessions.bulkPut(sessions); await db.events.bulkPut(events); await db.effects.bulkPut(SEEDED_EFFECTS)
  })
}

export async function clearDemoData() {
  const ids = (await db.sessions.where('isDemo').equals(1).toArray()).map((session) => session.id)
  if (!ids.length) return
  await db.transaction('rw', db.sessions, db.events, async () => {
    await db.events.where('sessionId').anyOf(ids).delete(); await db.sessions.bulkDelete(ids)
  })
}
