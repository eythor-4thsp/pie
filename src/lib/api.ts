import type { Action } from '../core/reducer'
import type { State } from '../core/types'

export interface Me {
  mode: 'remote'
  user: { id: string; name: string; phone: string } | null
  sms: 'console' | 'twilio'
}

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? ''

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    ...init,
  })
  const text = await res.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    throw new Error(`not json from ${path}`)
  }
  if (!res.ok) {
    const err = (data as { error?: string } | null)?.error ?? `request failed (${res.status})`
    throw new Error(err)
  }
  return data as T
}

export const api = {
  /** Resolves to null when there is no server behind this page. */
  async probe(): Promise<Me | null> {
    try {
      const me = await req<Me>('/me')
      return me && me.mode === 'remote' ? me : null
    } catch {
      return null
    }
  },
  state: () => req<State>('/state'),
  act: (action: Action) => req<State>('/act', { method: 'POST', body: JSON.stringify({ action }) }),
  invitePhone: (planId: string, phone: string, name: string) => req<State>('/invite-phone', { method: 'POST', body: JSON.stringify({ planId, phone, name }) }),
  startLogin: (phone: string) => req<{ ok: true; devCode?: string }>('/auth/start', { method: 'POST', body: JSON.stringify({ phone }) }),
  verifyLogin: (phone: string, code: string, name?: string) => req<Me>('/auth/verify', { method: 'POST', body: JSON.stringify({ phone, code, name }) }),
  logout: () => req<{ ok: true }>('/auth/logout', { method: 'POST', body: '{}' }),
}
