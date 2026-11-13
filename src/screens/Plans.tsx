import { Link, useNavigate } from 'react-router-dom'
import { actorId, canSee, person, rsvpOf, useStore } from '../lib/store'
import { isPast, plural } from '../core/format'
import { Avatar } from '../components/Avatar'
import { Icon } from '../components/Icon'
import { PlanCard, PlanRow } from '../components/PlanCard'
import { Empty, SectionTitle, TopBar } from '../components/ui'

export function Plans() {
  const { state } = useStore()
  const nav = useNavigate()
  const me = actorId(state)
  const all = Object.values(state.plans)
    .filter((p) => p.status !== 'draft' && canSee(state, p, me))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  const upcoming = all.filter((p) => !isPast(p.startsAt))
  const needsAnswer = upcoming.filter((p) => p.status === 'published' && p.hostId !== me && p.invitedIds.includes(me) && !rsvpOf(state, p.id, me))
  const comingUp = upcoming.filter((p) => {
    const r = rsvpOf(state, p.id, me)
    return p.status === 'published' && (p.hostId === me || r?.status === 'going' || r?.status === 'waitlist')
  })
  const also = upcoming.filter((p) => !needsAnswer.includes(p) && !comingUp.includes(p) && (p.status === 'canceled' || rsvpOf(state, p.id, me)))
  const earlier = all.filter((p) => isPast(p.startsAt)).reverse()
  const name = state.you.name

  return (
    <div className="screen">
      <TopBar
        wordmark
        right={
          <Link to="/you" aria-label="you" className="icon-btn" style={{ border: 0, background: 'transparent' }}>
            <Avatar person={person(state, 'you')} size={36} />
          </Link>
        }
      />
      <div className="pad stack gap-8">
        <h1 className="title">{name ? `hey ${name.split(' ')[0]}` : 'hey there'}</h1>
        <p className="body muted">
          {needsAnswer.length > 0
            ? `${plural(needsAnswer.length, 'invite')} waiting`
            : comingUp.length > 0
              ? `${plural(comingUp.length, 'plan')} coming up`
              : 'nothing yet'}
        </p>
      </div>

      {needsAnswer.length > 0 && (
        <section className="section pad">
          <SectionTitle>needs an answer</SectionTitle>
          <div className="stack gap-12">
            {needsAnswer.map((p, i) => (
              <div key={p.id} className={`rise rise-${Math.min(i + 1, 4)}`}>
                <PlanCard plan={p} viewerId={me} />
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="section pad">
        <SectionTitle>coming up</SectionTitle>
        {comingUp.length === 0 ? (
          <Empty>
            <Link to="/host/new" className="lime">
              make a plan
            </Link>
          </Empty>
        ) : (
          <div className="stack gap-12">
            {comingUp.map((p) => (
              <PlanCard key={p.id} plan={p} viewerId={me} />
            ))}
          </div>
        )}
      </section>

      {also.length > 0 && (
        <section className="section pad">
          <SectionTitle>also this week</SectionTitle>
          <div className="list">
            {also.map((p) => (
              <PlanRow key={p.id} plan={p} viewerId={me} />
            ))}
          </div>
        </section>
      )}

      {earlier.length > 0 && (
        <section className="section pad">
          <SectionTitle>earlier</SectionTitle>
          <div className="list">
            {earlier.map((p) => (
              <PlanRow key={p.id} plan={p} viewerId={me} right={<span className="chip muted">{p.attendedIds?.includes(me) ? 'you went' : 'past'}</span>} />
            ))}
          </div>
        </section>
      )}

      <button type="button" className="fab" onClick={() => nav('/host/new')}>
        <Icon name="plus" size={18} strokeWidth={2.4} />
        make a plan
      </button>
    </div>
  )
}
