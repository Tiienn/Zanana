import { describe, expect, it } from 'vitest'
import { getMascotPresentation } from './mascot'
import type { EffectDefinition } from './types'

const effect = (label: string, sentiment: EffectDefinition['sentiment'] = 'DESIRED'): EffectDefinition => ({
  id: `effect-${label}`,
  label,
  group: 'MOOD',
  sentiment,
  isCustom: false,
})

describe('Zanana presentation', () => {
  it('uses a pleasantly high and happy pose for High with Happy active', () => {
    expect(getMascotPresentation('HIGH', [effect('Happy')])).toEqual({ pose: 'high-happy', primaryEffect: effect('Happy') })
  })

  it('keeps Too high grounded even when a desired effect is active', () => {
    expect(getMascotPresentation('TOO_HIGH', [effect('Happy')]).pose).toBe('concerned')
  })

  it('gives unwanted effects visual priority without changing the written report', () => {
    const anxious = effect('Anxious', 'UNWANTED')
    expect(getMascotPresentation('HIGH', [effect('Happy'), anxious])).toEqual({ pose: 'concerned', primaryEffect: anxious })
  })

  it('maps settling and unsupported custom effects to safe fallbacks', () => {
    expect(getMascotPresentation('COMING_DOWN', [effect('Calm')]).pose).toBe('settling')
    expect(getMascotPresentation('NORMAL', [effect('My custom feeling', 'NEUTRAL')]).pose).toBe('neutral')
  })
})
