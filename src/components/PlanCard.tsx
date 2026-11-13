import { Link } from 'react-router-dom'
import { goingIds, isFull, person, rsvpOf, useStore } from '../lib/store'
import { money, namesLine, relative, when } from '../core/format'
import type { Plan } from '../core/types'
import { Cover } from './Cover'
import { Faces } from './Avatar'
import { Icon } from './Icon'

export function StatusChip({ plan, viewerId }: { plan: Plan; viewerId: string }) {
  const { state } = useStore()
  if (plan.status === 'canceled') return <span className="chip cherry">canceled</span>
  if (plan.status === 'draft') return <span className="chip muted">draft</span>
  if (plan.hostId === viewerId) return <span className="chip lime">hosting</span>
  const r = rsvpOf(state, plan.id, viewerId)
  if (r?.status === 'going') return <span className="chip lime">you're going</span>
  if (r?.status === 'waitlist') return <span className="chip outline-lime">on the waitlist</span>
  if (r?.status === 'offered') return <span className="chip lime">seat offered</span>
  if (r?.status === 'holding') return <span className="chip outline-lime">paying</span>
  if (r?.status === 'expired') return <span className="chip muted">offer lapsed</span>
  if (r?.status === 'declined') return <span className="chip muted">you passed</span>
  if (isFull(state, plan.id)) return <span className="chip muted">full</span>
  if (plan.invitedIds.includes(viewerId)) return <span className="chip outline-lime">invited</span>
  return null
}

export function PlanCard({ plan, viewerId, to }: { plan: Plan; viewerId: string; to?: string }) {
  const { state } = useStore()
  const going = goingIds(state, plan.id)
  const people = going.map((id) => person(state, id))
  const names = going.slice(0, 2).map((id) => (id === viewerId && viewerId === 'you' ? 'you' : person(state, id).name))
  return (
    <Link to={to ?? `/p/${plan.id}`} className="card-link">
      <article className="plan-card">
        <Cover cover={plan.cover} title={plan.title} wide hideTitle />
        <div className="plan-body">
          <div className="row gap-8" style={{ justifyContent: 'space-between' }}>
            <span className="mono">
              {when(plan.startsAt)} <span className="muted">· {relative(plan.startsAt)}</span>
            </span>
            <StatusChip plan={plan} viewerId={viewerId} />
          </div>
          <div className="plan-title">{plan.title}</div>
          <div className="small muted">
            {plan.venue} · {plan.neighborhood}
            {plan.cost ? ` · ${money(plan.cost)}` : ''}
          </div>
          <div className="row gap-10 mt-8">
            <Faces people={people} onCard />
            <span className="small">{namesLine(names, Math.max(0, going.length - names.length))}</span>
          </div>
        </div>
      </article>
    </Link>
  )
}

export function PlanRow({ plan, viewerId, to, right }: { plan: Plan; viewerId: string; to?: string; right?: React.ReactNode }) {
  return (
    <Link to={to ?? `/p/${plan.id}`} className="plan-row">
      <div className="thumb">
        <Cover cover={plan.cover} title={plan.title} hideTitle />
      </div>
      <div className="grow stack gap-4">
        <div className="strong" style={{ fontSize: 15 }}>
          {plan.title}
        </div>
        <div className="eyebrow">
          {when(plan.startsAt)} · {plan.neighborhood}
        </div>
      </div>
      {right ?? <StatusChip plan={plan} viewerId={viewerId} />}
      <Icon name="back" size={16} style={{ transform: 'rotate(180deg)', color: 'var(--muted)', flex: 'none' }} />
    </Link>
  )
}
