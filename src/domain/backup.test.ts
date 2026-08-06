import { describe, expect, it } from 'vitest'
import { makeBackup, validateBackup } from './backup'
import type { EffectDefinition, NextDayReflection, Session, TimelineEvent } from './types'

const session: Session = { id:'s', startedAt:'2026-01-01T00:00:00Z', endedAt:null, initialMethod:'Joint', createdAt:'2026-01-01T00:00:00Z', updatedAt:'2026-01-01T00:00:00Z' }
const event: TimelineEvent = { id:'e', sessionId:'s', occurredAt:session.startedAt, sequence:1, kind:'CONSUME', createdAt:session.startedAt, updatedAt:session.startedAt }
const effect: EffectDefinition = { id:'x', label:'Clear', group:'CUSTOM', sentiment:'NEUTRAL', isCustom:true }
const reflection: NextDayReflection = { sessionId:'s', sleep:'GOOD', mood:'OKAY', note:'A quiet morning.', createdAt:session.startedAt, updatedAt:session.startedAt }

describe('backup validation', () => {
  it('round trips a complete backup', () => { const backup = makeBackup([session],[event],[effect],[reflection]); expect(validateBackup(JSON.parse(JSON.stringify(backup)))).toEqual(backup) })
  it('imports a version 1 backup with no reflections', () => expect(validateBackup({ schemaVersion:1, sessions:[session], events:[event], effects:[effect], exportedAt:session.startedAt })).toEqual({ schemaVersion:2, sessions:[session], events:[event], effects:[effect], reflections:[], exportedAt:session.startedAt }))
  it('rejects unsupported versions', () => expect(() => validateBackup({ schemaVersion: 9, sessions:[], events:[], effects:[] })).toThrow(/version/))
  it('rejects orphaned events', () => expect(() => validateBackup({ schemaVersion:1, sessions:[], events:[event], effects:[] })).toThrow(/missing session/))
  it('rejects orphaned reflections', () => expect(() => validateBackup({ schemaVersion:2, sessions:[], events:[], effects:[], reflections:[reflection] })).toThrow(/missing session/))
  it('rejects malformed records without partial acceptance', () => expect(() => validateBackup({ schemaVersion:1, sessions:[{ id:'s' }], events:[], effects:[] })).toThrow(/malformed/))
})
