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
          {upcoming.length > 0 ? `${plural(upcoming.length, 'dinner')} coming up` : "nothing scheduled. that's fixable."}
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
            no dinners on the books.{' '}
            <Link to="/host/new" className="lime">
              make a plan
            </Link>
            {owned[0] && (
              <>
                {' '}
                or{' '}
                <Link to={`/host/again/${owned[0].id}`} className="lime">
                  plan {owned[0].title} again
                </Link>
              </>
            )}
            .
          </Empty>
        ) : (
          <div className="stack gap-12">
            {upcoming.map((p) => (
              <PlanCard key={p.id} plan={p} viewerId={me} to={`/host/p/${p.id}`} />
            ))}
          </div>
        )}
      </section>

      {past.length > 0 && (
        <section className="section pad">
          <SectionTitle>earlier</SectionTitle>
          <div className="list">
            {past.map((p) => (
              <PlanRow
                key={p.id}
                plan={p}
                viewerId={me}
                to={`/host/p/${p.id}`}
                right={<span className="chip muted">{(p.attendedIds ?? goingIds(state, p.id)).length} came</span>}
              />
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
