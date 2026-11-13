import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { actorId, canSee, goingIds, isHostOf, messagesFor, person, rsvpOf, uid, useStore } from '../lib/store'
import { time, when } from '../core/format'
import { Avatar } from '../components/Avatar'
import { Icon } from '../components/Icon'
import { TopBar, useToast } from '../components/ui'

export function Thread() {
  const { id = '' } = useParams()
  const { state, dispatch } = useStore()
  const toast = useToast()
  const plan = state.plans[id]
  const me = actorId(state)
  const [text, setText] = useState('')
  const endRef = useRef<HTMLDivElement>(null)
  const msgs = plan ? messagesFor(state, plan.id) : []

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [msgs.length])

  const inThread = !!plan && (isHostOf(plan, me) || rsvpOf(state, plan.id, me)?.status === 'going')
  if (!plan || !canSee(state, plan, me) || !inThread) {
    return (
      <div className="screen no-tabs">
        <TopBar back={plan ? `/p/${plan.id}` : '/'} />
        <div className="pad stack gap-8">
          <h1 className="title">the chat is for people who are in</h1>
          <p className="body muted">Say yes on the plan page and the thread opens up.</p>
        </div>
      </div>
    )
  }

  const host = person(state, plan.hostId)
  const isHost = isHostOf(plan, me)

  const send = () => {
    const t = text.trim()
    if (!t) return
    void dispatch({ type: 'message', message: { id: uid('m'), planId: plan.id, fromId: me, text: t, at: new Date().toISOString() } })
    setText('')
  }

  const pin = (t: string) => {
    const recipients = goingIds(state, plan.id).filter((pid) => pid !== plan.hostId)
    void dispatch({ type: 'pin', planId: plan.id, text: t, at: new Date().toISOString() })
    toast(`pinned. texting ${recipients.length} guests`, 'pin')
  }

  return (
    <div className="screen no-tabs" style={{ paddingBottom: 120 }}>
      <TopBar back={`/p/${plan.id}`} title={plan.title} />
      <div className="pad eyebrow center" style={{ marginTop: -6 }}>
        {when(plan.startsAt)} · {plan.venue}
      </div>

      <div className="pad mt-16">
        <div className="card card-lime stack gap-6">
          <div className="row gap-6 eyebrow lime">
            <Icon name="pin" size={13} stroke="#D0F08B" /> current meeting point · pinned by {host.name}
          </div>
          <p className="body" style={{ fontSize: 16 }}>
            {plan.hostNote || 'nothing pinned yet'}
          </p>
        </div>
      </div>

      <div className="pad stack gap-12 mt-24">
        {msgs.map((m, i) => {
          const from = person(state, m.fromId)
          const mine = m.fromId === me
          const prevSame = i > 0 && msgs[i - 1].fromId === m.fromId
          const isPinned = m.text === plan.hostNote
          return (
            <div key={m.id} className={`msg ${mine ? 'mine' : ''}`} style={prevSame ? { marginTop: -6 } : undefined}>
              <span style={{ width: 24, flex: 'none' }}>{!mine && !prevSame && <Avatar person={from} size={24} />}</span>
              <div className="stack gap-4" style={{ alignItems: mine ? 'flex-end' : 'flex-start' }}>
                {!mine && !prevSame && (
                  <span className="eyebrow" style={{ paddingLeft: 4 }}>
                    {from.name}
                  </span>
                )}
                <div className="bubble" style={!mine && prevSame ? { borderTopLeftRadius: 16 } : undefined}>
                  {m.text}
                  {isPinned && (
                    <span className="row gap-4 eyebrow mt-8" style={{ color: mine ? 'rgba(9,9,11,0.6)' : 'var(--lime)' }}>
                      <Icon name="pin" size={11} /> pinned
                    </span>
                  )}
                </div>
                <div className="row gap-8">
                  <span className="meta">{time(m.at)}</span>
                  {isHost && !isPinned && (
                    <button type="button" className="text-btn" style={{ fontFamily: 'var(--mono)', fontSize: 10 }} onClick={() => pin(m.text)}>
                      pin as meeting point
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
        {msgs.length === 0 && <p className="small muted center">say hi. everyone who's in can see this.</p>}
        <div ref={endRef} />
      </div>

      <div className="composer">
        <div className="composer-inner">
          <input
            className="input grow"
            style={{ borderRadius: 999 }}
            placeholder={`message the ${plan.title.toLowerCase()} crew`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') send()
            }}
            aria-label="message"
          />
          <button type="button" className="icon-btn lime" aria-label="send" onClick={send} disabled={!text.trim()}>
            <Icon name="send" size={18} />
          </button>
        </div>
      </div>
    </div>
  )
}
