import type { EffectDefinition, SessionState } from './types'

export const STATE_META: Record<SessionState, { label: string; level: number; tone: string }> = {
  NOT_FEELING_IT: { label: 'Not feeling it yet', level: 0, tone: 'cyan' },
  FEELING_IT: { label: 'Feeling it', level: 1, tone: 'lavender' },
  LIGHT: { label: 'Light', level: 2, tone: 'lavender' },
  HIGH: { label: 'High', level: 3, tone: 'lavender' },
  SUPER_HIGH: { label: 'Super high', level: 4, tone: 'lavender' },
  TOO_HIGH: { label: 'Too high', level: 5, tone: 'coral' },
  COMING_DOWN: { label: 'Coming down', level: 2, tone: 'cyan' },
  NORMAL: { label: 'Back to normal', level: 0, tone: 'cyan' },
}

export const STATE_ORDER = Object.keys(STATE_META) as SessionState[]
export const METHODS = ['Joint', 'Vape', 'Bong/pipe', 'Edible', 'Dab/concentrate', 'Other']

const groups = {
  MIND: ['Dreamy', 'Tuned in', 'Creative', 'Focused', 'Distracted', 'Time feels slow', 'Forgetful'],
  MOOD: ['Happy', 'Calm', 'Social', 'Quiet', 'Euphoric', 'Anxious', 'Paranoid'],
  BODY: ['Light body', 'Heavy', 'Relaxed', 'Energetic', 'Couchlocked', 'Dizzy', 'Dry mouth', 'Hungry'],
} as const

const unwanted = new Set(['Anxious', 'Paranoid', 'Dizzy', 'Dry mouth', 'Forgetful'])
export const SEEDED_EFFECTS: EffectDefinition[] = Object.entries(groups).flatMap(([group, labels]) =>
  labels.map((label) => ({ id: `seed-${label.toLowerCase().replaceAll(' ', '-')}`, label, group: group as EffectDefinition['group'], sentiment: unwanted.has(label) ? 'UNWANTED' : 'DESIRED', isCustom: false })),
)

export const CONTEXT_OPTIONS = ['Cigarette/nicotine', 'Alcohol', 'Caffeine', 'Food', 'Water', 'Medication', 'Sleep', 'Anxiety/panic moment', 'Custom event']
