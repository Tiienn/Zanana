import { describe, expect, it } from 'vitest'
import { buildStateIntervals, isSessionComplete, summarizeSession } from './timeline'
import type { Session, SessionState, TimelineEvent } from './types'

const start = Date.parse('2026-01-01T12:00:00Z')
const at = (minutes: number) => new Date(start + minutes * 60_000).toISOString()
const session = (ended = 120): Session => ({ id: 's', startedAt: at(0), endedAt: ended < 0 ? null : at(ended), initialMethod: 'Joint', createdAt: at(0), updatedAt: at(0) })
const event = (sequence: number, minute: number, state?: SessionState, kind: TimelineEvent['kind'] = 'STATE_CHANGE'): TimelineEvent => ({ id: `e${sequence}`, sessionId: 's', occurredAt: at(minute), sequence, kind, state, createdAt: at(minute), updatedAt: at(minute) })

describe('timeline calculations', () => {
  it('calculates one ordinary peak', () => {
    const result = summarizeSession(session(), [event(1,0,'NOT_FEELING_IT'), event(2,10,'HIGH'), event(3,30,'SUPER_HIGH'), event(4,50,'COMING_DOWN'), event(5,120,'NORMAL')])
    expect(result.peakCount).toBe(1); expect(result.superHighMs).toBe(20 * 60_000)
  })
  it('sums two separate super-high peaks after re-dosing', () => {
    const result = summarizeSession(session(), [event(1,0,undefined,'CONSUME'), event(2,0,'NOT_FEELING_IT'), event(3,10,'SUPER_HIGH'), event(4,20,'COMING_DOWN'), event(5,25,undefined,'CONSUME'), event(6,40,'SUPER_HIGH'), event(7,55,'COMING_DOWN')])
    expect(result.peakCount).toBe(2); expect(result.superHighMs).toBe(25 * 60_000); expect(result.cannabisRedoseCount).toBe(1)
  })
  it('treats super-high followed by too-high as one contiguous peak', () => {
    const result = summarizeSession(session(), [event(1,0,'SUPER_HIGH'), event(2,10,'TOO_HIGH'), event(3,20,'COMING_DOWN')])
    expect(result.peakCount).toBe(1); expect(result.superHighMs).toBe(10 * 60_000); expect(result.tooHighMs).toBe(10 * 60_000)
  })
  it('collapses consecutive duplicate state events', () => {
    const result = summarizeSession(session(), [event(1,0,'SUPER_HIGH'), event(2,5,'SUPER_HIGH'), event(3,10,'COMING_DOWN')])
    expect(result.peakCount).toBe(1); expect(result.intervals).toHaveLength(2); expect(result.superHighMs).toBe(10 * 60_000)
  })
  it('uses supplied now when end/normal is missing', () => {
    const result = summarizeSession(session(-1), [event(1,0,'HIGH')], new Date(at(45)))
    expect(result.totalDurationMs).toBe(45 * 60_000); expect(result.timeUntilNormalMs).toBeNull()
  })
  it('stable-sorts edited out-of-order timestamps', () => {
    const intervals = buildStateIntervals(session(), [event(1,30,'SUPER_HIGH'), event(2,10,'HIGH'), event(3,60,'COMING_DOWN')])
    expect(intervals.map((item) => item.state)).toEqual(['HIGH','SUPER_HIGH','COMING_DOWN'])
  })
  it('ignores consumption events when splitting intervals', () => {
    const result = summarizeSession(session(), [event(1,0,'HIGH'), event(2,20,undefined,'CONSUME'), event(3,40,'COMING_DOWN')])
    expect(result.intervals[0].durationMs).toBe(40 * 60_000)
  })
  it('handles a session with no high state', () => {
    const result = summarizeSession(session(), [event(1,0,'NOT_FEELING_IT'), event(2,20,'FEELING_IT'), event(3,80,'NORMAL')])
    expect(result.timeToFirstHighMs).toBeNull(); expect(result.peakCount).toBe(0)
  })
  it('uses active supplied now deterministically', () => {
    expect(summarizeSession(session(-1), [event(1,0,'SUPER_HIGH')], new Date(at(7))).superHighMs).toBe(7 * 60_000)
  })
  it('handles equal boundary timestamps deterministically', () => {
    const result = summarizeSession(session(10), [event(2,5,'SUPER_HIGH'), event(1,5,'HIGH'), event(3,10,'NORMAL')])
    expect(result.intervals.map((item) => item.state)).toEqual(['HIGH','SUPER_HIGH','NORMAL']); expect(result.intervals[0].durationMs).toBe(0)
  })
  it('ignores a stale end boundary when later events prove the session continued', () => {
    const stale = session(15)
    const events = [event(1,0,'NOT_FEELING_IT'), event(2,54,'HIGH')]
    const result = summarizeSession(stale, events, new Date(at(60)))

    expect(isSessionComplete(stale, events)).toBe(false)
    expect(result.totalDurationMs).toBe(60 * 60_000)
    expect(result.timeToFirstHighMs).toBe(54 * 60_000)
    expect(result.intervals.at(-1)?.end).toBe(Date.parse(at(60)))
  })
})
