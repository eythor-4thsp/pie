import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react'
import { buildSeed } from '../core/seed'
import { dueReminders } from '../core/select'
import { reduce, type Action } from '../core/reducer'
import type { State } from '../core/types'
import { api, type Me } from './api'

export { uid } from '../core/reducer'
export * from '../core/select'

const KEY = 'pie:v2'
export type Mode = 'local' | 'remote'
export type AuthStatus = 'loading' | 'anon' | 'user'

type LocalAction = Action | { type: 'reset' } | { type: 'replace'; state: State }

function localReducer(state: State, action: LocalAction): State {
  if (action.type === 'reset') return buildSeed()
  if (action.type === 'replace') return action.state
  return reduce(state, action)
}

function load(): State {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as State
      if (parsed && parsed.version === 2) return parsed
    }
  } catch {
    /* storage unavailable: run in memory */
  }
  return buildSeed()
}

export interface PendingError {
  message: string
  action: LocalAction
}

interface Ctx {
  state: State
  mode: Mode
  auth: AuthStatus
  me: Me | null
  /** The last action that could not be saved, so the person can retry it. */
  error: PendingError | null
  clearError: () => void
  dispatch: (a: LocalAction) => Promise<void>
  refresh: () => Promise<void>
  invitePhone: (planId: string, phone: string, name: string) => Promise<void>
  startLogin: (phone: string) => Promise<string | undefined>
  verifyLogin: (phone: string, code: string, name?: string) => Promise<void>
  logout: () => Promise<void>
}

const StoreContext = createContext<Ctx | null>(null)

/**
 * Local mode runs the shared reducer in the browser with a simulated text transport.
 * Remote mode sends every action to the server, which runs the same reducer with real access checks.
 */
export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, localDispatch] = useReducer(localReducer, undefined, load)
  const [mode, setMode] = useState<Mode>('local')
  const [auth, setAuth] = useState<AuthStatus>(import.meta.env.VITE_MODE === 'local' ? 'anon' : 'loading')
  const [me, setMe] = useState<Me | null>(null)
  const [error, setError] = useState<PendingError | null>(null)
  const modeRef = useRef<Mode>('local')
  const scheduled = useRef(new Set<string>())

  // Decide the mode once: a server answers /api/me, static hosting does not.
  useEffect(() => {
    if (import.meta.env.VITE_MODE === 'local') return
    let alive = true
    api.probe().then(async (m) => {
      if (!alive) return
      if (!m) {
        setAuth('anon')
        return
      }
      modeRef.current = 'remote'
      setMode('remote')
      setMe(m)
      setAuth(m.user ? 'user' : 'anon')
      try {
        localDispatch({ type: 'replace', state: await api.state() })
      } catch {
        /* keep the seed until the next refresh */
      }
    })
    return () => {
      alive = false
    }
  }, [])

  // Local mode persists to this browser only.
  useEffect(() => {
    if (modeRef.current === 'remote') return
    try {
      localStorage.setItem(KEY, JSON.stringify(state))
    } catch {
      /* private mode */
    }
  }, [state])

  // Local mode: simulate the text transport. The last text of a batch fails on its first attempt, retries succeed.
  useEffect(() => {
    if (modeRef.current === 'remote') return
    const pending = state.texts.filter((t) => t.status === 'pending' && !scheduled.current.has(`${t.id}:${t.attempts}`))
    if (pending.length === 0) return
    const batches = new Map<string, typeof pending>()
    for (const t of pending) {
      const k = t.updateId ?? t.at
      batches.set(k, [...(batches.get(k) ?? []), t])
      scheduled.current.add(`${t.id}:${t.attempts}`)
    }
    const timer = window.setTimeout(() => {
      const results: Array<{ textId: string; status: 'sent' | 'failed' }> = []
      for (const batch of batches.values()) {
        batch.forEach((t, i) => {
          const fail = batch.length > 1 && i === batch.length - 1 && t.attempts === 1 && t.kind !== 'offer'
          results.push({ textId: t.id, status: fail ? 'failed' : 'sent' })
        })
      }
      localDispatch({ type: 'delivered', results })
    }, 700)
    return () => window.clearTimeout(timer)
  }, [state.texts])

  // Offers and checkout holds expire on a clock, and reminder texts go out the day before and two hours before.
  // The server runs both itself; local mode runs them here.
  const stateRef = useRef(state)
  stateRef.current = state
  useEffect(() => {
    const tick = () => {
      if (modeRef.current === 'remote') return
      const at = new Date().toISOString()
      localDispatch({ type: 'expire', at })
      for (const r of dueReminders(stateRef.current, at)) localDispatch({ type: 'remind', planId: r.planId, which: r.which, at })
    }
    tick()
    const id = window.setInterval(tick, 30000)
    return () => window.clearInterval(id)
  }, [])

  const refresh = useCallback(async () => {
    if (modeRef.current !== 'remote') return
    try {
      localDispatch({ type: 'replace', state: await api.state() })
    } catch {
      /* offline: keep what we have */
    }
  }, [])

  // Remote mode: light polling while the tab is visible keeps two devices in step.
  useEffect(() => {
    if (mode !== 'remote') return
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, 15000)
    const onVis = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [mode, refresh])

  const dispatch = useCallback(async (action: LocalAction) => {

    if (modeRef.current === 'remote') {
      if (action.type === 'reset' || action.type === 'replace' || action.type === 'role') return
      if (action.type === 'you' || action.type === 'follow') localDispatch(action)
      try {
        const next = await api.act(action as Action)
        localDispatch({ type: 'replace', state: next })
        setError(null)
        // Texts settle a moment after the action; pick up sent/failed without waiting for the next poll.
        if (next.texts.some((t) => t.status === 'pending')) window.setTimeout(() => void refresh(), 1500)
      } catch (e) {
        const message = (e as Error).message
        // A refusal (full, forbidden) is final; a network failure is recoverable.
        if (/failed to fetch|network|load failed/i.test(message)) setError({ message: 'offline. not saved.', action })
        throw e
      }
      return
    }
    localDispatch(action)
  }, [refresh])
  const clearError = useCallback(() => setError(null), [])

  const invitePhone = useCallback(async (planId: string, phone: string, name: string) => {
    if (modeRef.current !== 'remote') return
    localDispatch({ type: 'replace', state: await api.invitePhone(planId, phone, name) })
  }, [])

  const startLogin = useCallback(async (phone: string) => (await api.startLogin(phone)).devCode, [])
  const verifyLogin = useCallback(async (phone: string, code: string, name?: string) => {
    const m = await api.verifyLogin(phone, code, name)
    setMe(m)
    setAuth(m.user ? 'user' : 'anon')
    localDispatch({ type: 'replace', state: await api.state() })
  }, [])
  const logout = useCallback(async () => {
    await api.logout()
    setMe((m) => (m ? { ...m, user: null } : m))
    setAuth('anon')
    localDispatch({ type: 'replace', state: await api.state() })
  }, [])

  const value = useMemo<Ctx>(
    () => ({ state, mode, auth, me, error, clearError, dispatch, refresh, invitePhone, startLogin, verifyLogin, logout }),
    [state, mode, auth, me, error, clearError, dispatch, refresh, invitePhone, startLogin, verifyLogin, logout],
  )
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): Ctx {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore outside StoreProvider')
  return ctx
}

export function now(): string {
  return new Date().toISOString()
}
