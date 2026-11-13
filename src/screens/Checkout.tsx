import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { actorId, now, person, rsvpOf, uid, useStore } from '../lib/store'
import { money, when } from '../core/format'
import { Icon } from '../components/Icon'
import { TopBar, useToast } from '../components/ui'

/**
 * Seat is held while the guest pays. The charge is simulated by a test processor:
 * any card number works except one ending in 0000, which fails like a declined card.
 */
export function Checkout() {
  const { id = '' } = useParams()
  const { state, dispatch } = useStore()
  const nav = useNavigate()
  const toast = useToast()
  const plan = state.plans[id]
  const me = actorId(state)
  const rsvp = plan ? rsvpOf(state, plan.id, me) : undefined
  const [card, setCard] = useState('4242 4242 4242 4242')
  const [exp, setExp] = useState('12/28')
  const [cvc, setCvc] = useState('123')
  const [busy, setBusy] = useState(false)
  const [, tick] = useState(0)

  useEffect(() => {
    const t = window.setInterval(() => tick((n) => n + 1), 15000)
    return () => window.clearInterval(t)
  }, [])

  if (!plan) {
    return (
      <div className="screen">
        <TopBar back="/" />
        <div className="pad">
          <h1 className="title">nothing to pay for</h1>
        </div>
      </div>
    )
  }

  const holding = rsvp?.status === 'holding'
  const left = rsvp?.expiresAt ? Math.max(0, Math.round((new Date(rsvp.expiresAt).getTime() - Date.now()) / 60000)) : 0
  const host = person(state, plan.hostId)
  const digits = card.replace(/\D/g, '')
  const valid = digits.length >= 15 && /^\d{2}\/\d{2}$/.test(exp) && cvc.length >= 3

  const pay = async () => {
    if (!holding || !valid || busy) return
    setBusy(true)
    const ok = !digits.endsWith('0000')
    const chargeId = `ch_test_${uid('').slice(1, 7)}`
    await new Promise((r) => setTimeout(r, 700))
    try {
      await dispatch({ type: 'pay', planId: plan.id, personId: me, ok, chargeId, at: now() })
    } catch (e) {
      toast((e as Error).message)
      setBusy(false)
      return
    }
    if (ok) {
      toast(`paid ${money(plan.cost)}. you're in`, 'check')
      nav(`/p/${plan.id}`, { replace: true })
    } else {
      toast('card declined. your seat was released')
      setBusy(false)
      nav(`/p/${plan.id}`, { replace: true })
    }
  }

  return (
    <div className="screen">
      <TopBar back={`/p/${plan.id}`} title="checkout" />
      <div className="pad stack gap-16">
        <div className="card stack gap-8">
          <span className="eyebrow">{plan.title}</span>
          <span className="h2">{money(plan.cost)} per person</span>
          <span className="small muted">
            {when(plan.startsAt)} · {plan.venue}
          </span>
          <div className="hair mt-8" />
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="small">1 seat</span>
            <span className="mono">{money(plan.cost)}</span>
          </div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="small strong">total today</span>
            <span className="mono strong">{money(plan.cost)}</span>
          </div>
          <p className="hint mt-8">
            Full refund if {host.name} cancels. Refunds for a change of plans are up to {host.name}, through the plan page, up to the day before.
          </p>
        </div>

        {holding ? (
          <div className="card card-lime stack gap-4">
            <span className="eyebrow lime">
              <Icon name="clock" size={12} /> seat held for {left} more min
            </span>
            <span className="small">Nobody else can take it while you finish.</span>
          </div>
        ) : (
          <div className="card card-cherry stack gap-8">
            <span className="eyebrow cherry">no seat held</span>
            <span className="small">The hold ran out or the seat was never reserved. Go back and tap "i'm in" again.</span>
          </div>
        )}

        <form
          className="stack gap-12"
          onSubmit={(e) => {
            e.preventDefault()
            void pay()
          }}
        >
          <div className="field">
            <label htmlFor="ck-card">card number</label>
            <input id="ck-card" className="input" inputMode="numeric" autoComplete="cc-number" value={card} onChange={(e) => setCard(e.target.value)} />
            <span className="hint">test processor: any number pays, one ending in 0000 is declined.</span>
          </div>
          <div className="two">
            <div className="field">
              <label htmlFor="ck-exp">expiry</label>
              <input id="ck-exp" className="input" inputMode="numeric" autoComplete="cc-exp" placeholder="MM/YY" value={exp} onChange={(e) => setExp(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="ck-cvc">cvc</label>
              <input id="ck-cvc" className="input" inputMode="numeric" autoComplete="cc-csc" value={cvc} onChange={(e) => setCvc(e.target.value)} />
            </div>
          </div>
          <button type="submit" className="btn btn-primary mt-8" disabled={!holding || !valid || busy}>
            {busy ? 'charging…' : `pay ${money(plan.cost)} and take the seat`}
          </button>
          <span className="hint center">one charge, one ticket, one seat. you get a text receipt.</span>
        </form>
      </div>
    </div>
  )
}
