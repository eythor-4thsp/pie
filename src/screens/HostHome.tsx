import { Link, useNavigate } from 'react-router-dom'
import { actorId, goingIds, hostedBy, person, useStore } from '../lib/store'
import { isPast, plural } from '../core/format'
import { Icon } from '../components/Icon'
import { PlanCard, PlanRow } from '../components/PlanCard'
import { Empty, SectionTitle, TopBar } from '../components/ui'

export function HostHome() {
  const { state } = useStore()
  const nav = useNavigate()
  const me = actorId(state)
  const mine = hostedBy(state, me)
  const drafts = mine.filter((p) => p.status === 'draft')
  const upcoming = mine.filter((p) => p.status !== 'draft' && !isPast(p.startsAt))
  const past = mine.filter((p) => p.status !== 'draft' && isPast(p.startsAt)).reverse()
  const name = person(state, me).name
  const owned = past.filter((p) => p.hostId === me)
  const club = Object.values(state.clubs).find((c) => c.organizerId === me)
  const pendingRequests = club?.requestIds.length ?? 0

  return (
    <div className="screen">
      <TopBar
        wordmark
        right={
          <Link to="/host/insights" className="icon-btn" aria-label="the numbers">
            <Icon name="sparkle" />
          </Link>
        }
      />
      <div className="pad stack gap-8">
        <h1 className="title">{me === 'you' ? 'your plans' : `${name}'s dinners`}</h1>
        <p className="body muted">
          {upcoming.length > 0 ? `${plural(upcoming.length, 'dinner')} coming up` : 'nothing scheduled'}
          {drafts.length > 0 ? ` · ${plural(drafts.length, 'draft')}` : ''}
        </p>
      </div>

      {drafts.length > 0 && (
        <section className="section pad">
          <SectionTitle>drafts</SectionTitle>
          <div className="list">
            {drafts.map((p) => (
              <PlanRow key={p.id} plan={p} viewerId={me} to={`/host/p/${p.id}/edit`} right={<span className="chip muted">finish</span>} />
            ))}
          </div>
        </section>
      )}

      <section className="section pad">
        <SectionTitle>coming up</SectionTitle>
        {upcoming.length === 0 ? (
          <Empty>
            <Link to="/host/new" className="lime">
              make a plan
            </Link>
            {owned[0] && (
              <>
                {' · '}
                <Link to={`/host/again/${owned[0].id}`} className="lime">
                  plan {owned[0].title} again
                </Link>
              </>
            )}
          </Empty>
        ) : (
          <div className="stack gap-12">
            {upcoming.map((p) => (
              <PlanCard key={p.id} plan={p} viewerId={me} to={`/host/p/${p.id}`} />
            ))}
          </div>
        )}
      </section>

      <section className="section pad">
        <SectionTitle>club</SectionTitle>
        {club ? (
          <Link to={`/club/${club.id}`} className="card-link">
            <div className="card row gap-12">
              <div className="stack gap-4 grow">
                <span className="h3">{club.name}</span>
                <span className="eyebrow">
                  {plural(club.memberIds.length, 'member')} · {club.cadence}
                  {pendingRequests > 0 ? ` · ${plural(pendingRequests, 'request')}` : ''}
                </span>
              </div>
              {pendingRequests > 0 ? <span className="chip lime">{pendingRequests}</span> : <Icon name="back" size={16} style={{ transform: 'rotate(180deg)', color: 'var(--muted)' }} />}
            </div>
          </Link>
        ) : (
          <Link to="/host/club/new" className="card-link">
            <div className="card row gap-12">
              <div className="stack gap-4 grow">
                <span className="h3">start a club</span>
                <span className="hint">a home for the group between dinners</span>
              </div>
              <Icon name="plus" size={18} stroke="#D0F08B" />
            </div>
          </Link>
        )}
      </section>

      {past.length > 0 && (
        <section className="section pad">
          <SectionTitle>earlier</SectionTitle>
          <div className="list">
            {past.map((p) => (
              <PlanRow key={p.id} plan={p} viewerId={me} to={`/host/p/${p.id}`} right={<span className="chip muted">{(p.attendedIds ?? goingIds(state, p.id)).length} came</span>} />
            ))}
          </div>
          {owned[0] && (
            <button type="button" className="btn btn-ghost mt-12" onClick={() => nav(`/host/again/${owned[0].id}`)}>
              <Icon name="repeat" size={18} /> plan {owned[0].title} again
            </button>
          )}
        </section>
      )}

      <button type="button" className="fab" onClick={() => nav('/host/new')}>
        <Icon name="plus" size={18} strokeWidth={2.4} />
        new plan
      </button>
    </div>
  )
}
