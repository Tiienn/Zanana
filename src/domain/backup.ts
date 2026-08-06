import type { Backup, EffectDefinition, NextDayReflection, Session, TimelineEvent } from './types'

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
const isString = (value: unknown): value is string => typeof value === 'string'
const sleepValues = new Set(['VERY_POOR','POOR','OKAY','GOOD','VERY_GOOD'])
const moodValues = new Set(['VERY_LOW','LOW','OKAY','GOOD','VERY_GOOD'])
const isOptionalString = (value: unknown) => value === undefined || isString(value)

export function validateBackup(value: unknown): Backup {
  if (!isObject(value) || (value.schemaVersion !== 1 && value.schemaVersion !== 2)) throw new Error('Unsupported or missing backup schema version.')
  if (!Array.isArray(value.sessions) || !Array.isArray(value.events) || !Array.isArray(value.effects)) throw new Error('Backup record lists are missing.')
  if (value.schemaVersion === 2 && !Array.isArray(value.reflections)) throw new Error('Backup reflection list is missing.')
  const sessions = value.sessions as unknown[]
  const events = value.events as unknown[]
  const effects = value.effects as unknown[]
  const reflections = value.schemaVersion === 2 && Array.isArray(value.reflections) ? value.reflections as unknown[] : []
  if (!sessions.every((item) => isObject(item) && isString(item.id) && isString(item.startedAt) && isString(item.initialMethod) && isString(item.createdAt) && isString(item.updatedAt))) throw new Error('A session record is malformed.')
  if (!events.every((item) => isObject(item) && isString(item.id) && isString(item.sessionId) && isString(item.occurredAt) && isString(item.kind) && typeof item.sequence === 'number')) throw new Error('An event record is malformed.')
  if (!effects.every((item) => isObject(item) && isString(item.id) && isString(item.label) && isString(item.group) && isString(item.sentiment) && typeof item.isCustom === 'boolean')) throw new Error('An effect record is malformed.')
  if (!reflections.every((item) => isObject(item) && isString(item.sessionId) && isString(item.createdAt) && isString(item.updatedAt) && (item.sleep === undefined || sleepValues.has(item.sleep as string)) && (item.mood === undefined || moodValues.has(item.mood as string)) && isOptionalString(item.note))) throw new Error('A next-day reflection record is malformed.')
  const ids = new Set(sessions.map((item) => (item as Record<string, unknown>).id))
  if (!events.every((item) => ids.has((item as Record<string, unknown>).sessionId))) throw new Error('An event references a missing session.')
  if (!reflections.every((item) => ids.has((item as Record<string, unknown>).sessionId))) throw new Error('A next-day reflection references a missing session.')
  return { schemaVersion: 2, exportedAt: isString(value.exportedAt) ? value.exportedAt : new Date().toISOString(), sessions: sessions as Session[], events: events as TimelineEvent[], effects: effects as EffectDefinition[], reflections: reflections as NextDayReflection[] }
}

export const makeBackup = (sessions: Session[], events: TimelineEvent[], effects: EffectDefinition[], reflections: NextDayReflection[] = []): Backup => ({ schemaVersion: 2, exportedAt: new Date().toISOString(), sessions, events, effects, reflections })

export function csvCell(value: unknown) {
  let text = value == null ? '' : String(value)
  if (/^[=+\-@]/.test(text)) text = `'${text}`
  return `"${text.replaceAll('"', '""')}"`
}
