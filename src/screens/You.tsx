import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { actorId, person, rsvpsFor, useStore } from '../lib/store'
import { clock } from '../core/format'
import { useInstall } from '../lib/pwa'
import { Avatar } from '../components/Avatar'
import { Icon, PieMark } from '../components/Icon'
import { SectionTitle, Sheet, TopBar, useToast } from '../components/ui'

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

  return (
    <div className="screen">
      <TopBar wordmark />
      <div className="pad row gap-16">
        <Avatar person={host ? person(state, 'maya') : you} size={64} />
        <div className="stack gap-4 grow">
          <h1 className="title" style={{ fontSize: 36 }}>
            {host ? 'Maya' : state.you.name || 'you'}
          </h1>
          <span className="small muted">{host ? 'organizer · West Village Supper Club' : state.you.phone || 'no phone on file'}</span>
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
          <SectionTitle>about you</SectionTitle>
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
                <span className="hint">your number is your sign-in. hosts text it when a plan changes.</span>
              </div>
            ) : (
              <div className="field">
                <label htmlFor="you-phone">phone for day-of texts</label>
                <input id="you-phone" className="input" type="tel" value={state.you.phone} placeholder="optional" onChange={(e) => dispatch({ type: 'you', patch: { phone: e.target.value } })} />
              </div>
            )}
          </div>
        </section>
      )}

      {inbox.length > 0 && (
        <section className="section pad">
          <SectionTitle>texts you got</SectionTitle>
          <div className="list card" style={{ padding: '0 16px' }}>
            {inbox.map((t) => (
              <div key={t.id} className="list-item" style={{ alignItems: 'flex-start' }}>
                <Icon name="phone" size={16} stroke="#A1A1AA" style={{ marginTop: 3, flex: 'none' }} />
                <div className="stack gap-4 grow">
                  <span className="eyebrow">{clock(t.at)}</span>
                  <span className="small">{t.body.replace('{link}', '')}</span>
                  {t.planId && (
                    <Link to={`/p/${t.planId}`} className="text-btn lime" style={{ alignSelf: 'flex-start' }}>
                      open the plan
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="section pad">
        <SectionTitle>get pie on your phone</SectionTitle>
        <div className="card stack gap-10">
          <div className="row gap-12">
            <PieMark size={36} />
            <div className="stack gap-4 grow">
              <span className="h3">{install.standalone ? "you're running the app" : 'add to your home screen'}</span>
              <span className="hint">
                {install.standalone
                  ? 'installed. plans open full-screen and work offline.'
                  : install.canPrompt
                    ? 'one tap. opens like an app, works offline, no store.'
                    : install.ios
                      ? 'in Safari: share, then "add to home screen".'
                      : 'open this in Chrome or Safari on your phone, then use the browser menu to add it.'}
              </span>
            </div>
          </div>
          {install.canPrompt && !install.standalone && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={async () => {
                const r = await install.prompt()
                if (r === 'accepted') toast('pie is on your home screen', 'check')
              }}
            >
              <Icon name="download" size={18} /> install pie
            </button>
          )}
        </div>
      </section>

      {mode === 'local' ? (
        <>
          <section className="section pad">
            <SectionTitle>switch seats</SectionTitle>
            <div className="card stack gap-10">
              <p className="small muted">This copy runs on your device with fictional people. Guests see invitations. Maya hosts the supper club and sees the roster, the composer, the numbers, and day-of changes.</p>
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
                  Maya · host
                </button>
              </div>
            </div>
          </section>

          <section className="section pad">
            <SectionTitle>three other endings</SectionTitle>
            <div className="list card" style={{ padding: '0 16px' }}>
              <Link to="/p/noor-birthday" className="list-item" onClick={() => dispatch({ type: 'role', role: 'guest' })}>
                <Icon name="lock" size={18} stroke="#A1A1AA" />
                <span className="grow small">a forwarded private invite</span>
                <Icon name="back" size={16} style={{ transform: 'rotate(180deg)', color: 'var(--muted)' }} />
              </Link>
              <Link to="/p/rooftop-movie" className="list-item" onClick={() => dispatch({ type: 'role', role: 'guest' })}>
                <Icon name="seat" size={18} stroke="#A1A1AA" />
                <span className="grow small">a full dinner, with a waitlist</span>
                <Icon name="back" size={16} style={{ transform: 'rotate(180deg)', color: 'var(--muted)' }} />
              </Link>
              <Link to="/p/tuesday-trivia" className="list-item" onClick={() => dispatch({ type: 'role', role: 'guest' })}>
                <Icon name="alert" size={18} stroke="#A1A1AA" />
                <span className="grow small">a canceled plan</span>
                <Icon name="back" size={16} style={{ transform: 'rotate(180deg)', color: 'var(--muted)' }} />
              </Link>
              <Link to="/p/pasta-club" className="list-item" onClick={() => dispatch({ type: 'role', role: 'guest' })}>
                <Icon name="dollar" size={18} stroke="#A1A1AA" />
                <span className="grow small">a paid dinner with checkout</span>
                <Icon name="back" size={16} style={{ transform: 'rotate(180deg)', color: 'var(--muted)' }} />
              </Link>
            </div>
          </section>

          <div className="pad mt-32 center">
            <button type="button" className="text-btn danger" onClick={() => setResetting(true)}>
              reset the demo
            </button>
            <p className="eyebrow mt-16" style={{ opacity: 0.6 }}>
              pie · plans that actually happen · everything here lives on this device
            </p>
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
          <p className="eyebrow" style={{ opacity: 0.6 }}>
            pie pilot · texts go out by {remoteMe?.sms === 'twilio' ? 'SMS' : 'the demo outbox'}
          </p>
        </div>
      )}

      <Sheet open={resetting} onClose={() => setResetting(false)} title="start over?">
        <p className="body muted">Clears your name, RSVPs, messages, and any plans you made. The fictional club comes back fresh.</p>
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
            reset everything
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setResetting(false)}>
            keep it
          </button>
        </div>
      </Sheet>
    </div>
  )
}
