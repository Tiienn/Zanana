import Dexie, { type EntityTable } from 'dexie'
import { SEEDED_EFFECTS } from '../domain/constants'
import { hasEventsAfterSessionEnd } from '../domain/timeline'
import type { Backup, BookmarkAttachment, EffectDefinition, NextDayReflection, Session, TimelineEvent } from '../domain/types'
import { validateBackup } from '../domain/backup'

class HighTimelineDb extends Dexie {
  sessions!: EntityTable<Session, 'id'>
  events!: EntityTable<TimelineEvent, 'id'>
  effects!: EntityTable<EffectDefinition, 'id'>
  attachments!: EntityTable<BookmarkAttachment, 'eventId'>
  reflections!: EntityTable<NextDayReflection, 'sessionId'>

  constructor() {
    super('high-timeline')
    this.version(1).stores({
      sessions: 'id, startedAt, endedAt, initialMethod, productName, isDemo, updatedAt',
      events: 'id, sessionId, [sessionId+occurredAt], occurredAt, kind, category, sequence',
      effects: 'id, label, group, sentiment, isCustom',
    })
    this.version(2).stores({
      sessions: 'id, startedAt, endedAt, initialMethod, productName, isDemo, updatedAt',
      events: 'id, sessionId, [sessionId+occurredAt], occurredAt, kind, category, sequence, isBookmarked',
      effects: 'id, label, group, sentiment, isCustom',
      attachments: 'eventId, sessionId, updatedAt',
    })
    this.version(3).stores({
      sessions: 'id, startedAt, endedAt, initialMethod, productName, isDemo, updatedAt',
      events: 'id, sessionId, [sessionId+occurredAt], occurredAt, kind, category, sequence, isBookmarked',
      effects: 'id, label, group, sentiment, isCustom',
      attachments: 'eventId, sessionId, updatedAt',
      reflections: 'sessionId, updatedAt',
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
  const seeded = await db.effects.bulkGet(SEEDED_EFFECTS.map((effect) => effect.id))
  const missingEffects = SEEDED_EFFECTS.filter((_, index) => !seeded[index])
  if (missingEffects.length) await db.effects.bulkPut(missingEffects)
  const [sessions, events] = await Promise.all([db.sessions.toArray(), db.events.toArray()])
  const eventIds = new Set(events.map((event) => event.id))
  const sessionIds = new Set(sessions.map((session) => session.id))
  const orphanAttachments = await db.attachments.filter((attachment) => !eventIds.has(attachment.eventId)).primaryKeys()
  if (orphanAttachments.length) await db.attachments.bulkDelete(orphanAttachments)
  const orphanReflections = await db.reflections.filter((reflection) => !sessionIds.has(reflection.sessionId)).primaryKeys()
  if (orphanReflections.length) await db.reflections.bulkDelete(orphanReflections)
  const eventsBySession = new Map<string, TimelineEvent[]>()
  for (const event of events) eventsBySession.set(event.sessionId, [...(eventsBySession.get(event.sessionId) ?? []), event])
  const staleBoundaries = sessions.filter((session) => hasEventsAfterSessionEnd(session, eventsBySession.get(session.id) ?? []))
  if (staleBoundaries.length) {
    await db.transaction('rw', db.sessions, async () => {
      await Promise.all(staleBoundaries.map((session) => db.sessions.update(session.id, { endedAt: null, updatedAt: nowIso() })))
    })
  }
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

export async function reopenSession(sessionId: string) {
  const session = await db.sessions.get(sessionId)
  if (!session?.endedAt) return
  const matchingNormalEvents = await db.events
    .where('sessionId').equals(sessionId)
    .filter((event) => event.kind === 'STATE_CHANGE' && event.state === 'NORMAL' && event.occurredAt === session.endedAt)
    .primaryKeys()
  await db.transaction('rw', db.sessions, db.events, async () => {
    await db.events.bulkDelete(matchingNormalEvents)
    await db.sessions.update(sessionId, {
      endedAt: null,
      rating: undefined,
      wouldUseAgain: undefined,
      nextDayReminder: undefined,
      nextDayReflectionDismissedAt: undefined,
      updatedAt: nowIso(),
    })
  })
}

export async function replaceWithBackup(raw: unknown): Promise<Backup> {
  const backup = validateBackup(raw)
  await db.transaction('rw', db.sessions, db.events, db.effects, db.attachments, db.reflections, async () => {
    await Promise.all([db.sessions.clear(), db.events.clear(), db.effects.clear(), db.attachments.clear(), db.reflections.clear()])
    await db.sessions.bulkAdd(backup.sessions)
    await db.events.bulkAdd(backup.events)
    await db.effects.bulkAdd(backup.effects)
    await db.reflections.bulkAdd(backup.reflections)
  })
  return backup
}

export async function clearAll() {
  await db.transaction('rw', db.sessions, db.events, db.effects, db.attachments, db.reflections, async () => {
    await db.sessions.clear(); await db.events.clear(); await db.effects.clear(); await db.attachments.clear(); await db.reflections.clear(); await db.effects.bulkAdd(SEEDED_EFFECTS)
  })
}
