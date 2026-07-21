import { STATE_META } from './constants'
import type { Session, SessionState, TimelineEvent } from './types'

export interface StateInterval { state: SessionState; start: number; end: number; durationMs: number; source: TimelineEvent }
export interface SessionSummary {
  intervals: StateInterval[]
  totalDurationMs: number
  timeToFirstEffectMs: number | null
  timeToFirstHighMs: number | null
  timeToFirstPeakMs: number | null
  superHighMs: number
  tooHighMs: number
  peakCount: number
  timeUntilNormalMs: number | null
  cannabisRedoseCount: number
  redoseIntervalsMs: number[]
  nicotineEvents: TimelineEvent[]
}

export const byTime = (a: TimelineEvent, b: TimelineEvent) => {
  const delta = Date.parse(a.occurredAt) - Date.parse(b.occurredAt)
  return delta || a.sequence - b.sequence || a.id.localeCompare(b.id)
}

export function buildStateIntervals(session: Session, events: TimelineEvent[], now = new Date()): StateInterval[] {
  const boundary = session.endedAt ? Date.parse(session.endedAt) : now.getTime()
  const states = events.filter((event): event is TimelineEvent & { state: SessionState } => event.kind === 'STATE_CHANGE' && Boolean(event.state)).sort(byTime)
  const collapsed = states.filter((event, index) => index === 0 || event.state !== states[index - 1].state)
  return collapsed.map((event, index) => {
    const start = Math.max(Date.parse(session.startedAt), Date.parse(event.occurredAt))
    const next = collapsed[index + 1]
    const rawEnd = next ? Date.parse(next.occurredAt) : boundary
    const end = Math.max(start, Math.min(rawEnd, boundary))
    return { state: event.state, start, end, durationMs: end - start, source: event }
  }).filter((interval) => interval.start <= boundary)
}

const firstOffset = (session: Session, events: TimelineEvent[], predicate: (event: TimelineEvent) => boolean) => {
  const event = [...events].sort(byTime).find(predicate)
  return event ? Math.max(0, Date.parse(event.occurredAt) - Date.parse(session.startedAt)) : null
}

export function summarizeSession(session: Session, events: TimelineEvent[], now = new Date()): SessionSummary {
  const start = Date.parse(session.startedAt)
  const end = session.endedAt ? Date.parse(session.endedAt) : now.getTime()
  const intervals = buildStateIntervals(session, events, now)
  let peakCount = 0
  let inPeak = false
  for (const interval of intervals) {
    const peak = interval.state === 'SUPER_HIGH' || interval.state === 'TOO_HIGH'
    if (peak && !inPeak) peakCount += 1
    inPeak = peak
  }
  const consumes = events.filter((event) => event.kind === 'CONSUME').sort(byTime)
  const nicotineEvents = events.filter((event) => event.category === 'Cigarette/nicotine').sort(byTime)
  return {
    intervals,
    totalDurationMs: Math.max(0, end - start),
    timeToFirstEffectMs: firstOffset(session, events, (event) => event.kind === 'STATE_CHANGE' && event.state !== 'NOT_FEELING_IT'),
    timeToFirstHighMs: firstOffset(session, events, (event) => event.kind === 'STATE_CHANGE' && ['HIGH', 'SUPER_HIGH', 'TOO_HIGH'].includes(event.state ?? '')),
    timeToFirstPeakMs: firstOffset(session, events, (event) => event.kind === 'STATE_CHANGE' && ['SUPER_HIGH', 'TOO_HIGH'].includes(event.state ?? '')),
    superHighMs: intervals.filter((item) => item.state === 'SUPER_HIGH').reduce((sum, item) => sum + item.durationMs, 0),
    tooHighMs: intervals.filter((item) => item.state === 'TOO_HIGH').reduce((sum, item) => sum + item.durationMs, 0),
    peakCount,
    timeUntilNormalMs: firstOffset(session, events, (event) => event.kind === 'STATE_CHANGE' && event.state === 'NORMAL'),
    cannabisRedoseCount: Math.max(0, consumes.length - 1),
    redoseIntervalsMs: consumes.slice(1).map((event) => Date.parse(event.occurredAt) - start),
    nicotineEvents,
  }
}

export function formatDuration(ms: number | null, compact = false): string {
  if (ms === null) return 'Not recorded'
  const totalMinutes = Math.max(0, Math.round(ms / 60_000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (compact) return hours ? `${hours}h ${minutes}m` : `${minutes}m`
  return hours ? `${hours} hr ${minutes} min` : `${minutes} min`
}

export function stateAt(events: TimelineEvent[]): SessionState {
  return events.filter((event) => event.kind === 'STATE_CHANGE' && event.state).sort(byTime).at(-1)?.state ?? 'NOT_FEELING_IT'
}

export const stateLevel = (state: SessionState) => STATE_META[state].level
