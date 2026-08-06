import type { EffectDefinition, SessionState } from './types'

export type MascotPose = 'neutral' | 'uplifted' | 'high-happy' | 'settling' | 'concerned'

export interface MascotPresentation {
  pose: MascotPose
  primaryEffect?: EffectDefinition
}

const HAPPY_EFFECTS = new Set(['happy', 'euphoric'])
const UPLIFTING_EFFECTS = new Set(['social', 'creative', 'focused', 'energetic', 'tuned in', 'light body'])
const SETTLING_EFFECTS = new Set(['calm', 'quiet', 'relaxed', 'heavy', 'couchlocked'])
const DREAMY_EFFECTS = new Set(['dreamy', 'time feels slow'])

const basePose = (state: SessionState): MascotPose => {
  if (state === 'TOO_HIGH') return 'concerned'
  if (state === 'HIGH' || state === 'SUPER_HIGH') return 'high-happy'
  if (state === 'COMING_DOWN') return 'settling'
  if (state === 'FEELING_IT' || state === 'LIGHT') return 'uplifted'
  return 'neutral'
}

export function getMascotPresentation(state: SessionState, effects: EffectDefinition[]): MascotPresentation {
  const unwanted = effects.find((effect) => effect.sentiment === 'UNWANTED')
  if (state === 'TOO_HIGH') return { pose: 'concerned', primaryEffect: unwanted ?? effects[0] }
  if (unwanted) return { pose: 'concerned', primaryEffect: unwanted }

  const happy = effects.find((effect) => HAPPY_EFFECTS.has(effect.label.toLowerCase()))
  if (happy) return { pose: state === 'HIGH' || state === 'SUPER_HIGH' ? 'high-happy' : 'uplifted', primaryEffect: happy }

  const dreamy = effects.find((effect) => DREAMY_EFFECTS.has(effect.label.toLowerCase()))
  if (dreamy) return { pose: 'high-happy', primaryEffect: dreamy }

  const settling = effects.find((effect) => SETTLING_EFFECTS.has(effect.label.toLowerCase()))
  if (settling) return { pose: 'settling', primaryEffect: settling }

  const uplifting = effects.find((effect) => UPLIFTING_EFFECTS.has(effect.label.toLowerCase()))
  if (uplifting) return { pose: 'uplifted', primaryEffect: uplifting }

  return { pose: basePose(state), primaryEffect: effects[0] }
}
