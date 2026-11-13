const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function parse(iso: string): Date {
  return new Date(iso)
}

export function time(iso: string): string {
  const d = parse(iso)
  let h = d.getHours()
  const m = d.getMinutes()
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12
  if (h === 0) h = 12
  return m === 0 ? `${h} ${ampm}` : `${h}:${String(m).padStart(2, '0')} ${ampm}`
}

export function dayDate(iso: string): string {
  const d = parse(iso)
  return `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`
}

/** "Fri, Nov 14 · 7:30 PM" */
export function when(iso: string): string {
  return `${dayDate(iso)} · ${time(iso)}`
}

export function longWhen(iso: string): string {
  const d = parse(iso)
  const full = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  return `${full[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()} at ${time(iso)}`
}

function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

/** "today", "tomorrow", "in 3 days", "last Friday", "2 weeks ago" */
export function relative(iso: string, now = new Date()): string {
  const d = parse(iso)
  const days = Math.round((startOfDay(d).getTime() - startOfDay(now).getTime()) / 86400000)
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days === -1) return 'yesterday'
  if (days > 1 && days < 7) return `in ${days} days`
  if (days >= 7 && days < 14) return 'next week'
  if (days >= 14) return `in ${Math.round(days / 7)} weeks`
  if (days < -1 && days > -7) return `${-days} days ago`
  if (days <= -7 && days > -14) return 'last week'
  return `${Math.round(-days / 7)} weeks ago`
}

export function isPast(iso: string, now = new Date()): boolean {
  return parse(iso).getTime() < now.getTime() - 3 * 3600000
}

export function isThisWeekend(iso: string, now = new Date()): boolean {
  const d = parse(iso)
  const days = Math.round((startOfDay(d).getTime() - startOfDay(now).getTime()) / 86400000)
  const dow = d.getDay()
  return days >= 0 && days <= 7 && (dow === 5 || dow === 6 || dow === 0)
}

export function clock(iso: string): string {
  const d = parse(iso)
  return `${time(iso)} · ${MONTHS[d.getMonth()]} ${d.getDate()}`
}

export function money(n: number): string {
  if (!n) return 'free'
  return `$${n}`
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

/** Names for an attendance line: "Maya, Ben + 4 going". */
export function namesLine(names: string[], extra: number, verb = 'going'): string {
  if (names.length === 0 && extra === 0) return `nobody ${verb} yet`
  const head = names.join(', ')
  if (extra > 0) return `${head} + ${extra} ${verb}`
  return `${head} ${verb}`
}

/** Local datetime-local input value from an ISO string. */
export function toInputValue(iso: string): { date: string; time: string } {
  const d = parse(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  }
}

export function fromInputValue(date: string, time: string): string | null {
  if (!date || !time) return null
  const d = new Date(`${date}T${time}:00`)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

export function icsStamp(iso: string): string {
  return parse(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}
