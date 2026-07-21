import type { Backup, EffectDefinition, Session, TimelineEvent } from './types'

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
const isString = (value: unknown): value is string => typeof value === 'string'

export function validateBackup(value: unknown): Backup {
  if (!isObject(value) || value.schemaVersion !== 1) throw new Error('Unsupported or missing backup schema version.')
  if (!Array.isArray(value.sessions) || !Array.isArray(value.events) || !Array.isArray(value.effects)) throw new Error('Backup record lists are missing.')
  const sessions = value.sessions as unknown[]
  const events = value.events as unknown[]
  const effects = value.effects as unknown[]
  if (!sessions.every((item) => isObject(item) && isString(item.id) && isString(item.startedAt) && isString(item.initialMethod) && isString(item.createdAt) && isString(item.updatedAt))) throw new Error('A session record is malformed.')
  if (!events.every((item) => isObject(item) && isString(item.id) && isString(item.sessionId) && isString(item.occurredAt) && isString(item.kind) && typeof item.sequence === 'number')) throw new Error('An event record is malformed.')
  if (!effects.every((item) => isObject(item) && isString(item.id) && isString(item.label) && isString(item.group) && isString(item.sentiment) && typeof item.isCustom === 'boolean')) throw new Error('An effect record is malformed.')
  const ids = new Set(sessions.map((item) => (item as Record<string, unknown>).id))
  if (!events.every((item) => ids.has((item as Record<string, unknown>).sessionId))) throw new Error('An event references a missing session.')
  return { schemaVersion: 1, exportedAt: isString(value.exportedAt) ? value.exportedAt : new Date().toISOString(), sessions: sessions as Session[], events: events as TimelineEvent[], effects: effects as EffectDefinition[] }
}

export const makeBackup = (sessions: Session[], events: TimelineEvent[], effects: EffectDefinition[]): Backup => ({ schemaVersion: 1, exportedAt: new Date().toISOString(), sessions, events, effects })

export function csvCell(value: unknown) {
  let text = value == null ? '' : String(value)
  if (/^[=+\-@]/.test(text)) text = `'${text}`
  return `"${text.replaceAll('"', '""')}"`
}
