import { describe, expect, it } from 'vitest'
import { buildContextPatterns } from './contextPatterns'
import type { EffectDefinition, Session, TimelineEvent } from './types'

const effect: EffectDefinition = { id:'happy', label:'Happy', group:'MOOD', sentiment:'DESIRED', isCustom:false }
const session = (id:string,isDemo=false): Session => ({ id,startedAt:`2026-01-0${id}T09:00:00Z`,endedAt:`2026-01-0${id}T12:00:00Z`,initialMethod:'Joint',isDemo,createdAt:`2026-01-0${id}T09:00:00Z`,updatedAt:`2026-01-0${id}T12:00:00Z` })
const context = (sessionId:string,minute='10'): TimelineEvent => ({ id:`c-${sessionId}`,sessionId,occurredAt:`2026-01-0${sessionId}T09:${minute}:00Z`,sequence:1,kind:'CONTEXT',category:'Mango',createdAt:'x',updatedAt:'x' })
const effects = (sessionId:string,minute='20'): TimelineEvent => ({ id:`e-${sessionId}`,sessionId,occurredAt:`2026-01-0${sessionId}T09:${minute}:00Z`,sequence:2,kind:'EFFECTS_UPDATE',activeEffectIds:['happy'],createdAt:'x',updatedAt:'x' })

describe('context patterns',()=>{
  it('requires three context sessions and two later co-observations',()=>{
    const sessions=[session('1'),session('2'),session('3')]
    const events=[context('1'),effects('1'),context('2'),effects('2'),context('3')]
    expect(buildContextPatterns(sessions,events,[effect])).toEqual([{context:'Mango',contextSessionCount:3,effectId:'happy',effectLabel:'Happy',togetherSessionCount:2}])
  })

  it('does not infer from too few observations, earlier effects, or demo sessions',()=>{
    const sessions=[session('1'),session('2'),session('3'),session('4',true)]
    const events=[context('1'),effects('1','05'),context('2'),effects('2'),context('3'),context('4'),effects('4')]
    expect(buildContextPatterns(sessions,events,[effect])).toEqual([])
  })
})
