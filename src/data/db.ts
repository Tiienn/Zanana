import Dexie, { type EntityTable } from 'dexie'
import { SEEDED_EFFECTS } from '../domain/constants'
import type { Backup, EffectDefinition, Session, TimelineEvent } from '../domain/types'
import { validateBackup } from '../domain/backup'

class HighTimelineDb extends Dexie {
  sessions!: EntityTable<Session, 'id'>
  events!: EntityTable<TimelineEvent, 'id'>
  effects!: EntityTable<EffectDefinition, 'id'>

  constructor() {
    super('high-timeline')
    this.version(1).stores({
      sessions: 'id, startedAt, endedAt, initialMethod, productName, isDemo, updatedAt',
      events: 'id, sessionId, [sessionId+occurredAt], occurredAt, kind, category, sequence',
      effects: 'id, label, group, sentiment, isCustom',
    })
  }
}

export const db = new HighTimelineDb()
export const id = (prefix: string) => `${prefix}-${crypto.randomUUID()}`

export function nowIso(advanceTestClock = false): string {
  if (import.meta.env.DEV) {
    const raw = localStorage.getItem('ht-test-time')
    if (raw) {
      const date = new Date(raw)
      if (advanceTestClock) localStorage.setItem('ht-test-time', new Date(date.getTime() + 5 * 60_000).toISOString())
      return date.toISOString()
    }
  }
  return new Date().toISOString()
}

export async function initializeDb() {
  if ((await db.effects.count()) === 0) await db.effects.bulkPut(SEEDED_EFFECTS)
}

export async function nextSequence(sessionId: string) {
  const last = await db.events.where('sessionId').equals(sessionId).sortBy('sequence')
  return (last.at(-1)?.sequence ?? 0) + 1
}

export async function addEvent(sessionId: string, input: Partial<TimelineEvent> & Pick<TimelineEvent, 'kind'>) {
  const timestamp = input.occurredAt ?? nowIso(true)
  const event: TimelineEvent = {
    id: id('evt'), sessionId, occurredAt: timestamp, sequence: await nextSequence(sessionId), kind: input.kind,
    state: input.state, category: input.category, method: input.method, productName: input.productName,
    amount: input.amount, activeEffectIds: input.activeEffectIds, note: input.note, createdAt: nowIso(), updatedAt: nowIso(),
  }
  await db.transaction('rw', db.events, db.sessions, async () => {
    await db.events.add(event)
    await db.sessions.update(sessionId, { updatedAt: nowIso() })
  })
  return event
}

export async function replaceWithBackup(raw: unknown): Promise<Backup> {
  const backup = validateBackup(raw)
  await db.transaction('rw', db.sessions, db.events, db.effects, async () => {
    await Promise.all([db.sessions.clear(), db.events.clear(), db.effects.clear()])
    await db.sessions.bulkAdd(backup.sessions)
    await db.events.bulkAdd(backup.events)
    await db.effects.bulkAdd(backup.effects)
  })
  return backup
}

export async function clearAll() {
  await db.transaction('rw', db.sessions, db.events, db.effects, async () => {
    await db.sessions.clear(); await db.events.clear(); await db.effects.clear(); await db.effects.bulkAdd(SEEDED_EFFECTS)
  })
}
