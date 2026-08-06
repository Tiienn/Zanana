import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { BrowserRouter, Link, NavLink, Navigate, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { format, parseISO } from 'date-fns'
import { Activity, ArrowLeft, BarChart3, Check, ChevronRight, CircleStop, Clock3, Download, FileDown, Gamepad2, HeartHandshake, History as HistoryIcon, Home as HomeIcon, Image as ImageIcon, Info, Mic, Moon, MoreHorizontal, Pause, Pencil, Play, Plus, RotateCcw, Search, Settings as SettingsIcon, Share2, Sparkles, Square, Star, Sun, Trash2, Undo2, Upload, Wind, X } from 'lucide-react'
import { CONTEXT_OPTIONS, METHODS, SEEDED_EFFECTS, STATE_META, STATE_ORDER } from './domain/constants'
import type { BookmarkAttachment, EffectDefinition, EventKind, NextDayReflection, ReflectionMood, ReflectionSleep, Session, SessionState, TimelineEvent } from './domain/types'
import { byTime, formatDuration, isSessionComplete, stateAt, stateLevel, summarizeSession } from './domain/timeline'
import { csvCell, makeBackup, validateBackup } from './domain/backup'
import { addEvent, clearAll, db, id, initializeDb, nowIso, reopenSession, replaceWithBackup } from './data/db'
import { clearDemoData, loadDemoData } from './data/demo'
import { getMascotPresentation } from './domain/mascot'
import { buildContextPatterns } from './domain/contextPatterns'
import { ZananaMascot } from './components/ZananaMascot'
import './index.css'
import './overrides.css'

const toLocalInput = (iso: string) => format(parseISO(iso), "yyyy-MM-dd'T'HH:mm")
const fromLocalInput = (value: string) => new Date(value).toISOString()
const download = (name: string, contents: BlobPart, type: string) => {
  const url = URL.createObjectURL(new Blob([contents], { type }))
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url)
}
const formatBytes = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1024*1024 ? `${(bytes/1024).toFixed(1)} KB` : `${(bytes/1024/1024).toFixed(1)} MB`

function useTick(rate = 10_000) {
  const [now, setNow] = useState(() => new Date(nowIso()))
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date(nowIso())), rate); return () => clearInterval(timer) }, [rate])
  return now
}

function Modal({ title, children, footer, onClose, wide = false }: { title: string; children: ReactNode; footer?: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { ref.current?.querySelector<HTMLElement>('button, input, select, textarea')?.focus() }, [])
  const trap = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') onClose()
    if (event.key !== 'Tab' || !ref.current) return
    const focusable = [...ref.current.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, textarea, a[href]')]
    const first = focusable[0], last = focusable.at(-1)
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  }
  return createPortal(<div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
    <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="modal-title" onKeyDown={trap} className={`modal ${wide ? 'modal-wide' : ''}`}>
      <header className="modal-head"><h2 id="modal-title">{title}</h2><button className="icon-button" aria-label="Close" onClick={onClose}><X /></button></header>
      <div className="modal-body">{children}</div>
      {footer && <footer className="modal-footer">{footer}</footer>}
    </div>
  </div>, document.body)
}

type BreathPhase = 'ready' | 'inhale' | 'exhale' | 'complete'

function BreathingExercise() {
  const [phase, setPhase] = useState<BreathPhase>('ready')
  const [seconds, setSeconds] = useState(4)
  const [cycles, setCycles] = useState(0)
  const [running, setRunning] = useState(false)
  const totalCycles = 6

  useEffect(() => {
    if (!running || (phase !== 'inhale' && phase !== 'exhale')) return
    const timer = window.setTimeout(() => setSeconds((value) => {
      if (value > 1) return value - 1
      if (phase === 'inhale') { setPhase('exhale'); return 6 }
      const nextCycle = cycles + 1
      setCycles(nextCycle)
      if (nextCycle >= totalCycles) { setPhase('complete'); setRunning(false); return 0 }
      setPhase('inhale')
      return 4
    }), 1_000)
    return () => window.clearTimeout(timer)
  }, [cycles, phase, running])

  const start = () => { setPhase('inhale'); setSeconds(4); setCycles(0); setRunning(true) }
  const reset = () => { setPhase('ready'); setSeconds(4); setCycles(0); setRunning(false) }
  const phaseText = phase === 'inhale' ? 'Breathe in gently' : phase === 'exhale' ? 'Breathe out slowly' : phase === 'complete' ? 'Exercise complete' : 'One quiet minute'
  const displayedPhase = !running && (phase === 'inhale' || phase === 'exhale') ? `Paused · ${phaseText}` : phaseText

  return <section className="breathing-card" aria-labelledby="breathing-title">
    <div className="breathing-copy"><p className="eyebrow">A gentle 60-second exercise</p><h3 id="breathing-title">Breathe with Zanana</h3><p>Take a normal, comfortable breath in. Let the breath out slowly—never force it.</p></div>
    <div className={`breath-stage phase-${phase} ${running ? 'is-running' : 'is-paused'}`}>
      <div className="breath-halo" aria-hidden="true"><div className="breath-orb"><ZananaMascot pose={phase === 'complete' ? 'uplifted' : 'settling'} /></div></div>
      <div className="breath-status" aria-live="polite" aria-atomic="true"><strong>{displayedPhase}</strong>{(phase === 'inhale' || phase === 'exhale') && <span>{seconds}</span>}<small>{phase === 'ready' ? '4 in · 6 out · no hold' : phase === 'complete' ? '6 of 6 cycles' : `Cycle ${Math.min(cycles + 1, totalCycles)} of ${totalCycles}`}</small></div>
    </div>
    <div className="breath-controls">
      {(phase === 'ready' || phase === 'complete') ? <button className="primary" type="button" onClick={start}><Play />{phase === 'complete' ? 'Breathe again' : 'Start breathing'}</button> : <button className="primary" type="button" onClick={() => setRunning((value) => !value)}>{running ? <Pause /> : <Play />}{running ? 'Pause' : 'Continue'}</button>}
      {phase !== 'ready' && <button className="text-button" type="button" onClick={reset}><RotateCcw /> Reset</button>}
    </div>
    <p className="breath-guidance">If you feel dizzy or uncomfortable, stop and return to your normal breathing.</p>
  </section>
}

function ComfortMode({ sessionId, onClose, onSaved }: { sessionId: string; onClose: () => void; onSaved: (text: string) => void }) {
  const saveComfortContext = async (category: string) => { await addEvent(sessionId, { kind: 'CONTEXT', category }); onSaved(`${category} added to your timeline`) }
  return <Modal title="Comfort mode" onClose={onClose} wide>
    <div className="comfort-intro"><div><p className="eyebrow">Zanana is here with you</p><h2>Take this one step at a time.</h2><p>You do not need to finish anything. Choose whatever feels comfortable, or simply close this space.</p></div><ZananaMascot pose="settling" /></div>
    <BreathingExercise />
    <section className="comfort-steps" aria-labelledby="comfort-steps-title"><p className="eyebrow">Other gentle options</p><h3 id="comfort-steps-title">Make the space easier</h3><div className="comfort-option-grid"><article><span aria-hidden="true">🛋️</span><div><strong>Sit somewhere comfortable</strong><p>Reduce noise or bright light if that feels helpful.</p></div></article><button type="button" onClick={() => saveComfortContext('Water')}><span aria-hidden="true">💧</span><span><strong>Add water</strong><small>Save a water marker</small></span></button><button type="button" onClick={() => saveComfortContext('Snack / munchies')}><span aria-hidden="true">🍌</span><span><strong>Add a snack</strong><small>Save a food marker</small></span></button><article><span aria-hidden="true">💬</span><div><strong>Reach out if you want</strong><p>Contact someone you trust and ask them to stay with you.</p></div></article></div></section>
    <aside className="comfort-safety"><HeartHandshake /><div><strong>Comfort, not a safety check</strong><p>This exercise does not measure intoxication, determine sobriety, or tell you whether it is safe to drive. For severe symptoms or immediate danger, contact local emergency services.</p></div></aside>
  </Modal>
}

function Onboarding() {
  const [step, setStep] = useState(0)
  const [confirmed, setConfirmed] = useState(false)
  const navigate = useNavigate()
  const pages = [
    { eyebrow: 'A private timeline', title: 'Track the shape of your session.', copy: 'Tap whenever your self-reported state changes. Zanana turns those moments into a personal curve.' },
    { eyebrow: 'How it works', title: 'You record the changes.', copy: 'The journal calculates the intervals. Re-dosing, multiple peaks, effects, nicotine, food, and notes all stay on one timeline.' },
    { eyebrow: 'Privacy by design', title: 'No account. Stored on this device.', copy: 'Nothing is uploaded. Export or share only when you choose to.' },
    { eyebrow: 'Use responsibly', title: 'A journal, not a sobriety test.', copy: 'This app does not diagnose, estimate impairment, or determine whether you are safe to drive or operate machinery. For severe symptoms or immediate danger, contact local emergency services.' },
  ]
  const finish = () => { localStorage.setItem('ht-onboarded', 'true'); navigate('/', { replace: true }); window.dispatchEvent(new Event('ht-onboarded')) }
  return <main className="onboarding-shell">
    <div className="onboarding-art" aria-hidden="true"><div className="signal-line" /><ZananaMascot pose={step === 3 ? 'settling' : step === 1 ? 'uplifted' : 'neutral'} /><span>{step + 1}/4</span></div>
    <section className="onboarding-card">
      <p className="eyebrow">{pages[step].eyebrow}</p><h1>{pages[step].title}</h1><p className="lede">{pages[step].copy}</p>
      {step === 3 && <label className="confirm-row"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /><span>I confirm I am at least 18, or the legal age in my jurisdiction.</span></label>}
      <div className="onboarding-actions">
        {step < 3 ? <><button className="text-button" onClick={() => setStep(3)}>Skip intro</button><button className="primary" onClick={() => setStep((s) => s + 1)}>Continue <ChevronRight /></button></> : <><button className="text-button" onClick={() => setStep(0)}>Review</button><button className="primary" disabled={!confirmed} onClick={finish}>Enter journal <Check /></button></>}
      </div>
    </section>
  </main>
}

function Shell({ children, active = false, onPrimaryAction }: { children: ReactNode; active?: boolean; onPrimaryAction?: () => void }) {
  const sessions = useLiveQuery(() => db.sessions.orderBy('startedAt').reverse().toArray(), []) ?? []
  const events = useLiveQuery(() => db.events.toArray(), []) ?? []
  const effects = useLiveQuery(() => db.effects.toArray(), []) ?? []
  const activeSession = sessions.find((session) => !isSessionComplete(session, events.filter((event) => event.sessionId === session.id)))
  const activeEvents = activeSession ? events.filter((event) => event.sessionId === activeSession.id) : []
  const current = stateAt(activeEvents)
  const currentEffects = latestEffects(activeEvents).map((effectId) => effects.find((effect) => effect.id === effectId)).filter(Boolean) as EffectDefinition[]
  const companion = getMascotPresentation(current, currentEffects)
  return <div className="app-shell"><div className="ambient" /><header className="topbar"><Link to="/" className="brand" aria-label={activeSession ? `Zanana home. Active timeline: ${STATE_META[current].label}` : 'Zanana home'}><span className="brand-mark"><ZananaMascot pose={companion.pose} /></span><span>ZANANA</span></Link><div className="topbar-actions"><Link className="quiet-link" to="/about"><Info /> About</Link><Link className="quiet-link" to="/settings"><SettingsIcon /> Settings</Link></div></header><div className="page-wrap">{children}</div>{!active && <BottomNav activeSessionId={activeSession?.id} onPrimaryAction={onPrimaryAction} />}</div>
}

function BottomNav({ activeSessionId, onPrimaryAction }: { activeSessionId?: string; onPrimaryAction?: () => void }) {
  const navigate = useNavigate()
  const destination = activeSessionId ? `/session/${activeSessionId}/live` : '/session/new'
  const primaryLabel = activeSessionId ? 'Add event to active timeline' : 'Start session'
  const activate = () => onPrimaryAction ? onPrimaryAction() : navigate(activeSessionId ? `${destination}?add=event` : destination)
  return <nav className={`bottom-nav ${activeSessionId ? 'has-live-session' : ''}`} aria-label="Primary"><NavLink to="/" end><HomeIcon /><span>Home</span></NavLink>{activeSessionId?<NavLink to="/game"><Gamepad2 /><span>Game</span></NavLink>:<NavLink to="/insights"><BarChart3 /><span>Insights</span></NavLink>}<button className="nav-primary" type="button" aria-label={primaryLabel} onClick={activate}><span><Plus /></span><small>{activeSessionId ? 'Add' : 'Start'}</small></button>{activeSessionId?<NavLink to={destination} className="active-timeline-link"><Activity /><span>Timeline</span><i aria-hidden="true" /></NavLink>:<NavLink to="/game"><Gamepad2 /><span>Game</span></NavLink>}<NavLink to="/history"><HistoryIcon /><span>History</span></NavLink></nav>
}

const SLEEP_CHOICES: { value: ReflectionSleep; label: string }[] = [
  { value:'VERY_POOR', label:'Very poor' }, { value:'POOR', label:'Poor' }, { value:'OKAY', label:'Okay' }, { value:'GOOD', label:'Good' }, { value:'VERY_GOOD', label:'Very good' },
]
const MOOD_CHOICES: { value: ReflectionMood; label: string }[] = [
  { value:'VERY_LOW', label:'Very low' }, { value:'LOW', label:'Low' }, { value:'OKAY', label:'Okay' }, { value:'GOOD', label:'Good' }, { value:'VERY_GOOD', label:'Very good' },
]
const reflectionLabel = (value?: string) => value ? value.toLowerCase().replaceAll('_',' ').replace(/^./, (letter) => letter.toUpperCase()) : 'Not noted'

function ReflectionModal({ session, reflection, onClose }: { session: Session; reflection?: NextDayReflection; onClose: () => void }) {
  const [sleep,setSleep]=useState<ReflectionSleep|undefined>(reflection?.sleep)
  const [mood,setMood]=useState<ReflectionMood|undefined>(reflection?.mood)
  const [note,setNote]=useState(reflection?.note ?? '')
  const [confirmDelete,setConfirmDelete]=useState(false)
  const save=async()=>{const stamp=nowIso();await db.reflections.put({sessionId:session.id,sleep,mood,note:note.trim()||undefined,createdAt:reflection?.createdAt??stamp,updatedAt:stamp});onClose()}
  const footer=<div className="reflection-modal-actions"><button className="primary" type="button" onClick={save}><Check/> Save reflection</button>{reflection&&(confirmDelete?<><span>Delete this reflection?</span><button className="danger" type="button" onClick={async()=>{await db.reflections.delete(session.id);onClose()}}>Confirm delete</button></>:<button className="danger-quiet" type="button" onClick={()=>setConfirmDelete(true)}><Trash2/> Delete reflection</button>)}</div>
  return <Modal title={reflection?'Edit next-day reflection':'Add next-day reflection'} onClose={onClose} wide footer={footer}><div className="reflection-modal-intro"><div><p className="eyebrow">A separate note for later</p><h3>{session.productName||session.initialMethod}</h3><p>{format(parseISO(session.startedAt),'d MMM yyyy')} · Every field is optional.</p></div><ZananaMascot pose="settling"/></div><fieldset className="reflection-field"><legend>How was your sleep?</legend><div className="reflection-scale">{SLEEP_CHOICES.map(choice=><button type="button" key={choice.value} aria-pressed={sleep===choice.value} onClick={()=>setSleep(sleep===choice.value?undefined:choice.value)}>{choice.label}</button>)}</div></fieldset><fieldset className="reflection-field"><legend>How was your mood?</legend><div className="reflection-scale">{MOOD_CHOICES.map(choice=><button type="button" key={choice.value} aria-pressed={mood===choice.value} onClick={()=>setMood(mood===choice.value?undefined:choice.value)}>{choice.label}</button>)}</div></fieldset><label>Worth remembering? <span>Optional</span><textarea rows={4} value={note} onChange={event=>setNote(event.target.value)} placeholder="A private note for your future self"/></label><aside className="reflection-safety"><Info/><p>This is a personal journal entry. It does not measure recovery, impairment, sobriety, or safety.</p></aside></Modal>
}

function ReflectionPrompt({ session, onOpen }: { session: Session; onOpen: () => void }) {
  const skip=()=>db.sessions.update(session.id,{nextDayReflectionDismissedAt:nowIso(),updatedAt:nowIso()})
  return <section className="reflection-prompt" aria-labelledby="reflection-prompt-title"><div className="reflection-sun" aria-hidden="true"><Sun/><i/><i/><i/></div><div className="reflection-prompt-copy"><p className="eyebrow">A note for the next day</p><h2 id="reflection-prompt-title">Want to remember how today feels?</h2><p>Add an optional note about sleep, mood, or anything worth keeping from your {format(parseISO(session.startedAt),'d MMM')} session.</p><div className="reflection-prompt-actions"><button className="primary" type="button" onClick={onOpen}>Add reflection</button><button className="text-button" type="button" onClick={skip}>Skip this one</button></div></div><div className="reflection-companion"><span>Only if you want.</span><ZananaMascot pose="settling"/></div></section>
}

type CompanionCheckInPreferences = { enabled: boolean; nextAt: number }
const CHECK_IN_KEY='zanana-check-ins-v1'
const readCheckInPreferences=():CompanionCheckInPreferences=>{try{const value=JSON.parse(localStorage.getItem(CHECK_IN_KEY)||'null') as Partial<CompanionCheckInPreferences>|null;return{enabled:value?.enabled!==false,nextAt:Number(value?.nextAt)||0}}catch{return{enabled:true,nextAt:0}}}
const writeCheckInPreferences=(preferences:CompanionCheckInPreferences)=>localStorage.setItem(CHECK_IN_KEY,JSON.stringify(preferences))

function CompanionCheckIn({ onChange }: { onChange: (preferences: CompanionCheckInPreferences) => void }) {
  const schedule=(hours:number)=>{const next={enabled:true,nextAt:Date.now()+hours*60*60_000};writeCheckInPreferences(next);onChange(next)}
  const turnOff=()=>{const next={enabled:false,nextAt:0};writeCheckInPreferences(next);onChange(next)}
  return <aside className="companion-check-in" aria-labelledby="companion-check-in-title"><div className="check-in-zanana"><ZananaMascot pose="neutral"/><span aria-hidden="true">?</span></div><div className="check-in-copy"><p className="eyebrow">A gentle check-in</p><h2 id="companion-check-in-title">Want to note how you feel?</h2><p>Only if it would be useful to you. You can dismiss these prompts at any time.</p><div className="check-in-actions"><Link className="primary" to="/session/new" onClick={()=>schedule(24)}>Note how I feel</Link><button className="secondary" type="button" onClick={()=>schedule(24)}>Not now</button><button className="text-button" type="button" onClick={()=>schedule(2)}><Clock3/> Snooze 2 hours</button><button className="text-button" type="button" onClick={turnOff}>Turn off</button></div></div></aside>
}

function Home() {
  const sessions = useLiveQuery(() => db.sessions.orderBy('startedAt').reverse().toArray(), []) ?? []
  const events = useLiveQuery(() => db.events.toArray(), []) ?? []
  const effects = useLiveQuery(() => db.effects.toArray(), []) ?? []
  const reflections = useLiveQuery(() => db.reflections.toArray(), []) ?? []
  const [reflectionSession,setReflectionSession]=useState<Session|null>(null)
  const [checkInPreferences,setCheckInPreferences]=useState<CompanionCheckInPreferences>(()=>readCheckInPreferences())
  const now = useTick()
  const sessionEvents = (session: Session) => events.filter((event) => event.sessionId === session.id)
  const active = sessions.find((session) => !isSessionComplete(session, sessionEvents(session)))
  const recent = sessions.filter((session) => isSessionComplete(session, sessionEvents(session))).slice(0, 3)
  const activeEvents = active ? sessionEvents(active) : []
  const current = stateAt(activeEvents)
  const lastState = [...activeEvents].filter((event) => event.kind === 'STATE_CHANGE').sort(byTime).at(-1)
  const activeEffects = latestEffects(activeEvents).map((effectId) => effects.find((effect) => effect.id === effectId)).filter(Boolean) as EffectDefinition[]
  const companion = getMascotPresentation(current, activeEffects)
  const reflectedIds=new Set(reflections.map(reflection=>reflection.sessionId))
  const reflectionPrompt=localStorage.getItem('ht-reflection-prompts')!=='off' ? sessions.filter(session=>!session.isDemo&&session.endedAt&&now.getTime()>=Date.parse(session.endedAt)+6*60*60_000&&!session.nextDayReflectionDismissedAt&&!reflectedIds.has(session.id)).sort((a,b)=>Date.parse(b.endedAt!)-Date.parse(a.endedAt!))[0] : undefined
  const showCompanionCheckIn=!active&&!reflectionPrompt&&checkInPreferences.enabled&&now.getTime()>=checkInPreferences.nextAt
  return <Shell><main>
    {active ? <section className={`active-home-hero tone-${STATE_META[current].tone}`}><div className="active-home-copy"><p className="eyebrow"><span className="live-dot" /> Your live timeline</p><h1>{STATE_META[current].label}</h1><p className="active-home-product">{active.productName || active.initialMethod}</p><div className="active-home-timing"><span><strong>{formatDuration(now.getTime() - Date.parse(active.startedAt), true)}</strong><small>elapsed</small></span><span><strong>{formatDuration(lastState ? now.getTime() - Date.parse(lastState.occurredAt) : 0, true)}</strong><small>in this state</small></span></div><Link className="primary hero-cta" to={`/session/${active.id}/live`}>Open live timeline <ChevronRight /></Link></div><div className="active-home-companion"><span className="companion-bubble">I’m here with you.</span><ZananaMascot pose={companion.pose} />{companion.primaryEffect && <span className="companion-effect"><Sparkles />{companion.primaryEffect.label}</span>}</div></section> : <section className="home-hero"><div className="home-hero-copy"><p className="eyebrow">Your private session journal</p><h1>How are you<br />feeling?</h1><p>Start a timeline when you want to notice changes. Everything stays on this device.</p><Link className="primary hero-cta" to="/session/new"><Plus /> Start session</Link></div><div className="home-hero-companion" aria-hidden="true"><span className="companion-bubble">Hi, I’m Zanana.</span><ZananaMascot pose="neutral" /></div></section>}
    {reflectionPrompt&&<ReflectionPrompt session={reflectionPrompt} onOpen={()=>setReflectionSession(reflectionPrompt)}/>} {showCompanionCheckIn&&<CompanionCheckIn onChange={setCheckInPreferences}/>} {reflectionSession&&<ReflectionModal session={reflectionSession} reflection={reflections.find(item=>item.sessionId===reflectionSession.id)} onClose={()=>setReflectionSession(null)}/>}<section className="section-block"><div className="section-head"><div><p className="eyebrow">Latest entries</p><h2>Recent sessions</h2></div><Link to="/history">View all</Link></div>
      {recent.length ? <div className="session-stack">{recent.map((session) => <SessionRow key={session.id} session={session} />)}</div> : <div className="empty"><Clock3 /><h3>Your first curve starts here.</h3><p>Start a timeline and record only what matters to you.</p></div>}
    </section>
    <aside className="privacy-strip"><Moon /><div><strong>Local by default</strong><span>No account. No tracking. No cloud.</span></div></aside>
  </main></Shell>
}

function SessionRow({ session }: { session: Session }) {
  const events = useLiveQuery(() => db.events.where('sessionId').equals(session.id).toArray(), [session.id]) ?? []
  const summary = summarizeSession(session, events)
  const completed = isSessionComplete(session, events)
  const effects = useLiveQuery(() => db.effects.toArray(), []) ?? []
  const selected = latestEffects(events).map((effectId) => effects.find((item) => item.id === effectId)?.label).filter(Boolean).slice(0, 3)
  const bookmarkCount=events.filter((event)=>event.isBookmarked).length
  return <Link to={completed ? `/session/${session.id}/summary` : `/session/${session.id}/live`} className="session-row"><div className="date-tile"><strong>{format(parseISO(session.startedAt), 'dd')}</strong><span>{format(parseISO(session.startedAt), 'MMM')}</span></div><div className="session-row-main"><strong>{session.productName || session.initialMethod}</strong><span>{completed ? `${session.initialMethod} · ${formatDuration(summary.totalDurationMs, true)}` : `Active · ${session.initialMethod}`}</span><div className="chips">{bookmarkCount>0&&<i className="bookmark-chip"><Star/> {bookmarkCount} saved</i>}{selected.map((label) => <i key={label}>{label}</i>)}</div></div>{session.rating && completed && <span className="rating">{session.rating}<small>/10</small></span>}<ChevronRight /></Link>
}

function StartSession() {
  const navigate = useNavigate(); const [method, setMethod] = useState('Joint'); const [product, setProduct] = useState(''); const [amount, setAmount] = useState(''); const [note, setNote] = useState('')
  const [startEffects, setStartEffects] = useState<string[]>([])
  const [startTime, setStartTime] = useState(toLocalInput(nowIso())); const previous = useLiveQuery(() => db.sessions.orderBy('updatedAt').reverse().limit(8).toArray(), []) ?? []
  const suggestions = [...new Set(previous.map((item) => item.productName).filter(Boolean))]
  const submit = async (event: FormEvent) => {
    event.preventDefault(); const timestamp = fromLocalInput(startTime); const stamp = nowIso(); const sessionId = id('session')
    const session: Session = { id: sessionId, startedAt: timestamp, endedAt: null, initialMethod: method, productName: product.trim() || undefined, initialAmount: amount.trim() || undefined, privateNote: note.trim() || undefined, createdAt: stamp, updatedAt: stamp }
    const initial: TimelineEvent[] = [
      { id:id('evt'), sessionId, occurredAt:timestamp, sequence:1, kind:'CONSUME', method, productName:session.productName, amount:session.initialAmount, createdAt:stamp, updatedAt:stamp },
      { id:id('evt'), sessionId, occurredAt:timestamp, sequence:2, kind:'STATE_CHANGE', state:'NOT_FEELING_IT', createdAt:stamp, updatedAt:stamp },
    ]
    if (startEffects.length) initial.push({ id:id('evt'), sessionId, occurredAt:timestamp, sequence:3, kind:'EFFECTS_UPDATE', activeEffectIds:startEffects, createdAt:stamp, updatedAt:stamp })
    await db.transaction('rw', db.sessions, db.events, async () => { await db.sessions.add(session); await db.events.bulkAdd(initial) }); navigate(`/session/${sessionId}/live`)
  }
  return <Shell active><main className="narrow-page"><Link to="/" className="back-link"><ArrowLeft /> Home</Link><p className="eyebrow">New timeline</p><h1>What did you have?</h1><p className="page-intro">Only the method is required. Everything else can wait.</p>
    <form className="form-card" onSubmit={submit}><fieldset><legend>Consumption method</legend><div className="method-grid">{METHODS.map((item) => <button type="button" aria-pressed={method === item} className={method === item ? 'selected' : ''} onClick={() => setMethod(item)} key={item}>{item}</button>)}</div></fieldset>
      <label>Product or strain <span>Optional</span><input list="products" value={product} onChange={(e) => setProduct(e.target.value)} placeholder="e.g. Night Orchard" /></label><datalist id="products">{suggestions.map((item) => <option key={item} value={item} />)}</datalist>
      <label>Amount or dose <span>Optional</span><input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Free text, if useful" /></label>
      <label>Starting note <span>Optional</span><textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Mood, setting, or anything you want to remember" /></label>
      <details className="starting-effects"><summary>Starting mood or effects <span>Optional</span></summary><div className="effect-grid">{SEEDED_EFFECTS.map(effect=><button type="button" aria-pressed={startEffects.includes(effect.id)} key={effect.id} onClick={()=>setStartEffects(items=>items.includes(effect.id)?items.filter(id=>id!==effect.id):[...items,effect.id])}>{effect.label}{startEffects.includes(effect.id)&&<Check/>}</button>)}</div></details>
      <label>Start time <input type="datetime-local" value={startTime} max={toLocalInput(nowIso())} onChange={(e) => setStartTime(e.target.value)} /></label>
      <button className="primary full" type="submit">Start timeline <Activity /></button>
    </form></main></Shell>
}

function TimelineChart({ session, events, now, compact = false }: { session: Session; events: TimelineEvent[]; now?: Date; compact?: boolean }) {
  const summary = summarizeSession(session, events, now)
  const completed = isSessionComplete(session, events)
  const start = Date.parse(session.startedAt), total = Math.max(summary.totalDurationMs, 60_000)
  const points = summary.intervals.flatMap((item, index) => {
    const x1 = ((item.start - start) / total) * 100, x2 = ((item.end - start) / total) * 100, y = 52 - stateLevel(item.state) * 9
    return index ? [`${x1},${y}`, `${x2},${y}`] : [`0,${y}`, `${x2},${y}`]
  }).join(' ')
  const markers = events.filter((event) => event.kind === 'CONSUME' || event.kind === 'CONTEXT').sort(byTime)
  return <figure className={`timeline-chart ${compact ? 'compact' : ''}`}><svg viewBox="0 0 100 60" role="img" aria-labelledby={`curve-${session.id}`} preserveAspectRatio="none"><title id={`curve-${session.id}`}>Self-reported intensity curve</title><defs><linearGradient id={`g-${session.id}`} x1="0" x2="1"><stop stopColor="#548f6f" /><stop offset="1" stopColor="#6f9a73" /></linearGradient></defs><path className="gridline" d="M0 52H100 M0 34H100 M0 16H100" /><polyline points={points || '0,52 100,52'} fill="none" stroke={`url(#g-${session.id})`} strokeWidth="2.5" vectorEffect="non-scaling-stroke" />{markers.map((event) => { const x = Math.max(0, Math.min(100, ((Date.parse(event.occurredAt)-start)/total)*100)); return <circle key={event.id} cx={x} cy="55" r="1.8" className={event.kind === 'CONSUME' ? 'consume-marker' : 'context-marker'} />})}</svg><figcaption><span>Start</span><span>Peak</span><span>{completed ? 'End' : 'Now'}</span></figcaption><details><summary>Text version of curve</summary><ol>{summary.intervals.map((item) => <li key={item.source.id}>{STATE_META[item.state].label}: {formatDuration(item.durationMs)}</li>)}</ol></details></figure>
}

const latestEffects = (events: TimelineEvent[]) => events.filter((event) => event.kind === 'EFFECTS_UPDATE').sort(byTime).at(-1)?.activeEffectIds ?? []

function LiveSession() {
  const { id: sessionId = '' } = useParams(); const navigate = useNavigate(); const [searchParams, setSearchParams] = useSearchParams(); const tickNow = useTick(); const now = new Date(Math.max(tickNow.getTime(), Date.parse(nowIso())))
  const session = useLiveQuery(() => db.sessions.get(sessionId), [sessionId]); const events = useLiveQuery(() => db.events.where('sessionId').equals(sessionId).toArray(), [sessionId]) ?? []
  const effects = useLiveQuery(() => db.effects.toArray(), []) ?? []
  const [sheet, setSheet] = useState<'event'|'effects'|'note'|'missed'|'comfort'|'end'|null>(null); const [announcement, setAnnouncement] = useState(''); const [removed, setRemoved] = useState<TimelineEvent | null>(null); const [removedAttachment,setRemovedAttachment]=useState<BookmarkAttachment|undefined>()
  useEffect(() => { if (searchParams.get('add') === 'event') { setSheet('event'); setSearchParams({}, { replace: true }) } }, [searchParams, setSearchParams])
  if (session === undefined) return <Shell active><div className="loading">Loading timeline…</div></Shell>
  if (!session) return <Navigate to="/" replace />
  if (isSessionComplete(session, events)) return <Navigate to="/" replace />
  const current = stateAt(events); const sorted = [...events].sort(byTime); const lastState = sorted.filter((event) => event.kind === 'STATE_CHANGE').at(-1)
  const activeEffects = latestEffects(events).map((effectId) => effects.find((effect) => effect.id === effectId)).filter(Boolean) as EffectDefinition[]
  const mascot = getMascotPresentation(current, activeEffects)
  const recordState = async (state: SessionState) => {
    if (state === current) return
    if (state === 'NORMAL') { setSheet('end'); return }
    await addEvent(session.id, { kind:'STATE_CHANGE', state }); setAnnouncement(`${STATE_META[state].label} saved`)
    if (state === 'TOO_HIGH') setSheet('comfort')
    if (localStorage.getItem('ht-haptics') !== 'off' && navigator.vibrate) navigator.vibrate(20)
  }
  const undo = async () => { const event = sorted.at(-1); if (!event || event.sequence <= 2) return; const attachment=await db.attachments.get(event.id);await db.transaction('rw',db.events,db.attachments,async()=>{await db.events.delete(event.id);await db.attachments.delete(event.id)});setRemovedAttachment(attachment);setRemoved(event);setAnnouncement('Last action removed') }
  const restore = async () => { if (!removed) return; await db.transaction('rw',db.events,db.attachments,async()=>{await db.events.put(removed);if(removedAttachment)await db.attachments.put(removedAttachment)});setRemovedAttachment(undefined);setRemoved(null);setAnnouncement('Action restored') }
  return <Shell onPrimaryAction={() => setSheet('event')}><main className="live-page"><div className="live-top live-reveal"><Link to="/" className="back-link"><ArrowLeft /> Home</Link><span className="live-pill"><i /><span>Live timeline</span></span></div>
    <section className={`live-status live-reveal tone-${STATE_META[current].tone}`}><div className="live-status-copy"><p className="eyebrow">Current self-report</p><h1>{STATE_META[current].label}</h1><p className="live-product">{session.productName || session.initialMethod}</p></div><div className="mascot-panel"><ZananaMascot pose={mascot.pose} testId="zanana-mascot" />{mascot.primaryEffect && <div className="mascot-effect" aria-label={`Active effects: ${activeEffects.map((effect) => effect.label).join(', ')}`}><Sparkles aria-hidden="true" /><span>{mascot.primaryEffect.label}</span>{activeEffects.length > 1 && <small>+{activeEffects.length - 1}</small>}</div>}</div><div className="live-timing"><span><strong>{formatDuration(now.getTime() - Date.parse(session.startedAt), true)}</strong><small>elapsed</small></span><span><strong>{formatDuration(lastState ? now.getTime() - Date.parse(lastState.occurredAt) : 0, true)}</strong><small>in this state</small></span></div></section>
    <div className="live-curve live-reveal"><div className="live-curve-heading"><div><p className="eyebrow">Session shape</p><h2>Your timeline</h2></div><span>Self-reported</span></div><TimelineChart session={session} events={events} now={now} /></div>
    <section className="quick-state live-reveal"><div className="section-head"><div><p className="eyebrow">One tap</p><h2>How are you now?</h2></div><button className="icon-button" onClick={undo} aria-label="Undo last action" disabled={sorted.length <= 2}><Undo2 /></button></div><div className="state-grid">{STATE_ORDER.map((state) => <button key={state} aria-label={STATE_META[state].label} aria-pressed={current === state} className={`${state === 'SUPER_HIGH' ? 'super-high' : ''} ${state === 'TOO_HIGH' ? 'too-high' : ''}`} onClick={() => recordState(state)}><small>Level {STATE_META[state].level}</small><span>{STATE_META[state].label}</span>{current === state && <Check />}</button>)}</div></section>
    <div className="live-tools live-reveal" aria-label="Live session tools"><button onClick={() => setSheet('comfort')}><Wind /><span>Comfort</span></button><button onClick={() => setSheet('effects')}><Sparkles /><span>Effects</span></button><button onClick={() => setSheet('note')}><Pencil /><span>Note</span></button><button onClick={undo} disabled={sorted.length <= 2}><Undo2 /><span>Undo</span></button></div>
    <section className="recent-card live-reveal"><div className="section-head"><div><p className="eyebrow">Timeline log</p><h2>Recent moments</h2></div><div className="inline-actions"><button className="text-button" onClick={() => setSheet('missed')}><Plus/> Add missed</button><Link to={`/session/${session.id}/edit`}>Edit</Link></div></div>{sorted.slice(-4).reverse().map((event) => <EventLine key={event.id} event={event} effects={effects} start={session.startedAt} />)}</section>
    <button className="end-session-button live-reveal" onClick={() => setSheet('end')}><CircleStop /><span><strong>End session</strong><small>Review and close this timeline</small></span><ChevronRight /></button>
    <div className="sr-only" aria-live="polite">{announcement}</div>{removed && <div className="toast">Action removed <button onClick={restore}>Restore</button></div>}
    {sheet === 'event' && <AddEventSheet session={session} onClose={() => setSheet(null)} onAddMissed={() => setSheet('missed')} onSaved={(text) => { setSheet(null); setAnnouncement(`${text} saved`) }} />}
    {sheet === 'effects' && <EffectsSheet sessionId={session.id} events={events} effects={effects} onClose={() => setSheet(null)} onSaved={(labels) => setAnnouncement(labels.length ? `Effects saved: ${labels.join(', ')}` : 'Effects cleared')} />}
    {sheet === 'note' && <NoteSheet sessionId={session.id} onClose={() => setSheet(null)} />}
    {sheet === 'missed' && <AddMissed session={session} events={events} effects={effects} onClose={() => setSheet(null)} />}
    {sheet === 'comfort' && <ComfortMode sessionId={session.id} onClose={() => setSheet(null)} onSaved={(text) => setAnnouncement(text)} />}
    {sheet === 'end' && <EndSheet session={session} onClose={() => setSheet(null)} onEnded={() => navigate('/')} />}
  </main></Shell>
}

function useBlobUrl(blob?: Blob) {
  const [url,setUrl] = useState('')
  useEffect(()=>{if(!blob||typeof URL.createObjectURL!=='function'){setUrl('');return}const next=URL.createObjectURL(blob);setUrl(next);return()=>URL.revokeObjectURL(next)},[blob])
  return url
}

function BookmarkModal({ event, attachment, onClose }: { event: TimelineEvent; attachment?: BookmarkAttachment; onClose: () => void }) {
  const [label,setLabel] = useState(event.bookmarkLabel || '')
  const [photo,setPhoto] = useState<Blob|undefined>(attachment?.photo)
  const [photoName,setPhotoName] = useState(attachment?.photoName || '')
  const [audio,setAudio] = useState<Blob|undefined>(attachment?.audio)
  const [recording,setRecording] = useState(false)
  const [recordedSeconds,setRecordedSeconds] = useState(0)
  const [error,setError] = useState('')
  const recorder = useRef<MediaRecorder|null>(null)
  const stream = useRef<MediaStream|null>(null)
  const chunks = useRef<Blob[]>([])
  const photoUrl=useBlobUrl(photo),audioUrl=useBlobUrl(audio)
  useEffect(()=>{if(!recording)return;const timer=window.setInterval(()=>setRecordedSeconds(value=>{if(value>=119){recorder.current?.stop();return 120}return value+1}),1000);return()=>window.clearInterval(timer)},[recording])
  useEffect(()=>()=>{if(recorder.current?.state==='recording'){recorder.current.onstop=null;recorder.current.stop()}stream.current?.getTracks().forEach((track)=>track.stop())},[])
  const pickPhoto=(file?:File)=>{if(!file)return;if(file.size>8*1024*1024){setError('Choose a photo smaller than 8 MB.');return}setPhoto(file);setPhotoName(file.name);setError('')}
  const startRecording=async()=>{if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined'){setError('Voice recording is not available in this browser.');return}try{const media=await navigator.mediaDevices.getUserMedia({audio:true});stream.current=media;chunks.current=[];const next=new MediaRecorder(media);recorder.current=next;next.ondataavailable=(data)=>{if(data.data.size)chunks.current.push(data.data)};next.onstop=()=>{setAudio(new Blob(chunks.current,{type:next.mimeType||'audio/webm'}));media.getTracks().forEach(track=>track.stop());stream.current=null;setRecording(false)};next.start();setRecordedSeconds(0);setRecording(true);setError('')}catch{setError('Microphone access was not granted. You can still save the bookmark without audio.')}}
  const stopRecording=()=>{if(recorder.current?.state==='recording')recorder.current.stop()}
  const save=async()=>{const timestamp=nowIso();await db.events.update(event.id,{isBookmarked:true,bookmarkLabel:label.trim()||undefined,updatedAt:timestamp});if(photo||audio)await db.attachments.put({eventId:event.id,sessionId:event.sessionId,photo,photoName:photo?photoName:undefined,audio,createdAt:attachment?.createdAt||timestamp,updatedAt:timestamp});else await db.attachments.delete(event.id);onClose()}
  const remove=async()=>{await db.transaction('rw',db.events,db.attachments,async()=>{await db.events.update(event.id,{isBookmarked:false,bookmarkLabel:undefined,updatedAt:nowIso()});await db.attachments.delete(event.id)});onClose()}
  return <Modal title={event.isBookmarked?'Edit bookmark':'Save this moment'} onClose={onClose} wide footer={<div className="bookmark-actions"><button className="primary" type="button" disabled={recording} onClick={save}><Star/> Save bookmark</button>{event.isBookmarked&&<button className="danger-quiet" type="button" disabled={recording} onClick={remove}><Trash2/> Remove bookmark</button>}</div>}><div className="bookmark-intro"><span><Star/></span><div><p className="eyebrow">A local keepsake</p><h3>Remember this moment</h3><p>Star it as-is, or add a short label, photo, or voice note.</p></div></div><div className="bookmark-form"><label>Label <span>Optional</span><input value={label} maxLength={80} onChange={(e)=>setLabel(e.target.value)} placeholder="What made this meaningful?"/></label><div className="attachment-grid"><section><div className="attachment-title"><ImageIcon/><div><strong>Photo</strong><small>{photo?`${photoName||'Photo'} · ${formatBytes(photo.size)}`:'Stored on this device'}</small></div></div>{photoUrl?<div className="photo-preview"><img src={photoUrl} alt="Bookmark attachment preview"/><button className="danger-quiet" type="button" onClick={()=>{setPhoto(undefined);setPhotoName('')}}><Trash2/> Remove photo</button></div>:<label className="attachment-picker"><ImageIcon/> Choose photo<input aria-label="Choose bookmark photo" type="file" accept="image/*" onChange={(e)=>pickPhoto(e.target.files?.[0])}/></label>}</section><section><div className="attachment-title"><Mic/><div><strong>Voice note</strong><small>{audio?`${formatBytes(audio.size)} · stored locally`:'Up to 2 minutes'}</small></div></div>{audioUrl&&!recording?<div className="audio-preview"><audio controls src={audioUrl} aria-label="Bookmark voice note"/><button className="danger-quiet" type="button" onClick={()=>setAudio(undefined)}><Trash2/> Remove recording</button></div>:recording?<button className="recording-button" type="button" onClick={stopRecording}><Square/> Stop recording <span>{Math.floor(recordedSeconds/60)}:{String(recordedSeconds%60).padStart(2,'0')}</span></button>:<button className="attachment-picker" type="button" onClick={startRecording}><Mic/> Record voice note</button>}</section></div>{error&&<p className="error-text" role="alert">{error}</p>}<aside className="attachment-privacy"><Info/><p>Stars and labels are included in JSON backups. Photos and voice notes remain in this browser and are not included in JSON, CSV, or share cards.</p></aside></div></Modal>
}

function BookmarkControl({event,label}:{event:TimelineEvent;label:string}) {
  const [open,setOpen]=useState(false)
  const attachment=useLiveQuery(()=>db.attachments.get(event.id),[event.id],null)
  return <><button type="button" className={`bookmark-button ${event.isBookmarked?'is-saved':''}`} aria-label={event.isBookmarked?`Edit bookmark for ${label}`:`Bookmark ${label}`} aria-pressed={Boolean(event.isBookmarked)} onClick={()=>setOpen(true)}><Star/></button>{open&&attachment!==null&&<BookmarkModal event={event} attachment={attachment} onClose={()=>setOpen(false)}/>}</>
}

function EventLine({ event, effects, start }: { event: TimelineEvent; effects: EffectDefinition[]; start: string }) {
  const label = event.kind === 'STATE_CHANGE' && event.state ? STATE_META[event.state].label : event.kind === 'EFFECTS_UPDATE' ? event.activeEffectIds?.map((id) => effects.find((effect) => effect.id === id)?.label).filter(Boolean).join(', ') || 'Effects updated' : event.category || event.note || event.productName || event.kind.toLowerCase()
  return <div className={`event-line ${event.isBookmarked?'is-bookmarked':''}`}><span className={`event-icon kind-${event.kind.toLowerCase()}`}>{event.kind === 'STATE_CHANGE' ? <Activity /> : event.kind === 'EFFECTS_UPDATE' ? <Sparkles /> : event.kind === 'NOTE' ? <Pencil /> : <Plus />}</span><div><strong>{label}</strong><span>{event.bookmarkLabel&&<i>{event.bookmarkLabel} · </i>}+{formatDuration(Date.parse(event.occurredAt) - Date.parse(start), true)}</span></div><time>{format(parseISO(event.occurredAt), 'HH:mm')}</time><BookmarkControl event={event} label={label}/></div>
}

function AddEventSheet({ session, onClose, onAddMissed, onSaved }: { session: Session; onClose: () => void; onAddMissed: () => void; onSaved: (text:string) => void }) {
  const [custom, setCustom] = useState(false); const [category, setCategory] = useState(''); const [product, setProduct] = useState(''); const [amount, setAmount] = useState(''); const [note, setNote] = useState(''); const [time, setTime] = useState(toLocalInput(nowIso()))
  const saveQuick = async (name: string, cannabis = false) => { await addEvent(session.id, { kind: cannabis ? 'CONSUME' : 'CONTEXT', category:name, method:cannabis ? session.initialMethod : undefined, productName:cannabis ? session.productName : undefined }); onSaved(name) }
  const saveCustom = async (event: FormEvent) => { event.preventDefault(); const cannabis = category.includes('joint') || category.includes('Vape') || category.includes('Edible') || category.includes('Dab') || category.includes('cannabis'); await addEvent(session.id, { kind:cannabis ? 'CONSUME':'CONTEXT', category, productName:product || undefined, amount:amount || undefined, note:note || undefined, occurredAt:fromLocalInput(time) }); onSaved(category) }
  const foodEvents=[['🥭','Mango','tone-mango'],['🍫','Chocolate / sweets','tone-chocolate'],['🍿','Snack / munchies','tone-snack'],['☕','Coffee / caffeine','tone-coffee'],['🍽️','Full meal','tone-meal'],['💧','Water','tone-water']] as const
  return <Modal title="Add to this timeline" onClose={onClose} wide><p className="modal-intro">Choose what happened. Nothing here restarts your session.</p>{!custom ? <><div className="quick-event-groups"><section className="quick-event-group"><div className="quick-group-head"><div><p className="eyebrow">Food & drink</p><h3>What did you have?</h3></div><small>Saved as context</small></div><div className="quick-choice-grid">{foodEvents.map(([icon,label,tone])=><button type="button" className={tone} key={label} onClick={()=>saveQuick(label)}><span className="quick-choice-icon" aria-hidden="true">{icon}</span><span><strong>{label}</strong><small>Add marker now</small></span></button>)}</div></section><section className="quick-event-group"><div className="quick-group-head"><div><p className="eyebrow">Session & context</p><h3>Something else?</h3></div></div><div className="quick-choice-grid compact"><button type="button" className="tone-session" onClick={() => saveQuick('More of the same', true)}><span className="quick-choice-icon"><RotateCcw /></span><span><strong>More of the same</strong><small>{session.productName || session.initialMethod}</small></span></button><button type="button" className="tone-context" onClick={() => saveQuick('Cigarette/nicotine')}><span className="quick-choice-icon"><Activity /></span><span><strong>Cigarette / nicotine</strong><small>Add marker now</small></span></button><button type="button" className="tone-context" onClick={() => saveQuick('Alcohol')}><span className="quick-choice-icon" aria-hidden="true">🍷</span><span><strong>Alcohol</strong><small>Add marker now</small></span></button><button type="button" className="tone-context" onClick={() => saveQuick('Medication')}><span className="quick-choice-icon" aria-hidden="true">💊</span><span><strong>Medication</strong><small>Add marker now</small></span></button></div></section></div><div className="context-note"><Info/><p>Food and drink are context markers. Zanana does not assume they changed your self-reported level.</p></div><div className="button-stack"><button className="secondary full" onClick={() => setCustom(true)}>More event types <MoreHorizontal /></button><button className="secondary full" onClick={onAddMissed}><Clock3 /> Add a missed event</button></div></> : <form onSubmit={saveCustom} className="sheet-form"><label>Event type<select required value={category} onChange={(e) => setCategory(e.target.value)}><option value="">Choose one</option><optgroup label="Cannabis"><option>Another joint/session dose</option><option>Different cannabis product</option><option>Vape</option><option>Edible</option><option>Dab/concentrate</option><option>Other cannabis method</option></optgroup><optgroup label="Context">{CONTEXT_OPTIONS.map((item) => <option key={item}>{item}</option>)}</optgroup></select></label><label>Name or product <span>Optional</span><input value={product} onChange={(e) => setProduct(e.target.value)} /></label><label>Amount <span>Optional</span><input value={amount} onChange={(e) => setAmount(e.target.value)} /></label><label>Note <span>Optional</span><textarea value={note} onChange={(e) => setNote(e.target.value)} /></label><label>Time<input type="datetime-local" min={toLocalInput(session.startedAt)} value={time} onChange={(e) => setTime(e.target.value)} /></label><button className="primary full" type="submit">Save event</button></form>}</Modal>
}

function EffectsSheet({ sessionId, events, effects, onClose, onSaved }: { sessionId:string; events:TimelineEvent[]; effects:EffectDefinition[]; onClose:()=>void; onSaved:(labels:string[])=>void }) {
  const [selected, setSelected] = useState<string[]>(latestEffects(events)); const [query, setQuery] = useState(''); const [custom, setCustom] = useState(''); const [sentiment, setSentiment] = useState<EffectDefinition['sentiment']>('NEUTRAL')
  const visible = effects.filter((effect) => effect.label.toLowerCase().includes(query.toLowerCase())).sort((a,b) => Number(selected.includes(b.id))-Number(selected.includes(a.id)) || a.label.localeCompare(b.label))
  const addCustom = async () => { if (!custom.trim()) return; const effect:EffectDefinition = { id:id('effect'), label:custom.trim(), group:'CUSTOM', sentiment, isCustom:true }; await db.effects.add(effect); setSelected((items) => [...items,effect.id]); setCustom('') }
  const save = async () => { await addEvent(sessionId, { kind:'EFFECTS_UPDATE', activeEffectIds:selected }); onSaved(selected.map((effectId) => effects.find((effect) => effect.id === effectId)?.label).filter(Boolean) as string[]); onClose() }
  return <Modal title="What are you noticing?" onClose={onClose} wide><div className="search-field"><Search /><input aria-label="Search effects" placeholder="Search effects" value={query} onChange={(e) => setQuery(e.target.value)} /></div><div className="effect-grid">{visible.map((effect) => <button key={effect.id} aria-pressed={selected.includes(effect.id)} onClick={() => setSelected((items) => items.includes(effect.id) ? items.filter((id) => id !== effect.id) : [...items,effect.id])}><span>{effect.label}</span><small>{effect.group.toLowerCase()} · {effect.sentiment.toLowerCase()}</small>{selected.includes(effect.id) && <Check />}</button>)}</div><div className="custom-effect"><input aria-label="Custom effect" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Add your own effect" /><select aria-label="Custom effect sentiment" value={sentiment} onChange={(e) => setSentiment(e.target.value as EffectDefinition['sentiment'])}><option value="DESIRED">Desired</option><option value="NEUTRAL">Neutral</option><option value="UNWANTED">Unwanted</option></select><button className="secondary" onClick={addCustom}>Add</button></div><button className="primary full" onClick={save}>Save {selected.length} effects</button></Modal>
}

function NoteSheet({ sessionId, onClose }: { sessionId:string; onClose:()=>void }) {
  const [note,setNote] = useState(''); return <Modal title="Add a private note" onClose={onClose}><label>What do you want to remember?<textarea autoFocus rows={5} value={note} onChange={(e) => setNote(e.target.value)} /></label><button className="primary full" disabled={!note.trim()} onClick={async () => { await addEvent(sessionId,{kind:'NOTE',note:note.trim()}); onClose() }}>Save note</button></Modal>
}

function EndSheet({ session, onClose, onEnded }: { session:Session; onClose:()=>void; onEnded:()=>void }) {
  const [end,setEnd] = useState(toLocalInput(nowIso()))
  const finish = async () => { const endedAt=fromLocalInput(end); if (Date.parse(endedAt)<Date.parse(session.startedAt)) return; await addEvent(session.id,{kind:'STATE_CHANGE',state:'NORMAL',occurredAt:endedAt}); await db.sessions.update(session.id,{endedAt,updatedAt:nowIso()}); onEnded() }
  return <Modal title="End this session?" onClose={onClose}><div className="safety-note"><Info /><p>“Back to normal” is your subjective report—not a sobriety determination. Do not use it to decide whether to drive or operate machinery.</p></div><label>End time<input type="datetime-local" min={toLocalInput(session.startedAt)} value={end} onChange={(e) => setEnd(e.target.value)} /></label><div className="button-stack"><button className="primary full" onClick={finish}>End now</button><button className="secondary full" onClick={onClose}>Keep tracking</button></div></Modal>
}

function useSessionData() {
  const { id='' }=useParams(); const session=useLiveQuery(()=>db.sessions.get(id),[id]); const events=useLiveQuery(()=>db.events.where('sessionId').equals(id).toArray(),[id])??[]; const effects=useLiveQuery(()=>db.effects.toArray(),[])??[]; return {id,session,events,effects}
}

function Summary() {
  const {id:sessionId,session,events,effects}=useSessionData(); const reflection=useLiveQuery(()=>db.reflections.get(sessionId),[sessionId]); const navigate=useNavigate(); const now=useTick(); const [share,setShare]=useState(false); const [adding,setAdding]=useState(false); const [confirmResume,setConfirmResume]=useState(false); const[reflectionOpen,setReflectionOpen]=useState(false);const[confirmReflectionDelete,setConfirmReflectionDelete]=useState(false)
  if (session===undefined) return <Shell><div className="loading">Loading session…</div></Shell>; if(!session) return <Navigate to="/history" replace />
  const completed=isSessionComplete(session,events); const summary=summarizeSession(session,events,now); const activeIds=latestEffects(events); const activeEffects=activeIds.map((effectId)=>effects.find((effect)=>effect.id===effectId)).filter(Boolean) as EffectDefinition[]
  const metrics=[['Total duration',formatDuration(summary.totalDurationMs)],['First reported effect',formatDuration(summary.timeToFirstEffectMs)],['First high',formatDuration(summary.timeToFirstHighMs)],['First peak',formatDuration(summary.timeToFirstPeakMs)],['Super high total',formatDuration(summary.superHighMs)],['Too high total',formatDuration(summary.tooHighMs)],['Separate peaks',String(summary.peakCount)],['Cannabis re-doses',String(summary.cannabisRedoseCount)]]
  return <Shell><main className="summary-page"><Link to={completed?'/history':`/session/${session.id}/live`} className="back-link"><ArrowLeft /> {completed?'History':'Live timeline'}</Link><section className="summary-hero"><div><p className="eyebrow">{completed?'Session details':'Active timeline'} · {format(parseISO(session.startedAt),'d MMM yyyy')}</p><h1>{session.productName||session.initialMethod}</h1><p>{session.initialMethod}{session.initialAmount?` · ${session.initialAmount}`:''}</p></div>{session.rating&&completed&&<div className="rating-large"><strong>{session.rating}</strong><span>/10</span></div>}</section><TimelineChart session={session} events={events} now={now} />
    <section className="metrics-grid">{metrics.map(([label,value])=><article key={label}><span>{label}</span><strong>{value}</strong></article>)}</section>
    <section className="summary-section"><div className="section-head"><h2>{completed?'Effects at the end':'Current effects'}</h2></div>{activeEffects.length?<div className="effect-summary">{activeEffects.map((effect)=><span className={`sentiment-${effect.sentiment.toLowerCase()}`} key={effect.id}>{effect.label}<small>{effect.sentiment.toLowerCase()}</small></span>)}</div>:<p className="muted">No effects recorded.</p>}</section>
    {completed&&<section className="summary-section reflection-summary"><div className="reflection-summary-head"><div><p className="eyebrow">Separate from your session timeline</p><h2>Next-day reflection</h2><p>A small optional note about the day after. It is not a score or session recap.</p></div><Sun/></div>{reflection?<><dl><div><dt>Sleep</dt><dd>{reflectionLabel(reflection.sleep)}</dd></div><div><dt>Mood</dt><dd>{reflectionLabel(reflection.mood)}</dd></div></dl>{reflection.note&&<blockquote>{reflection.note}</blockquote>}<div className="inline-actions"><button className="secondary" type="button" onClick={()=>setReflectionOpen(true)}><Pencil/> Edit reflection</button>{confirmReflectionDelete?<><span>Delete this reflection?</span><button className="danger" type="button" onClick={async()=>{await db.reflections.delete(session.id);setConfirmReflectionDelete(false)}}>Confirm delete</button></>:<button className="danger-quiet" type="button" onClick={()=>setConfirmReflectionDelete(true)}><Trash2/> Delete</button>}</div></>:<div className="reflection-empty"><ZananaMascot pose="settling"/><div><strong>Nothing added yet.</strong><span>You can add a reflection now—even if the Home prompt was skipped.</span></div><button className="secondary" type="button" onClick={()=>setReflectionOpen(true)}>Add reflection</button></div>}</section>}
    <section className="summary-section"><div className="section-head"><h2>Full timeline</h2><div className="inline-actions"><button className="text-button" onClick={()=>setAdding(true)}><Plus/> Add missed event</button><Link to={`/session/${session.id}/edit`}><Pencil/> Edit</Link></div></div><div className="event-list">{[...events].sort(byTime).map((event)=><EventLine key={event.id} event={event} effects={effects} start={session.startedAt}/>)}</div></section>
    <div className="summary-actions"><button className="secondary" onClick={()=>setShare(true)}><Share2/> Share card</button><Link className="secondary" to={`/session/${session.id}/edit`}><Pencil/> Edit timeline</Link>{completed?<button className="secondary" onClick={()=>setConfirmResume(true)}><RotateCcw/> Resume tracking</button>:<Link className="primary" to={`/session/${session.id}/live`}><Activity/> Continue tracking</Link>}</div>{share&&<ShareModal session={session} events={events} effects={activeEffects} onClose={()=>setShare(false)}/>} {adding&&<AddMissed session={session} events={events} effects={effects} onClose={()=>setAdding(false)}/>} {reflectionOpen&&<ReflectionModal session={session} reflection={reflection} onClose={()=>setReflectionOpen(false)}/>} {confirmResume&&<Modal title="Resume this session?" onClose={()=>setConfirmResume(false)}><p className="modal-intro">This removes the recorded “Back to normal” ending and returns to the live timeline. Existing events stay in place.</p><div className="button-stack"><button className="primary full" onClick={async()=>{await reopenSession(session.id);navigate(`/session/${session.id}/live`)}}>Resume tracking</button><button className="secondary full" onClick={()=>setConfirmResume(false)}>Keep session ended</button></div></Modal>}</main></Shell>
}

function ShareModal({session,events,effects,onClose}:{session:Session;events:TimelineEvent[];effects:EffectDefinition[];onClose:()=>void}) {
  const [includeProduct,setIncludeProduct]=useState(false); const canvas=useRef<HTMLCanvasElement>(null); const summary=summarizeSession(session,events)
  useEffect(()=>{ const c=canvas.current;if(!c)return;const ctx=c.getContext('2d');if(!ctx)return;ctx.fillStyle='#141814';ctx.fillRect(0,0,1080,1350);ctx.fillStyle='#f9f1df';ctx.font='700 66px system-ui';ctx.fillText('ZANANA',80,110);ctx.fillStyle='#e2cfa9';ctx.font='32px system-ui';ctx.fillText('A self-reported session curve',80,160);ctx.fillStyle='#6f9a73';ctx.font='700 96px system-ui';ctx.fillText(includeProduct&&session.productName?session.productName:session.initialMethod,80,300);ctx.fillStyle='#f9f1df';ctx.font='44px system-ui';ctx.fillText(`${formatDuration(Math.round(summary.totalDurationMs/600000)*600000)} total`,80,410);ctx.fillText(`${formatDuration(Math.round(summary.superHighMs/600000)*600000)} super high`,80,480);ctx.fillText(`${summary.peakCount} ${summary.peakCount===1?'peak':'peaks'}`,80,550);ctx.strokeStyle='#548f6f';ctx.lineWidth=16;ctx.beginPath();summary.intervals.forEach((item,index)=>{const x=80+((item.start-Date.parse(session.startedAt))/Math.max(summary.totalDurationMs,1))*920;const y=920-stateLevel(item.state)*90;if(index===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);const x2=80+((item.end-Date.parse(session.startedAt))/Math.max(summary.totalDurationMs,1))*920;ctx.lineTo(x2,y)});ctx.stroke();ctx.fillStyle='#e2cfa9';ctx.font='30px system-ui';ctx.fillText(effects.slice(0,4).map(e=>e.label).join('  ·  ')||'No effects shared',80,1100);if(session.rating){ctx.fillStyle='#e2cfa9';ctx.font='700 54px system-ui';ctx.fillText(`${session.rating}/10`,80,1200)}},[includeProduct,session,summary.totalDurationMs,summary.superHighMs,summary.peakCount,summary.intervals,effects])
  const share=async()=>{const c=canvas.current;if(!c)return;c.toBlob(async(blob)=>{if(!blob)return;const file=new File([blob],'zanana-card.png',{type:'image/png'});if(navigator.canShare?.({files:[file]}))await navigator.share({files:[file],title:'Zanana'});else download(file.name,blob,'image/png')})}
  return <Modal title="Anonymous share card" onClose={onClose}><p className="modal-intro">Exact date, clock times, notes, and internal IDs are always hidden.</p><canvas ref={canvas} className="share-canvas" width="1080" height="1350"/><label className="toggle-row"><input type="checkbox" checked={includeProduct} onChange={e=>setIncludeProduct(e.target.checked)}/><span>Include product name</span></label><button className="primary full" onClick={share}><Share2/> Share or download image</button></Modal>
}

function EditSession() {
  const {session,events,effects}=useSessionData(); const navigate=useNavigate(); const [adding,setAdding]=useState(false)
  if(session===undefined)return <Shell><div className="loading">Loading editor…</div></Shell>;if(!session)return <Navigate to="/history" replace/>
  const updateBoundary=async(key:'startedAt'|'endedAt',value:string)=>{const iso=fromLocalInput(value);const start=key==='startedAt'?Date.parse(iso):Date.parse(session.startedAt);const end=key==='endedAt'?Date.parse(iso):Date.parse(session.endedAt??iso);if(end<start){alert('End time cannot be before start time.');return}await db.sessions.update(session.id,{[key]:iso,updatedAt:nowIso()})}
  return <Shell><main className="narrow-page"><button className="back-link" onClick={()=>navigate(-1)}><ArrowLeft/> Back to session</button><p className="eyebrow">Timeline editor</p><h1>Edit session</h1><div className="boundary-grid"><label>Session start<input type="datetime-local" defaultValue={toLocalInput(session.startedAt)} onBlur={e=>updateBoundary('startedAt',e.target.value)}/></label><label>Session end<input type="datetime-local" defaultValue={session.endedAt?toLocalInput(session.endedAt):''} onBlur={e=>e.target.value&&updateBoundary('endedAt',e.target.value)}/></label></div><button className="primary" onClick={()=>setAdding(true)}><Plus/> Add missed event</button><div className="edit-list">{[...events].sort(byTime).map(event=><EditableEvent key={event.id} event={event} session={session} effects={effects}/>)}</div>{adding&&<AddMissed session={session} events={events} effects={effects} onClose={()=>setAdding(false)}/>}</main></Shell>
}

function EditableEvent({event,session,effects}:{event:TimelineEvent;session:Session;effects:EffectDefinition[]}) {
  const [editing,setEditing]=useState(false); const [confirm,setConfirm]=useState(false); const [time,setTime]=useState(toLocalInput(event.occurredAt)); const [value,setValue]=useState(event.state??event.category??event.note??''); const [product,setProduct]=useState(event.productName??''); const [amount,setAmount]=useState(event.amount??''); const [note,setNote]=useState(event.note??''); const [activeEffects,setActiveEffects]=useState(event.activeEffectIds??[])
  const save=async()=>{const occurredAt=fromLocalInput(time);const end=Date.parse(session.endedAt??nowIso());if(Date.parse(occurredAt)<Date.parse(session.startedAt)||Date.parse(occurredAt)>end){alert('Event time must stay within the session. Adjust the session boundary first.');return}const update:Partial<TimelineEvent>={occurredAt,updatedAt:nowIso(),productName:product||undefined,amount:amount||undefined,note:note||undefined};if(event.kind==='STATE_CHANGE')update.state=value as SessionState;else if(event.kind==='NOTE')update.note=value;else if(event.kind==='EFFECTS_UPDATE')update.activeEffectIds=activeEffects;else update.category=value;await db.events.update(event.id,update);setEditing(false)}
  return <article className="edit-event"><div className="edit-event-head"><EventLine event={event} effects={effects} start={session.startedAt}/><button className="icon-button" aria-label={`Edit event at ${format(parseISO(event.occurredAt),'HH:mm')}`} onClick={()=>setEditing(!editing)}><Pencil/></button></div>{editing&&<div className="edit-panel"><label>Time<input type="datetime-local" value={time} onChange={e=>setTime(e.target.value)}/></label>{event.kind==='STATE_CHANGE'?<label>State<select value={value} onChange={e=>setValue(e.target.value)}>{STATE_ORDER.map(state=><option key={state} value={state}>{STATE_META[state].label}</option>)}</select></label>:event.kind==='EFFECTS_UPDATE'?<fieldset><legend>Active effects</legend><div className="effect-grid">{effects.map(effect=><button type="button" aria-pressed={activeEffects.includes(effect.id)} key={effect.id} onClick={()=>setActiveEffects(items=>items.includes(effect.id)?items.filter(id=>id!==effect.id):[...items,effect.id])}>{effect.label}{activeEffects.includes(effect.id)&&<Check/>}</button>)}</div></fieldset>:<label>{event.kind==='NOTE'?'Note':'Type or category'}<input value={value} onChange={e=>setValue(e.target.value)}/></label>}{(event.kind==='CONSUME'||event.kind==='CONTEXT')&&<><label>Product or name<input value={product} onChange={e=>setProduct(e.target.value)}/></label><label>Amount<input value={amount} onChange={e=>setAmount(e.target.value)}/></label><label>Note<textarea value={note} onChange={e=>setNote(e.target.value)}/></label></>}<div className="row-actions"><button className="primary" onClick={save}>Save changes</button>{confirm?<><span>Delete this event?</span><button className="danger" onClick={()=>db.transaction('rw',db.events,db.attachments,async()=>{await db.events.delete(event.id);await db.attachments.delete(event.id)})}>Confirm delete</button></>:<button className="danger-quiet" onClick={()=>setConfirm(true)}><Trash2/> Delete</button>}</div></div>}</article>
}

function AddMissed({session,events,effects,onClose}:{session:Session;events:TimelineEvent[];effects:EffectDefinition[];onClose:()=>void}) {
  const latestAllowed = isSessionComplete(session, events) ? session.endedAt as string : nowIso()
  const initialTime = new Date(Math.min(Date.parse(latestAllowed), Math.max(Date.parse(session.startedAt), Date.now())))
  const [kind,setKind]=useState<EventKind>('STATE_CHANGE')
  const [state,setState]=useState<SessionState>('FEELING_IT')
  const [value,setValue]=useState('')
  const [activeEffects,setActiveEffects]=useState<string[]>([])
  const [time,setTime]=useState(toLocalInput(initialTime.toISOString()))
  const [error,setError]=useState('')
  const save = async () => {
    const occurredAt=fromLocalInput(time)
    const timestamp=Date.parse(occurredAt)
    if(timestamp<Date.parse(session.startedAt)||timestamp>Date.parse(latestAllowed)){setError('Choose a time inside this session.');return}
    if((kind==='CONSUME'||kind==='CONTEXT'||kind==='NOTE')&&!value.trim()){setError('Add a name or note for this event.');return}
    if(kind==='EFFECTS_UPDATE'&&!activeEffects.length){setError('Select at least one effect.');return}
    await addEvent(session.id,{kind,state:kind==='STATE_CHANGE'?state:undefined,category:kind==='CONTEXT'||kind==='CONSUME'?value.trim():undefined,note:kind==='NOTE'?value.trim():undefined,activeEffectIds:kind==='EFFECTS_UPDATE'?activeEffects:undefined,occurredAt})
    onClose()
  }
  return <Modal title="Add missed event" onClose={onClose} footer={<button className="primary full" onClick={save}>Add event</button>}><p className="modal-intro">Choose what happened and set its earlier time. The whole timeline recalculates after saving.</p><div className="sheet-form"><label>Type<select value={kind} onChange={e=>{setKind(e.target.value as EventKind);setError('')}}><option value="STATE_CHANGE">State change</option><option value="CONSUME">Consumption</option><option value="CONTEXT">Context</option><option value="EFFECTS_UPDATE">Effects update</option><option value="NOTE">Note</option></select></label>{kind==='STATE_CHANGE'?<label>State<select value={state} onChange={e=>setState(e.target.value as SessionState)}>{STATE_ORDER.map(item=><option value={item} key={item}>{STATE_META[item].label}</option>)}</select></label>:kind==='EFFECTS_UPDATE'?<fieldset><legend>Active effects</legend><div className="effect-grid">{effects.map(effect=><button type="button" aria-pressed={activeEffects.includes(effect.id)} key={effect.id} onClick={()=>setActiveEffects(items=>items.includes(effect.id)?items.filter(id=>id!==effect.id):[...items,effect.id])}>{effect.label}{activeEffects.includes(effect.id)&&<Check/>}</button>)}</div></fieldset>:<label>{kind==='NOTE'?'Note':'Name or category'}{kind==='NOTE'?<textarea value={value} onChange={e=>setValue(e.target.value)}/>:<input value={value} onChange={e=>setValue(e.target.value)} placeholder={kind==='CONSUME'?'e.g. More of the same':'e.g. Food'}/>}</label>}<label>Time<input aria-label="Missed event time" type="datetime-local" min={toLocalInput(session.startedAt)} max={toLocalInput(latestAllowed)} value={time} onChange={e=>{setTime(e.target.value);setError('')}}/></label>{error&&<p className="error-text" role="alert">{error}</p>}</div></Modal>
}

function HistoryPage() {
  const sessions=useLiveQuery(()=>db.sessions.orderBy('startedAt').reverse().toArray(),[])??[]; const allEvents=useLiveQuery(()=>db.events.toArray(),[])??[]; const effects=useLiveQuery(()=>db.effects.toArray(),[])??[]; const [query,setQuery]=useState('');const[method,setMethod]=useState('');const[minRating,setMinRating]=useState(0);const[effect,setEffect]=useState('');const[from,setFrom]=useState('');const[to,setTo]=useState('');const[bookmarksOnly,setBookmarksOnly]=useState(false);const[view,setView]=useState<'list'|'calendar'>('list')
  const bookmarkCount=allEvents.filter((event)=>event.isBookmarked).length
  const shown=sessions.filter(session=>{const sessionEvents=allEvents.filter(event=>event.sessionId===session.id);const sessionEffects=sessionEvents.filter(event=>event.kind==='EFFECTS_UPDATE').flatMap(event=>event.activeEffectIds??[]);const day=session.startedAt.slice(0,10);return(session.productName||session.initialMethod).toLowerCase().includes(query.toLowerCase())&&(!method||session.initialMethod===method)&&(session.rating??0)>=minRating&&(!effect||sessionEffects.includes(effect))&&(!from||day>=from)&&(!to||day<=to)&&(!bookmarksOnly||sessionEvents.some(event=>event.isBookmarked))})
  return <Shell><main><section className="page-heading"><p className="eyebrow">Your journal</p><h1>History</h1><p>Every curve stays editable and on this device.</p></section><div className="history-keepsakes"><div><span><Star/></span><div><strong>Saved moments</strong><small>{bookmarkCount?`${bookmarkCount} ${bookmarkCount===1?'bookmark':'bookmarks'} across your journal`:'Star a timeline moment to find it here.'}</small></div></div><button type="button" aria-pressed={bookmarksOnly} onClick={()=>setBookmarksOnly(value=>!value)}>{bookmarksOnly?'Show all sessions':'Show bookmarks only'}</button></div><div className="toolbar"><div className="search-field"><Search/><input aria-label="Search history" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search product or method"/></div><select aria-label="Filter by method" value={method} onChange={e=>setMethod(e.target.value)}><option value="">All methods</option>{METHODS.map(item=><option key={item}>{item}</option>)}</select><select aria-label="Filter by effect" value={effect} onChange={e=>setEffect(e.target.value)}><option value="">All effects</option>{effects.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select><select aria-label="Filter by rating" value={minRating} onChange={e=>setMinRating(Number(e.target.value))}><option value="0">Any rating</option><option value="7">Rated 7+</option><option value="9">Rated 9+</option></select><input aria-label="From date" type="date" value={from} onChange={e=>setFrom(e.target.value)}/><input aria-label="To date" type="date" value={to} onChange={e=>setTo(e.target.value)}/><div className="view-toggle"><button aria-pressed={view==='list'} onClick={()=>setView('list')}>List</button><button aria-pressed={view==='calendar'} onClick={()=>setView('calendar')}>Calendar</button></div></div>{shown.length?<div className={view==='calendar'?'calendar-list':'session-stack history-stack'}>{shown.map(session=><SessionRow key={session.id} session={session}/>)}</div>:<div className="empty">{bookmarksOnly?<Star/>:<HistoryIcon/>}<h3>{bookmarksOnly?'No bookmarked sessions match.':'No sessions match.'}</h3><p>{bookmarksOnly?'Show all sessions or adjust the filters.':'Adjust your search or start a new timeline.'}</p>{!bookmarksOnly&&<Link className="primary" to="/session/new">Start session</Link>}</div>}</main></Shell>
}

function Insights() {
  const sessions=useLiveQuery(()=>db.sessions.toArray(),[])??[]; const events=useLiveQuery(()=>db.events.toArray(),[])??[]; const effects=useLiveQuery(()=>db.effects.toArray(),[])??[]; const completed=sessions.filter(item=>item.endedAt)
  const contextPatterns=buildContextPatterns(sessions,events,effects)
  const summaries=completed.map(session=>({session,summary:summarizeSession(session,events.filter(event=>event.sessionId===session.id))})); const avg=(values:number[])=>values.length?values.reduce((a,b)=>a+b,0)/values.length:null
  const groups=new Map<string,typeof summaries>();summaries.forEach(item=>{const key=item.session.productName||item.session.initialMethod;groups.set(key,[...(groups.get(key)||[]),item])})
  const effectCounts=new Map<string,number>();events.filter(e=>e.kind==='EFFECTS_UPDATE').forEach(e=>e.activeEffectIds?.forEach(id=>effectCounts.set(id,(effectCounts.get(id)||0)+1)));const common=[...effectCounts].sort((a,b)=>b[1]-a[1]).slice(0,8)
  const typical=completed.length?format(parseISO(completed.sort((a,b)=>a.startedAt.localeCompare(b.startedAt))[Math.floor(completed.length/2)].startedAt),'EEEE · h a'):'Not recorded'
  return <Shell><main><section className="page-heading"><p className="eyebrow">Your data, not advice</p><h1>Personal insights</h1><p>Patterns from your own self-reported journal. Context appearing together does not prove causation.</p></section>{completed.length?<><section className="insight-strip"><article><span>Completed sessions</span><strong>{completed.length}</strong><small>{(completed.length/Math.max(1,new Set(completed.map(s=>format(parseISO(s.startedAt),'yyyy-ww'))).size)).toFixed(1)} per active week</small></article><article><span>Typical start</span><strong>{typical.split(' · ')[0]}</strong><small>{typical.split(' · ')[1]}</small></article><article><span>Average duration</span><strong>{formatDuration(avg(summaries.map(i=>i.summary.totalDurationMs)),true)}</strong><small>self-reported end</small></article><article><span>Average super high</span><strong>{formatDuration(avg(summaries.map(i=>i.summary.superHighMs)),true)}</strong><small>combined intervals</small></article></section><section className="summary-section"><div className="section-head"><div><p className="eyebrow">Repeated observations</p><h2>Common effects</h2></div></div><div className="effect-summary">{common.map(([effectId,count])=>{const effect=effects.find(e=>e.id===effectId);return effect?<span className={`sentiment-${effect.sentiment.toLowerCase()}`} key={effectId}>{effect.label}<small>{count} updates · {effect.sentiment.toLowerCase()}</small></span>:null})}</div></section>{contextPatterns.length>0&&<section className="summary-section context-patterns" aria-labelledby="context-patterns-title"><div className="section-head"><div><p className="eyebrow">Appeared together</p><h2 id="context-patterns-title">Context patterns</h2><p>Shown only after a context appears in at least 3 completed sessions and an effect appears later in at least 2 of them.</p></div></div><div className="context-pattern-grid">{contextPatterns.map(pattern=><article key={`${pattern.context}-${pattern.effectId}`}><div className="pattern-context"><span aria-hidden="true">{pattern.context==='Mango'?'🥭':pattern.context.includes('Chocolate')?'🍫':pattern.context.includes('Coffee')?'☕':'✦'}</span><div><strong>{pattern.context}</strong><small>{pattern.contextSessionCount} completed sessions</small></div></div><div className="pattern-link" aria-hidden="true"><i/><i/><i/></div><div className="pattern-effect"><Sparkles/><div><strong>{pattern.effectLabel}</strong><small>{pattern.togetherSessionCount} of those sessions</small></div></div><p><b>{pattern.context}</b> and <b>{pattern.effectLabel}</b> appeared together in {pattern.togetherSessionCount} sessions. This is a count from your entries—not evidence of cause or a stronger effect.</p></article>)}</div></section>}<section className="summary-section"><div className="section-head"><div><p className="eyebrow">Highest rated in your journal</p><h2>Products & methods</h2></div></div><div className="product-grid">{[...groups].sort(([,a],[,b])=>(avg(b.map(i=>i.session.rating||0))||0)-(avg(a.map(i=>i.session.rating||0))||0)).map(([name,items])=>{const ratings=items.map(i=>i.session.rating).filter(Boolean) as number[];const useAgain=items.filter(i=>i.session.wouldUseAgain==='YES').length/items.length*100;const unwanted=items.flatMap(i=>events.filter(e=>e.sessionId===i.session.id&&e.kind==='EFFECTS_UPDATE').flatMap(e=>e.activeEffectIds||[])).filter(id=>effects.find(e=>e.id===id)?.sentiment==='UNWANTED').length;return <article className="product-card" key={name}><div><p className="eyebrow">{items.length<3?'Low confidence':items.length<6?'Medium confidence':'High confidence'}</p><h3>{name}</h3><span>{items.length} {items.length===1?'session':'sessions'}</span></div><dl><div><dt>Average rating</dt><dd>{ratings.length?(avg(ratings)||0).toFixed(1):'Not recorded'}</dd></div><div><dt>Average duration</dt><dd>{formatDuration(avg(items.map(i=>i.summary.totalDurationMs)),true)}</dd></div><div><dt>Super high</dt><dd>{formatDuration(avg(items.map(i=>i.summary.superHighMs)),true)}</dd></div><div><dt>Would use again</dt><dd>{Math.round(useAgain)}%</dd></div><div><dt>Unwanted observations</dt><dd>{unwanted}</dd></div></dl>{items.length<3&&<p className="confidence-note">Fewer than 3 completed sessions. Treat this as an early observation.</p>}</article>})}</div></section><aside className="safety-note"><Info/><p>Nicotine, food, alcohol, medication, and other context may have appeared in the same sessions. This journal does not claim they caused an outcome.</p></aside></>:<div className="empty"><BarChart3/><h3>Insights grow from completed sessions.</h3><p>Finish a timeline or load clearly labeled demo data in Settings.</p></div>}</main></Shell>
}

function InsightsSupplement() {
  const sessions=useLiveQuery(()=>db.sessions.toArray(),[])??[]; const events=useLiveQuery(()=>db.events.toArray(),[])??[]; const completed=sessions.filter(session=>session.endedAt)
  if(!completed.length)return null
  const summaries=completed.map(session=>summarizeSession(session,events.filter(event=>event.sessionId===session.id)))
  const onsetValues=summaries.map(summary=>summary.timeToFirstEffectMs).filter((value):value is number=>value!==null)
  const average=(values:number[])=>values.length?values.reduce((sum,value)=>sum+value,0)/values.length:null
  const activeWeeks=new Set(completed.map(session=>format(parseISO(session.startedAt),'yyyy-ww'))).size
  const activeMonths=new Set(completed.map(session=>format(parseISO(session.startedAt),'yyyy-MM'))).size
  const percent=(count:number)=>`${Math.round(count/completed.length*100)}%`
  return <section className="supplemental-stats" aria-labelledby="journal-frequency"><div className="section-head"><div><p className="eyebrow">Journal frequencies</p><h2 id="journal-frequency">Timing & context</h2></div></div><div className="insight-strip"><article><span>Sessions per active week</span><strong>{(completed.length/Math.max(1,activeWeeks)).toFixed(1)}</strong><small>{completed.length} completed total</small></article><article><span>Sessions per active month</span><strong>{(completed.length/Math.max(1,activeMonths)).toFixed(1)}</strong><small>journal months only</small></article><article><span>Average first effect</span><strong>{formatDuration(average(onsetValues),true)}</strong><small>when reported</small></article><article><span>Sessions with a re-dose</span><strong>{percent(summaries.filter(summary=>summary.cannabisRedoseCount>0).length)}</strong><small>same-timeline cannabis markers</small></article><article><span>Sessions with nicotine</span><strong>{percent(summaries.filter(summary=>summary.nicotineEvents.length>0).length)}</strong><small>appeared in the same session</small></article></div></section>
}

const POP_SPOTS = [
  [17, 19], [50, 16], [82, 21],
  [20, 49], [50, 46], [80, 50],
  [18, 78], [50, 75], [82, 79],
] as const

type RoomCategory = 'outfit' | 'garden' | 'furniture'
type RoomSave = { sunshine: number; unlocked: string[]; outfit: string; garden: string; furniture: string }
type RoomItem = { id: string; category: RoomCategory; name: string; description: string; cost: number; preview: string }

const ROOM_KEY = 'zanana-room-v1'
const ROOM_DEFAULTS: RoomSave = { sunshine: 0, unlocked: ['outfit-classic', 'garden-morning', 'furniture-cushion'], outfit: 'outfit-classic', garden: 'garden-morning', furniture: 'furniture-cushion' }
const ROOM_ITEMS: RoomItem[] = [
  { id:'outfit-classic', category:'outfit', name:'Watercolor classic', description:'Zanana, exactly as painted.', cost:0, preview:'🍍' },
  { id:'outfit-crown', category:'outfit', name:'Garden crown', description:'A tiny crown for big garden energy.', cost:8, preview:'👑' },
  { id:'outfit-shades', category:'outfit', name:'Star shades', description:'Sunny shades with no score attached.', cost:14, preview:'🕶️' },
  { id:'outfit-bow', category:'outfit', name:'Berry bow', description:'A soft pink finishing touch.', cost:20, preview:'🎀' },
  { id:'garden-morning', category:'garden', name:'Morning patch', description:'Warm sun and soft green hills.', cost:0, preview:'🌤️' },
  { id:'garden-dusk', category:'garden', name:'Firefly dusk', description:'A violet sky with quiet lights.', cost:10, preview:'🌙' },
  { id:'garden-bloom', category:'garden', name:'Big bloom garden', description:'Wildflowers all around the room.', cost:18, preview:'🌼' },
  { id:'furniture-cushion', category:'furniture', name:'Leaf cushion', description:'A soft starter seat.', cost:0, preview:'🛋️' },
  { id:'furniture-lamp', category:'furniture', name:'Pineapple lamp', description:'A small pool of golden light.', cost:8, preview:'💡' },
  { id:'furniture-player', category:'furniture', name:'Tiny record player', description:'Room décor only—no sound required.', cost:16, preview:'🎵' },
]

const readRoom = (): RoomSave => {
  try {
    const saved = JSON.parse(localStorage.getItem(ROOM_KEY) || 'null') as Partial<RoomSave> | null
    if (!saved) return ROOM_DEFAULTS
    return { ...ROOM_DEFAULTS, ...saved, sunshine: Math.max(0, Number(saved.sunshine) || 0), unlocked: [...new Set([...ROOM_DEFAULTS.unlocked, ...(Array.isArray(saved.unlocked) ? saved.unlocked : [])])] }
  } catch { return ROOM_DEFAULTS }
}
const writeRoom = (room: RoomSave) => localStorage.setItem(ROOM_KEY, JSON.stringify(room))

function PlaySwitcher({ current }: { current: 'game' | 'memory' | 'room' }) {
  return <nav className="play-switcher" aria-label="Zanana play spaces"><Link className={current === 'game' ? 'active' : ''} aria-current={current === 'game' ? 'page' : undefined} to="/game"><Gamepad2 /> Pop</Link><Link className={current === 'memory' ? 'active' : ''} aria-current={current === 'memory' ? 'page' : undefined} to="/game/memory"><Sparkles /> Memory</Link><Link className={current === 'room' ? 'active' : ''} aria-current={current === 'room' ? 'page' : undefined} to="/game/room"><HomeIcon /> Zanana’s Room</Link></nav>
}

function RoomScene({ room }: { room: RoomSave }) {
  const outfit = ROOM_ITEMS.find((item) => item.id === room.outfit)?.name || 'Watercolor classic'
  const garden = ROOM_ITEMS.find((item) => item.id === room.garden)?.name || 'Morning patch'
  const furniture = ROOM_ITEMS.find((item) => item.id === room.furniture)?.name || 'Leaf cushion'
  return <div className={`room-scene ${room.garden}`} role="img" aria-label={`Zanana wearing ${outfit}, in ${garden}, with ${furniture}`}>
    <div className="room-window" aria-hidden="true"><i/><i/><i/></div><div className="room-vine" aria-hidden="true">❧</div>
    <div className={`room-furniture ${room.furniture}`} aria-hidden="true"><span>{room.furniture === 'furniture-lamp' ? '💡' : room.furniture === 'furniture-player' ? '🎵' : '🍃'}</span></div>
    <div className="room-zanana"><ZananaMascot pose="uplifted" />{room.outfit !== 'outfit-classic' && <span className={`room-outfit ${room.outfit}`} aria-hidden="true">{room.outfit === 'outfit-crown' ? '👑' : room.outfit === 'outfit-shades' ? '🕶️' : '🎀'}</span>}<span className="room-speech">This feels like home.</span></div>
    <div className="room-rug" aria-hidden="true" />
  </div>
}

function ZananaRoom() {
  const [room,setRoom] = useState<RoomSave>(() => readRoom())
  const [category,setCategory] = useState<RoomCategory>('outfit')
  const [announcement,setAnnouncement] = useState('')
  const save = (next: RoomSave) => { setRoom(next); writeRoom(next) }
  const choose = (item: RoomItem) => {
    const isUnlocked = room.unlocked.includes(item.id)
    if (!isUnlocked && room.sunshine < item.cost) return
    const next = { ...room, [item.category]: item.id, sunshine: isUnlocked ? room.sunshine : room.sunshine - item.cost, unlocked: isUnlocked ? room.unlocked : [...room.unlocked, item.id] }
    save(next)
    setAnnouncement(isUnlocked ? `${item.name} selected` : `${item.name} unlocked and selected`)
  }
  const labels: Record<RoomCategory,string> = { outfit:'Dress Zanana', garden:'Change the garden', furniture:'Add furniture' }
  return <Shell><main className="room-page"><PlaySwitcher current="room"/><section className="room-heading"><div><p className="eyebrow">A little place of their own</p><h1>Zanana’s Room</h1><p>Dress Zanana and make the room yours. Sunshine comes only from playing games—never from logging or consuming.</p></div><div className="sunshine-balance" aria-label={`${room.sunshine} sunshine available`}><Sun/><strong>{room.sunshine}</strong><span>sunshine</span></div></section><RoomScene room={room}/><section className="room-drawer" aria-labelledby="room-drawer-title"><div className="room-drawer-head"><div><p className="eyebrow">Room drawer</p><h2 id="room-drawer-title">{labels[category]}</h2></div><Link to="/game" className="secondary"><Gamepad2/> Earn sunshine</Link></div><div className="room-categories" role="tablist" aria-label="Room customization categories">{(['outfit','garden','furniture'] as RoomCategory[]).map((item)=><button key={item} role="tab" aria-selected={category===item} onClick={()=>setCategory(item)}>{item === 'outfit' ? 'Outfits' : item === 'garden' ? 'Garden' : 'Furniture'}</button>)}</div><div className="room-item-grid">{ROOM_ITEMS.filter((item)=>item.category===category).map((item)=>{const unlocked=room.unlocked.includes(item.id);const selected=room[item.category]===item.id;const short= Math.max(0,item.cost-room.sunshine);return <button key={item.id} type="button" className={selected?'selected':''} aria-pressed={selected} disabled={!unlocked&&short>0} onClick={()=>choose(item)}><span className="room-item-preview" aria-hidden="true">{item.preview}</span><span className="room-item-copy"><strong>{item.name}</strong><small>{item.description}</small></span><span className="room-item-status">{selected?<><Check/>Using</>:unlocked?'Use':short>0?`Need ${short} more`:`Unlock · ${item.cost} ☀`}</span></button>})}</div><p className="room-earning-note"><Sparkles/> One bop earns one sunshine. Your session history, effects, and self-reported state never affect this room.</p></section><div className="sr-only" aria-live="polite">{announcement}</div></main></Shell>
}

function GamePage() {
  const [playing,setPlaying] = useState(false)
  const [finished,setFinished] = useState(false)
  const [score,setScore] = useState(0)
  const [seconds,setSeconds] = useState(20)
  const [spot,setSpot] = useState(4)
  const [sunshine,setSunshine] = useState(() => readRoom().sunshine)
  const reducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const speedLevel=score>=15?4:score>=10?3:score>=5?2:1
  const moveDelay=[0,850,620,460,320][speedLevel]
  const startRound=()=>{setScore(0);setSeconds(20);setSpot(4);setFinished(false);setPlaying(true)}
  useEffect(()=>{if(!playing)return;const timer=window.setInterval(()=>setSeconds(value=>{if(value<=1){setPlaying(false);setFinished(true);return 0}return value-1}),1000);return()=>clearInterval(timer)},[playing])
  useEffect(()=>{if(!playing||reducedMotion)return;const mover=window.setInterval(()=>setSpot(value=>(value+4)%POP_SPOTS.length),moveDelay);return()=>clearInterval(mover)},[playing,reducedMotion,moveDelay])
  const bop=()=>{if(!playing)return;setScore(value=>value+1);setSpot(value=>(value+3)%POP_SPOTS.length);setSunshine(value=>{const next=value+1;writeRoom({...readRoom(),sunshine:next});return next})}
  const [left,top]=POP_SPOTS[spot]
  return <Shell><main className="game-page"><PlaySwitcher current="game"/><section className="game-heading"><div><p className="eyebrow">Zanana’s tiny arcade</p><h1>Zanana Pop!</h1><p>Tap Zanana whenever they pop up. Each bop earns one sunshine for Zanana’s Room. They speed up at 5, 10, and 15 bops.</p></div><div><div className="game-scoreboard" aria-live="polite"><span><strong>{score}</strong><small>bops</small></span><span><strong>{seconds}</strong><small>seconds</small></span><span className={`speed-tier speed-${speedLevel}`}><strong>{speedLevel}</strong><small>speed</small></span></div><Link to="/game/room" className="game-room-balance"><Sun/><strong>{sunshine}</strong> sunshine <ChevronRight/></Link></div></section><section className={`pop-stage ${playing?'is-playing':''} speed-${speedLevel}`} data-speed={speedLevel} aria-label="Zanana Pop game"><div className="pop-stage-sun" aria-hidden="true"/><div className="pop-holes" aria-hidden="true">{POP_SPOTS.map(([holeLeft,holeTop],index)=><i key={index} style={{left:`${holeLeft}%`,top:`${holeTop}%`}}/>)}</div>{playing&&<button type="button" className="pop-zanana" style={{left:`${left}%`,top:`${top}%`}} aria-label="Bop Zanana" onClick={bop}><ZananaMascot pose={score%3===2?'uplifted':'neutral'}/><span>Bop!</span></button>} {!playing&&<div className="game-round-card"><ZananaMascot pose={finished?'uplifted':'neutral'}/><h2>{finished?'Round over!':'Ready to play?'}</h2><p>{finished?`You earned ${score} sunshine for Zanana’s Room.`:'Zanana pops around the orchard. Tap them as many times as you like before time runs out.'}</p><button className="primary" type="button" onClick={startRound}>{finished?<RotateCcw/>:<Gamepad2/>}{finished?'Play again':'Start round'}</button></div>}</section><p className="game-note">{reducedMotion?'Reduced motion is on, so Zanana moves only after each tap. Speed tiers still advance after 5, 10, and 15 bops.':'Each round lasts 20 seconds, with no penalties and no sound required. This game does not assess alertness or safety.'}</p></main></Shell>
}

type MemoryCard = { id: string; pair: string; name: string; symbol: string }
const MEMORY_FRUITS=[['mango','Mango','🥭'],['pineapple','Pineapple','🍍'],['strawberry','Strawberry','🍓'],['orange','Orange','🍊'],['watermelon','Watermelon','🍉'],['grape','Grapes','🍇']] as const
const makeMemoryDeck=()=>MEMORY_FRUITS.flatMap(([pair,name,symbol])=>[{id:`${pair}-a`,pair,name,symbol},{id:`${pair}-b`,pair,name,symbol}]).sort(()=>Math.random()-.5)

function MemoryMatch() {
  const [deck,setDeck]=useState<MemoryCard[]>(()=>makeMemoryDeck())
  const [open,setOpen]=useState<string[]>([])
  const [matched,setMatched]=useState<string[]>([])
  const [turns,setTurns]=useState(0)
  const [locked,setLocked]=useState(false)
  const [sunshine,setSunshine]=useState(()=>readRoom().sunshine)
  const [announcement,setAnnouncement]=useState('Choose any two cards to find a pair.')
  const reducedMotion=typeof window!=='undefined'&&window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const complete=matched.length===MEMORY_FRUITS.length
  const restart=()=>{setDeck(makeMemoryDeck());setOpen([]);setMatched([]);setTurns(0);setLocked(false);setAnnouncement('New cards mixed. Choose any two cards to find a pair.')}
  const choose=(card:MemoryCard)=>{
    if(locked||open.includes(card.id)||matched.includes(card.pair)||complete)return
    if(open.length===0){setOpen([card.id]);setAnnouncement(`${card.name} revealed. Choose one more card.`);return}
    const first=deck.find(item=>item.id===open[0]) as MemoryCard
    setTurns(value=>value+1)
    if(first.pair===card.pair){
      const nextMatched=[...matched,card.pair]
      setMatched(nextMatched);setOpen([])
      if(nextMatched.length===MEMORY_FRUITS.length){const reward=6;const nextSunshine=readRoom().sunshine+reward;writeRoom({...readRoom(),sunshine:nextSunshine});setSunshine(nextSunshine);setAnnouncement(`All pairs found. You earned ${reward} sunshine.`)}else setAnnouncement(`${card.name} matched. ${MEMORY_FRUITS.length-nextMatched.length} pairs remain.`)
      return
    }
    setOpen([...open,card.id]);setLocked(true);setAnnouncement(`${first.name} and ${card.name} do not match. The cards will close.`)
    window.setTimeout(()=>{setOpen([]);setLocked(false);setAnnouncement('Cards closed. Choose another pair.')},reducedMotion?100:700)
  }
  return <Shell><main className="memory-page"><PlaySwitcher current="memory"/><section className="memory-heading"><div><p className="eyebrow">A quiet game with Zanana</p><h1>Fruit Pairs</h1><p>Turn over two cards at a time. Find all six pairs whenever you’re ready—there is no timer, penalty, or sound.</p></div><div className="memory-stats"><span><strong>{matched.length}</strong><small>pairs</small></span><span><strong>{turns}</strong><small>turns</small></span><Link to="/game/room"><Sun/><strong>{sunshine}</strong><small>sunshine</small></Link></div></section><section className="memory-crate" aria-labelledby="memory-board-title"><div className="memory-crate-head"><div><p className="eyebrow">Zanana’s fruit crate</p><h2 id="memory-board-title">Match the fruit</h2></div><button className="secondary" type="button" onClick={restart}><RotateCcw/> Mix again</button></div><div className="memory-board">{deck.map((card,index)=>{const revealed=open.includes(card.id)||matched.includes(card.pair);const isMatched=matched.includes(card.pair);return <button type="button" key={card.id} data-pair={card.pair} className={`memory-card ${revealed?'is-revealed':''} ${isMatched?'is-matched':''}`} disabled={isMatched||locked} aria-label={isMatched?`${card.name}, matched`:revealed?`${card.name}, revealed`:`Hidden card ${index+1}`} aria-pressed={revealed} onClick={()=>choose(card)}><span className="memory-card-back" aria-hidden="true"><i/>?</span><span className="memory-card-face" aria-hidden="true"><b>{card.symbol}</b><small>{card.name}</small></span></button>})}</div><div className="memory-companion"><ZananaMascot pose={complete?'uplifted':'neutral'}/><div><strong>{complete?'Every pair found!':'Take your time.'}</strong><span>{complete?'Six sunshine were added to Zanana’s Room.':'The board waits for you. You can mix it again whenever you like.'}</span></div></div></section><p className="game-note">Sunshine comes from completing the game—not from sessions, effects, or consumption. {reducedMotion?'Reduced motion is on, so cards change without a flip animation.':''}</p><div className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</div></main></Shell>
}

function SettingsPage() {
  const sessions=useLiveQuery(()=>db.sessions.toArray(),[])??[];const events=useLiveQuery(()=>db.events.toArray(),[])??[];const effects=useLiveQuery(()=>db.effects.toArray(),[])??[];const attachments=useLiveQuery(()=>db.attachments.toArray(),[])??[];const reflections=useLiveQuery(()=>db.reflections.toArray(),[])??[];const[theme,setTheme]=useState(localStorage.getItem('ht-theme')||'light');const[haptics,setHaptics]=useState(localStorage.getItem('ht-haptics')!=='off');const[reflectionPrompts,setReflectionPrompts]=useState(localStorage.getItem('ht-reflection-prompts')!=='off');const[companionCheckIns,setCompanionCheckIns]=useState(readCheckInPreferences().enabled);const[importData,setImportData]=useState<ReturnType<typeof validateBackup>|null>(null);const[error,setError]=useState('');const[deleteStep,setDeleteStep]=useState(false);const[deleteText,setDeleteText]=useState('');const[status,setStatus]=useState('')
  const applyTheme=(value:string)=>{setTheme(value);localStorage.setItem('ht-theme',value);document.documentElement.dataset.theme=value}
  const exportJson=()=>download(`zanana-${format(new Date(),'yyyy-MM-dd')}.json`,JSON.stringify(makeBackup(sessions,events,effects,reflections),null,2),'application/json')
  const exportCsv=()=>{const sessionRows=[['id','startedAt','endedAt','method','product','rating','wouldUseAgain','nextDayReflectionDismissedAt'],...sessions.map(s=>[s.id,s.startedAt,s.endedAt,s.initialMethod,s.productName,s.rating,s.wouldUseAgain,s.nextDayReflectionDismissedAt])];const eventRows=[['id','sessionId','occurredAt','kind','state','category','product','amount','note','bookmarked','bookmarkLabel'],...events.map(e=>[e.id,e.sessionId,e.occurredAt,e.kind,e.state,e.category,e.productName,e.amount,e.note,e.isBookmarked,e.bookmarkLabel])];const reflectionRows=[['sessionId','sleep','mood','note','createdAt','updatedAt'],...reflections.map(r=>[r.sessionId,r.sleep,r.mood,r.note,r.createdAt,r.updatedAt])];download('zanana-sessions.csv',sessionRows.map(r=>r.map(csvCell).join(',')).join('\n'),'text/csv');download('zanana-events.csv',eventRows.map(r=>r.map(csvCell).join(',')).join('\n'),'text/csv');download('zanana-reflections.csv',reflectionRows.map(r=>r.map(csvCell).join(',')).join('\n'),'text/csv')}
  const pickImport=async(file?:File)=>{if(!file)return;try{setImportData(validateBackup(JSON.parse(await file.text())));setError('')}catch(e){setImportData(null);setError(e instanceof Error?e.message:'Could not read backup.') }}
  const mediaBytes=attachments.reduce((total,item)=>total+(item.photo?.size||0)+(item.audio?.size||0),0)
  return <Shell><main><section className="page-heading"><p className="eyebrow">Device controls</p><h1>Settings</h1><p>Privacy, appearance, and your local journal data.</p></section><div className="settings-grid"><section className="settings-card"><div className="settings-title"><Sun/><div><h2>Appearance</h2><p>Choose what feels clearest.</p></div></div><div className="segmented">{['dark','light','system'].map(value=><button className={theme===value?'selected':''} aria-pressed={theme===value} key={value} onClick={()=>applyTheme(value)}>{value[0].toUpperCase()+value.slice(1)}</button>)}</div><label className="toggle-row"><input type="checkbox" checked={haptics} onChange={e=>{setHaptics(e.target.checked);localStorage.setItem('ht-haptics',e.target.checked?'on':'off')}}/><span>Gentle haptics where supported</span></label></section><section className="settings-card reflection-setting"><div className="settings-title"><Moon/><div><h2>Next-day prompts</h2><p>Optionally show one gentle reflection card on Home.</p></div></div><label className="toggle-row"><input type="checkbox" checked={reflectionPrompts} onChange={e=>{setReflectionPrompts(e.target.checked);localStorage.setItem('ht-reflection-prompts',e.target.checked?'on':'off')}}/><span>Show automatic reflection prompts</span></label><p className="muted">Turning this off hides automatic prompts only. You can always add a reflection from Session Details.</p></section><section className="settings-card check-in-setting"><div className="settings-title"><HeartHandshake/><div><h2>Companion check-ins</h2><p>Occasional optional prompts from Zanana on an idle Home screen.</p></div></div><label className="toggle-row"><input type="checkbox" checked={companionCheckIns} onChange={e=>{const next={enabled:e.target.checked,nextAt:0};setCompanionCheckIns(e.target.checked);writeCheckInPreferences(next)}}/><span>Show companion check-ins</span></label><p className="muted">Check-ins never interrupt a live session. Not now waits until tomorrow; Snooze waits 2 hours.</p></section><section className="settings-card"><div className="settings-title"><FileDown/><div><h2>Export</h2><p>Journal records, reflections, stars, and labels. Local media stays on this device.</p></div></div><button className="secondary full" onClick={exportJson}><Download/> Export JSON backup</button><button className="secondary full" onClick={exportCsv}><Download/> Export sessions + events + reflections CSV</button></section><section className="settings-card"><div className="settings-title"><ImageIcon/><div><h2>Local bookmark media</h2><p>{attachments.length} attached {attachments.length===1?'moment':'moments'} · {formatBytes(mediaBytes)}</p></div></div><div className="context-note"><Info/><p>Photos and voice notes are kept in this browser. Remove them from their bookmark, or use Delete all data below.</p></div></section><section className="settings-card"><div className="settings-title"><Upload/><div><h2>Import backup</h2><p>Validated before anything changes. Importing clears device-only media.</p></div></div><label className="file-picker"><Upload/> Choose JSON<input type="file" accept="application/json,.json" onChange={e=>pickImport(e.target.files?.[0])}/></label>{error&&<p className="error-text">{error}</p>}{importData&&<div className="import-preview"><strong>Ready to import</strong><span>{importData.sessions.length} sessions · {importData.events.length} events · {importData.effects.length} effects · {importData.reflections.length} reflections</span><button className="primary" onClick={async()=>{await replaceWithBackup(importData);setImportData(null);setStatus('Backup imported')}}>Replace with this backup</button></div>}</section><section className="settings-card"><div className="settings-title"><Sparkles/><div><h2>Fictional demo data</h2><p>Explore single and multi-peak examples.</p></div></div><button className="secondary full" onClick={async()=>{await loadDemoData();setStatus('Demo data loaded')}}>Load demo data</button><button className="text-button" onClick={async()=>{await clearDemoData();setStatus('Demo data removed')}}>Clear demo data</button></section><section className="settings-card"><div className="settings-title"><Info/><div><h2>Safety & privacy</h2><p>Review the introduction anytime.</p></div></div><button className="secondary full" onClick={()=>{localStorage.removeItem('ht-onboarded');window.dispatchEvent(new Event('ht-onboarded'))}}>Reopen onboarding</button><Link className="secondary full" to="/about">Read About & safety</Link></section><section className="settings-card danger-zone"><div className="settings-title"><Trash2/><div><h2>Delete all data</h2><p>This removes every local session, event, reflection, bookmark, photo, and voice note.</p></div></div>{!deleteStep?<button className="danger" onClick={()=>setDeleteStep(true)}>Begin delete</button>:<><label>Type DELETE to confirm<input value={deleteText} onChange={e=>setDeleteText(e.target.value)}/></label><button className="danger" disabled={deleteText!=='DELETE'} onClick={async()=>{await clearAll();setDeleteStep(false);setDeleteText('');setStatus('All journal data deleted')}}>Delete all journal data</button></>}</section></div>{status&&<div className="toast">{status}<button onClick={()=>setStatus('')}>Dismiss</button></div>}</main></Shell>
}

function About() {return <Shell><main className="narrow-page prose-page"><p className="eyebrow">About this journal</p><h1>Awareness, without certainty.</h1><p className="lede">Zanana records what you report and when you report it. The curve is a personal memory aid—not a measurement of THC, sobriety, health, or safety.</p><section><h2>Use it as a journal</h2><p>States, effects, and session boundaries are subjective. They can help you reflect on your own entries, but they do not diagnose a condition or tell you whether you can safely drive or operate machinery.</p></section><section><h2>Get urgent help when needed</h2><p>If severe symptoms or immediate danger occur, contact local emergency services. The “Too high” state is only a journal label and does not replace professional support.</p></section><section><h2>Private by default</h2><p>No account, analytics, location, advertising, or server upload. Data lives in this browser’s IndexedDB until you export, share, or delete it. Clearing browser storage can remove it, so make backups you control.</p></section><section><h2>PWA limits</h2><p>The app does not provide background push reminders or biometric locking. iOS installation and storage behavior are controlled by Safari and the operating system.</p></section></main></Shell>}

function AppRoutes(){const[onboarded,setOnboarded]=useState(localStorage.getItem('ht-onboarded')==='true');useEffect(()=>{const update=()=>setOnboarded(localStorage.getItem('ht-onboarded')==='true');window.addEventListener('ht-onboarded',update);return()=>window.removeEventListener('ht-onboarded',update)},[]);if(!onboarded)return <Onboarding/>;return <Routes><Route path="/" element={<Home/>}/><Route path="/session/new" element={<StartSession/>}/><Route path="/session/:id/live" element={<LiveSession/>}/><Route path="/session/:id/summary" element={<Summary/>}/><Route path="/session/:id/edit" element={<EditSession/>}/><Route path="/history" element={<HistoryPage/>}/><Route path="/insights" element={<><Insights/><InsightsSupplement/></>}/><Route path="/game" element={<GamePage/>}/><Route path="/game/memory" element={<MemoryMatch/>}/><Route path="/game/room" element={<ZananaRoom/>}/><Route path="/settings" element={<SettingsPage/>}/><Route path="/about" element={<About/>}/><Route path="*" element={<Navigate to="/" replace/>}/></Routes>}

export default function App(){useEffect(()=>{initializeDb();const theme=localStorage.getItem('ht-theme')||'light';document.documentElement.dataset.theme=theme},[]);return <BrowserRouter><AppRoutes/></BrowserRouter>}
