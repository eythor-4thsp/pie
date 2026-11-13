import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { actorId, canSee, goingIds, isHostOf, messagesFor, now, person, rsvpOf, uid, useStore } from '../lib/store'
import { plural, time, when } from '../core/format'
import type { Poll } from '../core/types'
import { Avatar } from '../components/Avatar'
import { Icon } from '../components/Icon'
import { Sheet, TopBar, useToast } from '../components/ui'

export function Thread() {
  const { id = '' } = useParams()
  const { state, dispatch } = useStore()
  const toast = useToast()
  const plan = state.plans[id]
  const me = actorId(state)
  const [text, setText] = useState('')
  const [asking, setAsking] = useState(false)
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
          <h1 className="title">say yes to join the chat</h1>
        </div>
      </div>
    )
  }

  const host = person(state, plan.hostId)
  const isHost = isHostOf(plan, me)
  const open = plan.polls.filter((p) => !p.closed)
  const closed = plan.polls.filter((p) => p.closed)

  const send = () => {
    const t = text.trim()
    if (!t) return
    void dispatch({ type: 'message', message: { id: uid('m'), planId: plan.id, fromId: me, text: t, at: now() } })
    setText('')
  }

  const pin = (t: string) => {
    const recipients = goingIds(state, plan.id).filter((pid) => pid !== plan.hostId)
    void dispatch({ type: 'pin', planId: plan.id, text: t, at: now() })
    toast(`pinned · texting ${recipients.length}`, 'pin')
  }

  return (
    <div className="screen no-tabs" style={{ paddingBottom: 120 }}>
      <TopBar
        back={`/p/${plan.id}`}
        title={plan.title}
        right={
          isHost ? (
            <button type="button" className="icon-btn" aria-label="ask the group" onClick={() => setAsking(true)}>
              <Icon name="filter" />
            </button>
          ) : undefined
        }
      />
      <div className="pad eyebrow center" style={{ marginTop: -6 }}>
        {when(plan.startsAt)} · {plan.venue}
      </div>

      <div className="pad mt-16">
        <div className="card card-lime stack gap-6">
          <div className="row gap-6 eyebrow lime">
            <Icon name="pin" size={13} stroke="#D0F08B" /> meeting point · {host.name}
          </div>
          <p className="body" style={{ fontSize: 16 }}>
            {plan.hostNote || 'no note yet'}
          </p>
        </div>
      </div>

      {(open.length > 0 || closed.length > 0) && (
        <div className="pad mt-16 stack gap-10">
          {[...open, ...closed].map((poll) => (
            <PollCard key={poll.id} poll={poll} me={me} isHost={isHost} onVote={(optionId) => dispatch({ type: 'vote', planId: plan.id, pollId: poll.id, personId: me, optionId })} onClose={() => dispatch({ type: 'closePoll', planId: plan.id, pollId: poll.id })} />
          ))}
        </div>
      )}

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
                      pin
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
        {msgs.length === 0 && <p className="small muted center">say hi</p>}
        <div ref={endRef} />
      </div>

      <div className="composer">
        <div className="composer-inner">
          <input
            className="input grow"
            style={{ borderRadius: 999 }}
            placeholder="message"
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

      <Sheet open={asking} onClose={() => setAsking(false)} title="poll">
        <PollForm
          onSave={(question, options) => {
            void dispatch({ type: 'poll', planId: plan.id, poll: { id: uid('poll'), byId: me, question, options: options.map((t) => ({ id: uid('o'), text: t })), votes: {}, at: now() } })
            setAsking(false)
            toast('posted', 'check')
          }}
        />
      </Sheet>
    </div>
  )
}

function PollCard({ poll, me, isHost, onVote, onClose }: { poll: Poll; me: string; isHost: boolean; onVote: (optionId: string) => void; onClose: () => void }) {
  const total = Object.keys(poll.votes).length
  const mine = poll.votes[me]
  return (
    <div className="card stack gap-10">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="eyebrow">{poll.closed ? 'closed' : 'poll'} · {plural(total, 'vote')}</span>
        {isHost && !poll.closed && (
          <button type="button" className="text-btn" onClick={onClose}>
            close
          </button>
        )}
      </div>
      <span className="h3">{poll.question}</span>
      <div className="stack gap-6">
        {poll.options.map((o) => {
          const n = Object.values(poll.votes).filter((v) => v === o.id).length
          const pct = total ? Math.round((n / total) * 100) : 0
          const chosen = mine === o.id
          const winner = poll.closed && n > 0 && n === Math.max(...poll.options.map((x) => Object.values(poll.votes).filter((v) => v === x.id).length))
          return (
            <button
              key={o.id}
              type="button"
              disabled={!!poll.closed}
              onClick={() => onVote(o.id)}
              style={{
                position: 'relative',
                overflow: 'hidden',
                textAlign: 'left',
                height: 40,
                borderRadius: 10,
                border: `1px solid ${chosen || winner ? 'var(--lime)' : 'var(--hair)'}`,
                background: 'var(--bg)',
                color: 'var(--text)',
                padding: '0 12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: poll.closed ? 'default' : 'pointer',
              }}
            >
              <span style={{ position: 'absolute', inset: 0, width: `${pct}%`, background: chosen || winner ? 'var(--lime-dim)' : 'rgba(255,255,255,0.05)', transition: 'width .3s var(--ease)' }} aria-hidden="true" />
              <span className="small" style={{ position: 'relative', fontWeight: chosen ? 600 : 500 }}>
                {chosen && <Icon name="check" size={12} strokeWidth={3} stroke="#D0F08B" />} {o.text}
              </span>
              <span className="eyebrow" style={{ position: 'relative' }}>
                {n}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function PollForm({ onSave }: { onSave: (question: string, options: string[]) => void }) {
  const [q, setQ] = useState('')
  const [opts, setOpts] = useState(['', ''])
  const clean = opts.map((o) => o.trim()).filter(Boolean)
  const ok = q.trim().length > 0 && clean.length >= 2
  return (
    <form
      className="stack gap-12"
      onSubmit={(e) => {
        e.preventDefault()
        if (ok) onSave(q.trim(), clean)
      }}
    >
            <div className="field">
        <label htmlFor="pq">question</label>
        <input id="pq" className="input" value={q} placeholder="after dinner?" autoFocus onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="stack gap-8">
        <span className="eyebrow">options</span>
        {opts.map((o, i) => (
          <input key={i} className="input" value={o} placeholder={`option ${i + 1}`} aria-label={`option ${i + 1}`} onChange={(e) => setOpts(opts.map((x, j) => (j === i ? e.target.value : x)))} />
        ))}
        {opts.length < 4 && (
          <button type="button" className="text-btn lime" style={{ alignSelf: 'flex-start' }} onClick={() => setOpts([...opts, ''])}>
            add option
          </button>
        )}
      </div>
      <button type="submit" className="btn btn-primary" disabled={!ok}>
        post
      </button>
    </form>
  )
}
