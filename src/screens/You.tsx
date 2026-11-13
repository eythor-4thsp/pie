import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { actorId, person, rsvpsFor, useStore } from '../lib/store'
import { clock } from '../core/format'
import { useInstall } from '../lib/pwa'
import { Avatar } from '../components/Avatar'
import { Icon, PieMark } from '../components/Icon'
import { SectionTitle, Sheet, Switch, TopBar, useToast } from '../components/ui'

export function You() {
  const { state, dispatch, mode, me: remoteMe, logout } = useStore()
  const nav = useNavigate()
  const toast = useToast()
  const install = useInstall()
  const [resetting, setResetting] = useState(false)
  const me = actorId(state)
  const you = person(state, 'you')
  const host = state.you.role === 'host'
  const hosted = Object.values(state.plans).filter((p) => p.hostId === me && p.status === 'published').length
  const went = Object.values(state.plans).filter((p) => p.attendedIds?.includes(me)).length
  const said = Object.values(state.plans).filter((p) => rsvpsFor(state, p.id).some((r) => r.personId === me && r.status === 'going')).length
  const inbox = state.texts.filter((t) => t.toId === me).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 5)
  const following = state.you.followIds.map((id) => person(state, id)).filter((p) => p.name !== 'someone')

  return (
    <div className="screen">
      <TopBar wordmark />
      <div className="pad row gap-16">
        <Avatar person={host ? person(state, 'maya') : you} size={64} />
        <div className="stack gap-4 grow">
          <h1 className="title" style={{ fontSize: 36 }}>
            {host ? 'Maya' : state.you.name || 'you'}
          </h1>
          <span className="small muted">{host ? 'organizer · West Village Supper Club' : state.you.phone}</span>
        </div>
      </div>

      <div className="pad mt-16 two">
        <div className="stat lime">
          <span className="n">{said}</span>
          <span className="eyebrow">said yes</span>
        </div>
        <div className="stat">
          <span className="n">{host ? hosted : went}</span>
          <span className="eyebrow">{host ? 'hosted' : 'showed up'}</span>
        </div>
      </div>

      {!host && (
        <section className="section pad">
          <SectionTitle>you</SectionTitle>
          <div className="card stack gap-12">
            <div className="field">
              <label htmlFor="you-name">name</label>
              <input
                id="you-name"
                className="input"
                defaultValue={state.you.name}
                placeholder="what people call you"
                onBlur={(e) => {
                  if (e.target.value.trim() !== state.you.name) void dispatch({ type: 'you', patch: { name: e.target.value.trim() } })
                }}
              />
            </div>
            {mode === 'remote' ? (
              <div className="field">
                <span className="label">phone</span>
                <span className="small">{state.you.phone || 'not signed in'}</span>
              </div>
            ) : (
              <div className="field">
                <label htmlFor="you-phone">phone</label>
                <input id="you-phone" className="input" type="tel" value={state.you.phone} placeholder="optional" onChange={(e) => dispatch({ type: 'you', patch: { phone: e.target.value } })} />
              </div>
            )}
            <div className="row gap-12" style={{ justifyContent: 'space-between' }}>
              <div className="stack gap-4">
                <span className="small strong">familiar faces</span>
                <span className="hint">show people you follow on nearby plans</span>
              </div>
              <Switch on={state.you.showFaces} label="familiar faces" onChange={(v) => dispatch({ type: 'you', patch: { showFaces: v } })} />
            </div>
          </div>
        </section>
      )}

      {!host && (
        <section className="section pad">
          <SectionTitle right={<span className="chip muted">{following.length}</span>}>following</SectionTitle>
          {following.length === 0 ? (
            <p className="small muted">no one yet</p>
          ) : (
            <div className="row gap-8 wrap">
              {following.map((p) => (
                <button key={p.id} type="button" className="chip" onClick={() => dispatch({ type: 'follow', personId: p.id, on: false })} title="unfollow">
                  <Avatar person={p} size={16} /> {p.name} <Icon name="x" size={11} />
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {inbox.length > 0 && (
        <section className="section pad">
          <SectionTitle>texts</SectionTitle>
          <div className="list card" style={{ padding: '0 16px' }}>
            {inbox.map((t) => (
              <div key={t.id} className="list-item" style={{ alignItems: 'flex-start' }}>
                <Icon name="phone" size={16} stroke="#A1A1AA" style={{ marginTop: 3, flex: 'none' }} />
                <div className="stack gap-4 grow">
                  <span className="eyebrow">{clock(t.at)}</span>
                  <span className="small">{t.body.replace('{link}', '')}</span>
                  {t.planId && (
                    <Link to={`/p/${t.planId}`} className="text-btn lime" style={{ alignSelf: 'flex-start' }}>
                      open
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="section pad">
        <SectionTitle>app</SectionTitle>
        <div className="card stack gap-10">
          <div className="row gap-12">
            <PieMark size={36} />
            <div className="stack gap-4 grow">
              <span className="h3">{install.standalone ? 'installed' : 'add to home screen'}</span>
              {!install.standalone && !install.canPrompt && <span className="hint">{install.ios ? 'share, then add to home screen' : 'open in Safari or Chrome on your phone'}</span>}
            </div>
          </div>
          {install.canPrompt && !install.standalone && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={async () => {
                const r = await install.prompt()
                if (r === 'accepted') toast('installed', 'check')
              }}
            >
              <Icon name="download" size={18} /> install
            </button>
          )}
        </div>
      </section>

      {mode === 'local' ? (
        <>
          <section className="section pad">
            <SectionTitle>view as</SectionTitle>
            <div className="card stack gap-10">
                            <div className="two">
                <button type="button" className={`btn btn-sm ${host ? 'btn-ghost' : 'btn-primary'}`} onClick={() => dispatch({ type: 'role', role: 'guest' })}>
                  guest
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${host ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => {
                    void dispatch({ type: 'role', role: 'host' })
                    nav('/host')
                  }}
                >
                  Maya, host
                </button>
              </div>
            </div>
          </section>

          <section className="section pad">
            <SectionTitle>demos</SectionTitle>
            <div className="list card" style={{ padding: '0 16px' }}>
              {[
                ['/p/noor-birthday', 'lock', 'forwarded private invite'],
                ['/p/rooftop-movie', 'seat', 'full dinner'],
                ['/p/tuesday-trivia', 'alert', 'canceled plan'],
                ['/p/pasta-club', 'dollar', 'paid dinner'],
                ['/p/october-supper', 'sparkle', 'past dinner'],
              ].map(([to, icon, label]) => (
                <Link key={to} to={to} className="list-item" onClick={() => dispatch({ type: 'role', role: 'guest' })}>
                  <Icon name={icon} size={18} stroke="#A1A1AA" />
                  <span className="grow small">{label}</span>
                  <Icon name="back" size={16} style={{ transform: 'rotate(180deg)', color: 'var(--muted)' }} />
                </Link>
              ))}
            </div>
          </section>

          <div className="pad mt-32 center">
            <button type="button" className="text-btn danger" onClick={() => setResetting(true)}>
              reset
            </button>
          </div>
        </>
      ) : (
        <div className="pad mt-32 center stack gap-12">
          {remoteMe?.user ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => logout().then(() => nav('/'))}>
              sign out
            </button>
          ) : (
            <Link to="/login" className="btn btn-primary">
              sign in
            </Link>
          )}
        </div>
      )}

      <Sheet open={resetting} onClose={() => setResetting(false)} title="reset?">
        <p className="body muted">clears everything on this device.</p>
        <div className="stack gap-10 mt-16">
          <button
            type="button"
            className="btn btn-danger-solid"
            onClick={() => {
              void dispatch({ type: 'reset' })
              setResetting(false)
              nav('/')
            }}
          >
            reset
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setResetting(false)}>
            cancel
          </button>
        </div>
      </Sheet>
    </div>
  )
}
