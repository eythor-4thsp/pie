import { useState } from 'react'
import { Link } from 'react-router-dom'
import { actorId, familiarFaces, person, seatsLeft, useStore } from '../lib/store'
import { isPast, isThisWeekend, money, plural, relative, when } from '../core/format'
import { Avatar } from '../components/Avatar'
import { Cover } from '../components/Cover'
import { Icon } from '../components/Icon'
import { Empty, TopBar } from '../components/ui'

const HOODS = ['West Village', 'Greenwich Village', 'Prospect Heights']

export function Discover() {
  const { state, dispatch, mode, auth } = useStore()
  const me = actorId(state)
  const identified = mode === 'remote' ? auth === 'user' : !!state.you.name
  const [hood, setHood] = useState<string | null>('West Village')
  const [weekend, setWeekend] = useState(true)
  const [freeOnly, setFreeOnly] = useState(false)
  const [friends, setFriends] = useState(false)
  const [followed, setFollowed] = useState(false)
  const showFaces = state.you.showFaces

  const publicPlans = Object.values(state.plans)
    .filter((p) => p.audience === 'public' && p.status === 'published' && !isPast(p.startsAt))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))

  const results = publicPlans.filter((p) => {
    if (hood && p.neighborhood !== hood) return false
    if (weekend && !isThisWeekend(p.startsAt)) return false
    if (freeOnly && p.cost > 0) return false
    if (friends && familiarFaces(state, p.id, me).length === 0) return false
    if (followed && !state.you.followIds.includes(p.hostId)) return false
    return true
  })
  const nextUp = publicPlans.find((p) => !results.includes(p) && (!hood || p.neighborhood === hood))

  return (
    <div className="screen">
      <TopBar
        wordmark
        right={
          <button
            type="button"
            className={`icon-btn ${showFaces ? 'lime' : ''}`}
            aria-label={showFaces ? 'hide familiar faces' : 'show familiar faces'}
            title="familiar faces"
            onClick={() => dispatch({ type: 'you', patch: { showFaces: !showFaces } })}
          >
            <Icon name="eye" />
          </button>
        }
      />
      <div className="pad stack gap-8">
        <h1 className="title">free this weekend?</h1>
        <p className="body muted">public plans near you with a seat open. same yes as any invite.</p>
      </div>

      <div className="pad mt-16 row gap-8 wrap">
        {HOODS.map((h) => (
          <button key={h} type="button" className={`chip selectable ${hood === h ? 'on' : ''}`} onClick={() => setHood(hood === h ? null : h)}>
            {h}
          </button>
        ))}
      </div>
      <div className="pad mt-8 row gap-8 wrap">
        <button type="button" className={`chip selectable ${weekend ? 'on' : ''}`} onClick={() => setWeekend(!weekend)}>
          <Icon name="calendar" size={14} /> this weekend
        </button>
        <button type="button" className={`chip selectable ${freeOnly ? 'on' : ''}`} onClick={() => setFreeOnly(!freeOnly)}>
          free
        </button>
        <button type="button" className={`chip selectable ${friends ? 'on' : ''}`} onClick={() => setFriends(!friends)}>
          <Icon name="users" size={14} /> friends going
        </button>
        <button type="button" className={`chip selectable ${followed ? 'on' : ''}`} onClick={() => setFollowed(!followed)}>
          hosts i follow
        </button>
      </div>

      <div className="pad mt-24 stack gap-12">
        {results.length === 0 ? (
          <Empty>
            nothing {weekend ? 'this weekend' : 'coming up'} {hood ? `in ${hood}` : 'nearby'} yet.
            {nextUp && (
              <>
                {' '}
                next up:{' '}
                <Link to={`/p/${nextUp.id}`} className="lime">
                  {nextUp.title}
                </Link>
                , {relative(nextUp.startsAt)}.
              </>
            )}
          </Empty>
        ) : (
          results.map((p, i) => {
            const host = person(state, p.hostId)
            const seats = seatsLeft(state, p.id)
            const familiar = familiarFaces(state, p.id, me)
            const following = state.you.followIds.includes(p.hostId)
            return (
              <article key={p.id} className={`plan-card rise rise-${Math.min(i + 1, 4)}`}>
                <Link to={`/p/${p.id}`} className="card-link" style={{ borderRadius: 0 }}>
                  <Cover cover={p.cover} title={p.title} wide hideTitle />
                </Link>
                <div className="plan-body">
                  <div className="row gap-8" style={{ justifyContent: 'space-between' }}>
                    <span className="mono">
                      {when(p.startsAt)} <span className="muted">· {relative(p.startsAt)}</span>
                    </span>
                    <span className={`chip ${seats === 0 ? 'muted' : 'outline-lime'}`}>{seats === 0 ? 'full' : `${plural(seats, 'seat')} left`}</span>
                  </div>
                  <Link to={`/p/${p.id}`} className="plan-title" style={{ color: 'inherit' }}>
                    {p.title}
                  </Link>
                  <div className="small muted">
                    {p.neighborhood} · {money(p.cost)}
                    {p.cost ? ' per person' : ''}
                  </div>
                  <div className="row gap-10 mt-8" style={{ justifyContent: 'space-between' }}>
                    <span className="row gap-8 small">
                      <Avatar person={host} size={24} />
                      <span className="muted">
                        <span style={{ color: 'var(--text)', fontWeight: 600 }}>{host.name}</span> hosts
                      </span>
                      {identified && p.hostId !== me && (
                        <button type="button" className={`chip ${following ? 'lime' : ''}`} style={{ height: 24 }} onClick={() => dispatch({ type: 'follow', personId: p.hostId, on: !following })}>
                          {following ? 'following' : 'follow'}
                        </button>
                      )}
                    </span>
                    {familiar.length > 0 && (
                      <span className="row gap-6 small lime">
                        <Avatar person={person(state, familiar[0])} size={22} />
                        {person(state, familiar[0]).name}
                        {familiar.length > 1 ? ` + ${familiar.length - 1}` : ''} going
                      </span>
                    )}
                  </div>
                </div>
              </article>
            )
          })
        )}
      </div>

      <p className="pad eyebrow mt-24" style={{ opacity: 0.7 }}>
        a familiar face shows only when you follow them and they allow it. the eye switches the cue off to test the card without it.
      </p>
    </div>
  )
}
