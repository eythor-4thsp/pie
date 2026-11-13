import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as BeforeInstallPromptEvent
    listeners.forEach((l) => l())
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    listeners.forEach((l) => l())
  })
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

export function useInstall() {
  const [, bump] = useState(0)
  useEffect(() => {
    const l = () => bump((n) => n + 1)
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  }, [])
  return {
    canPrompt: !!deferred,
    standalone: isStandalone(),
    ios: isIOS(),
    prompt: async () => {
      if (!deferred) return 'unavailable' as const
      await deferred.prompt()
      const choice = await deferred.userChoice
      deferred = null
      listeners.forEach((l) => l())
      return choice.outcome
    },
  }
}

export async function share(data: { title: string; text: string; url: string }): Promise<'shared' | 'copied' | 'failed'> {
  try {
    if (navigator.share) {
      await navigator.share(data)
      return 'shared'
    }
  } catch {
    /* user dismissed or share failed; fall through to clipboard */
  }
  try {
    await navigator.clipboard.writeText(data.url)
    return 'copied'
  } catch {
    return 'failed'
  }
}

export function download(filename: string, text: string, type = 'text/calendar'): void {
  const blob = new Blob([text], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
