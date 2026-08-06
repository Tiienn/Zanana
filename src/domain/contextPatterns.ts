import type { EffectDefinition, Session, TimelineEvent } from './types'

export interface ContextPattern {
  context: string
  contextSessionCount: number
  effectId: string
  effectLabel: string
  togetherSessionCount: number
}

export function buildContextPatterns(
  sessions: Session[],
  events: TimelineEvent[],
  effects: EffectDefinition[],
  minimumContextSessions = 3,
  minimumTogetherSessions = 2,
): ContextPattern[] {
  const effectLabels = new Map(effects.map((effect) => [effect.id, effect.label]))
  const contextSessions = new Map<string, Set<string>>()
  const togetherSessions = new Map<string, Map<string, Set<string>>>()

  for (const session of sessions.filter((item) => item.endedAt && !item.isDemo)) {
    const sessionEvents = events.filter((event) => event.sessionId === session.id)
    const contexts = sessionEvents.filter((event) => event.kind === 'CONTEXT' && event.category)
    const effectUpdates = sessionEvents.filter((event) => event.kind === 'EFFECTS_UPDATE' && event.activeEffectIds?.length)
    for (const context of contexts) {
      const name = context.category as string
      if (!contextSessions.has(name)) contextSessions.set(name, new Set())
      contextSessions.get(name)?.add(session.id)
      const laterEffects = new Set(effectUpdates.filter((event) => Date.parse(event.occurredAt) >= Date.parse(context.occurredAt)).flatMap((event) => event.activeEffectIds ?? []))
      if (!togetherSessions.has(name)) togetherSessions.set(name, new Map())
      for (const effectId of laterEffects) {
        const byEffect = togetherSessions.get(name) as Map<string, Set<string>>
        if (!byEffect.has(effectId)) byEffect.set(effectId, new Set())
        byEffect.get(effectId)?.add(session.id)
      }
    }
  }

  return [...contextSessions].flatMap(([context, sessionIds]) => {
    if (sessionIds.size < minimumContextSessions) return []
    const strongest = [...(togetherSessions.get(context) ?? new Map())]
      .filter(([effectId, paired]) => effectLabels.has(effectId) && paired.size >= minimumTogetherSessions)
      .sort((a,b) => b[1].size - a[1].size || (effectLabels.get(a[0]) ?? '').localeCompare(effectLabels.get(b[0]) ?? ''))[0]
    if (!strongest) return []
    return [{ context, contextSessionCount: sessionIds.size, effectId: strongest[0], effectLabel: effectLabels.get(strongest[0]) as string, togetherSessionCount: strongest[1].size }]
  }).sort((a,b) => b.togetherSessionCount-a.togetherSessionCount || b.contextSessionCount-a.contextSessionCount || a.context.localeCompare(b.context))
}
