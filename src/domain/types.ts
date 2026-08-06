export type SessionState = 'NOT_FEELING_IT' | 'FEELING_IT' | 'LIGHT' | 'HIGH' | 'SUPER_HIGH' | 'TOO_HIGH' | 'COMING_DOWN' | 'NORMAL'
export type EventKind = 'CONSUME' | 'STATE_CHANGE' | 'EFFECTS_UPDATE' | 'CONTEXT' | 'NOTE'
export type EffectGroup = 'MIND' | 'MOOD' | 'BODY' | 'CUSTOM'
export type Sentiment = 'DESIRED' | 'NEUTRAL' | 'UNWANTED'
export type ReflectionSleep = 'VERY_POOR' | 'POOR' | 'OKAY' | 'GOOD' | 'VERY_GOOD'
export type ReflectionMood = 'VERY_LOW' | 'LOW' | 'OKAY' | 'GOOD' | 'VERY_GOOD'

export interface Session {
  id: string
  startedAt: string
  endedAt: string | null
  initialMethod: string
  productName?: string
  initialAmount?: string
  privateNote?: string
  rating?: number
  wouldUseAgain?: 'YES' | 'MAYBE' | 'NO'
  nextDayReminder?: boolean
  nextDayReflectionDismissedAt?: string
  isDemo?: boolean
  createdAt: string
  updatedAt: string
}

export interface TimelineEvent {
  id: string
  sessionId: string
  occurredAt: string
  sequence: number
  kind: EventKind
  state?: SessionState
  category?: string
  method?: string
  productName?: string
  amount?: string
  activeEffectIds?: string[]
  note?: string
  isBookmarked?: boolean
  bookmarkLabel?: string
  createdAt: string
  updatedAt: string
}

export interface BookmarkAttachment {
  eventId: string
  sessionId: string
  photo?: Blob
  photoName?: string
  audio?: Blob
  createdAt: string
  updatedAt: string
}

export interface EffectDefinition {
  id: string
  label: string
  group: EffectGroup
  sentiment: Sentiment
  isCustom: boolean
}

export interface NextDayReflection {
  sessionId: string
  sleep?: ReflectionSleep
  mood?: ReflectionMood
  note?: string
  createdAt: string
  updatedAt: string
}

export interface Backup {
  schemaVersion: 2
  exportedAt: string
  sessions: Session[]
  events: TimelineEvent[]
  effects: EffectDefinition[]
  reflections: NextDayReflection[]
}
