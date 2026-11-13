import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { actorId, audienceConsequence, audienceLabel, goingIds, now, person, reviewAudience, uid, useStore } from '../lib/store'
import { fromInputValue, toInputValue, when } from '../core/format'
import type { Audience, PaymentMode, Plan, Tone } from '../core/types'
import { Avatar } from '../components/Avatar'
import { Cover } from '../components/Cover'
import { Icon } from '../components/Icon'
import { Checkbox, SectionTitle, TopBar, useToast } from '../components/ui'

type Mode = 'new' | 'edit' | 'again'

interface Draft {
  title: string
  date: string
  time: string
  venue: string
  address: string
  neighborhood: string
  hostNote: string
  description: string
  capacity: number
  cost: number
  payment: PaymentMode
  audience: Audience
  clubId: string
  coverTone: Tone
  coverSrc: string
  invitedIds: string[]
}

const NEIGHBORHOODS = ['West Village', 'Greenwich Village', 'East Village', 'Greenpoint', 'Prospect Heights']
const TONES: Tone[] = ['lime', 'latte', 'gray', 'charcoal']

function fromPlan(p: Plan, mode: Mode): Draft {
  const t = toInputValue(p.startsAt)
  return {
    title: p.title,
    date: mode === 'again' ? '' : t.date,
    time: t.time,
    venue: p.venue,
    address: p.address,
    neighborhood: p.neighborhood,
    hostNote: mode === 'again' ? '' : p.hostNote,
    description: p.description ?? '',
    capacity: p.capacity,
    cost: p.cost,
    payment: p.payment,
    audience: p.audience,
    clubId: p.clubId ?? '',
    coverTone: p.cover.tone ?? 'charcoal',
    coverSrc: p.cover.kind === 'photo' ? (p.cover.src ?? '') : '',
    invitedIds: mode === 'again' ? [] : p.invitedIds,
  }
}

async function shrink(file: File): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image()
      i.onload = () => res(i)
      i.onerror = rej
      i.src = url
    })
    const w = Math.min(1000, img.width)
    const h = Math.round((img.height / img.width) * w)
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    c.getContext('2d')?.drawImage(img, 0, 0, w, h)
    return c.toDataURL('image/jpeg', 0.82)
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function Composer({ mode }: { mode: Mode }) {
  const { id = '' } = useParams()
  const { state, dispatch } = useStore()
  const nav = useNavigate()
  const toast = useToast()
  const me = actorId(state)
  const source = state.plans[id]
  const myClub = Object.values(state.clubs).find((c) => c.organizerId === me)
  const [d, setD] = useState<Draft>(() =>
    source
      ? fromPlan(source, mode)
      : {
          title: '',
          date: '',
          time: '19:30',
          venue: '',
          address: '',
          neighborhood: 'West Village',
          hostNote: '',
          description: '',
          capacity: 8,
          cost: 0,
          payment: 'table',
          audience: 'invited',
          clubId: '',
          coverTone: 'lime',
          coverSrc: '',
          invitedIds: [],
        },
  )
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [draftId] = useState(() => (mode === 'edit' && source ? source.id : uid('plan')))
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }))

  const review = useMemo(
    () => (mode === 'again' ? reviewAudience(state, d.clubId ? state.clubs[d.clubId] : myClub, source) : null),
    [mode, state, d.clubId, myClub, source],
  )
  const invited = mode === 'again' && review ? review.final.map((p) => p.id) : d.invitedIds
  const startsAt = fromInputValue(d.date, d.time)
  const sameAsSource = mode === 'again' && source && startsAt && Math.abs(new Date(startsAt).getTime() - new Date(source.startsAt).getTime()) < 60000
  const inFuture = startsAt ? new Date(startsAt).getTime() > Date.now() : false
  const errors = {
    title: !d.title.trim() ? 'give it a name' : '',
    date: !startsAt ? (mode === 'again' ? 'pick a fresh date' : 'pick a date and time') : sameAsSource ? "that's the old date. pick a fresh one" : !inFuture ? "that's already happened" : '',
    venue: !d.venue.trim() ? 'where are we meeting?' : '',
  }
  const publishable = !errors.title && !errors.date && !errors.venue
  const people = Object.values(state.people).filter((p) => !p.blocked && p.id !== me)

  const build = (status: Plan['status']): Plan => {
    const existing = mode === 'edit' && source ? source : undefined
    return {
      id: draftId,
      clubId: d.clubId || undefined,
      hostId: existing?.hostId ?? me,
      cohostIds: existing?.cohostIds ?? [],
      title: d.title.trim() || 'untitled plan',
      startsAt: startsAt ?? source?.startsAt ?? new Date(Date.now() + 86400000).toISOString(),
      timeZone: 'America/New_York',
      venue: d.venue.trim(),
      address: d.address.trim(),
      neighborhood: d.neighborhood,
      hostNote: d.hostNote.trim(),
      description: d.description.trim() || undefined,
      capacity: Math.max(1, d.capacity || 1),
      cost: Math.max(0, d.cost || 0),
      payment: d.cost > 0 ? d.payment : 'table',
      audience: d.audience,
      status,
      revision: existing?.revision ?? 0,
      invitedIds: invited,
      cover: d.coverSrc ? { kind: 'photo', src: d.coverSrc } : { kind: 'poster', tone: d.coverTone },
      updates: existing?.updates ?? [],
      createdAt: existing?.createdAt ?? now(),
      publishedAt: existing?.publishedAt,
      viewerIds: existing?.viewerIds ?? [],
      attendedIds: existing?.attendedIds,
      debrief: existing?.debrief,
      polls: existing?.polls ?? [],
      photos: existing?.photos ?? [],
      remindersSent: existing?.remindersSent ?? [],
      nudgedAt: existing?.nudgedAt ?? {},
      repeatOf: mode === 'again' ? source?.id : existing?.repeatOf,
    }
  }

  const saveDraft = async () => {
    if (!d.title.trim()) {
      setTried(true)
      toast('add a name first')
      return null
    }
    const plan = build(mode === 'edit' && source ? source.status : 'draft')
    await dispatch({ type: 'savePlan', plan, at: now() })
    toast('saved', 'check')
    return plan
  }

  const preview = async () => {
    const plan = await saveDraft()
    if (plan) nav(`/p/${plan.id}?preview=1`)
  }

  const publish = async () => {
    setTried(true)
    if (!publishable || busy) return
    setBusy(true)
    try {
      if (mode === 'edit' && source && source.status === 'published') {
        const changed: string[] = []
        if (source.startsAt !== (startsAt ?? source.startsAt)) changed.push(`time is now ${when(startsAt!)}`)
        if (source.venue !== d.venue.trim() || source.address !== d.address.trim()) changed.push(`place is now ${d.venue.trim()}, ${d.address.trim()}`)
        if (source.hostNote !== d.hostNote.trim()) changed.push(`meeting point: “${d.hostNote.trim()}”`)
        if (source.capacity !== d.capacity) changed.push(`${d.capacity} seats now`)
        const plan = build('published')
        const recipients = goingIds(state, source.id).filter((pid) => pid !== me)
        if (changed.length === 0) {
          await dispatch({ type: 'savePlan', plan: { ...plan, revision: source.revision }, at: now() })
          toast('saved', 'check')
        } else {
          const kind = changed[0].startsWith('time') ? 'time' : changed[0].startsWith('place') ? 'place' : 'details'
          const { updates: _u, revision: _r, ...patch } = plan
          await dispatch({ type: 'update', planId: source.id, kind, text: `${person(state, me).name} changed the plan: ${changed.join(' · ')}.`, patch, recipientIds: recipients, at: now() })
          toast(`texting ${recipients.length}`, 'send')
        }
        nav(`/host/p/${source.id}`)
        return
      }
      const plan = build('draft')
      await dispatch({ type: 'savePlan', plan, at: now() })
      await dispatch({ type: 'publish', planId: plan.id, at: now() })
      toast(invited.length ? `live · ${invited.length} invited` : 'live', 'check')
      nav(`/host/p/${plan.id}`, { replace: true })
    } catch (e) {
      toast((e as Error).message)
      setBusy(false)
    }
  }

  const heading = mode === 'edit' ? 'change the plan' : mode === 'again' ? 'plan this again' : 'make a plan'

  return (
    <div className="screen">
      <TopBar back={mode === 'edit' && source ? `/host/p/${source.id}` : '/host'} title={heading} />

      <div className="pad stack gap-24">
        {mode === 'again' && source && (
          <div className="card card-lime stack gap-6">
            <span className="eyebrow lime">
              <Icon name="repeat" size={12} /> from {source.title}
            </span>
            <span className="small">fresh date, guests, chat, and note</span>
          </div>
        )}

        <div className="field">
          <label htmlFor="c-title">plan</label>
          <input id="c-title" className="input big" value={d.title} placeholder="friday dumplings" onChange={(e) => set('title', e.target.value)} autoFocus={mode !== 'edit'} />
          {tried && errors.title && <span className="hint error">{errors.title}</span>}
        </div>

        <div className="stack gap-8">
          <span className="eyebrow">when</span>
          <div className="two">
            <div className="field">
              <label htmlFor="c-date">date</label>
              <input id="c-date" className="input" type="date" value={d.date} onChange={(e) => set('date', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="c-time">time</label>
              <input id="c-time" className="input" type="time" value={d.time} onChange={(e) => set('time', e.target.value)} />
            </div>
          </div>
          {tried && errors.date ? <span className="hint error">{errors.date}</span> : startsAt ? <span className="hint">{when(startsAt)}</span> : null}
        </div>

        <div className="stack gap-8">
          <span className="eyebrow">where</span>
          <div className="field">
            <label htmlFor="c-venue">place</label>
            <input id="c-venue" className="input" value={d.venue} placeholder="Jin's Dumpling House" onChange={(e) => set('venue', e.target.value)} />
            {tried && errors.venue && <span className="hint error">{errors.venue}</span>}
          </div>
          <div className="field">
            <label htmlFor="c-address">address</label>
            <input id="c-address" className="input" value={d.address} placeholder="112 Christopher St" autoComplete="street-address" onChange={(e) => set('address', e.target.value)} />
          </div>
          <div className="row gap-8 wrap">
            {NEIGHBORHOODS.map((n) => (
              <button key={n} type="button" className={`chip selectable ${d.neighborhood === n ? 'on' : ''}`} onClick={() => set('neighborhood', n)}>
                {n}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label htmlFor="c-note">
            <span className="row gap-6">
              <Icon name="pin" size={12} stroke="#D0F08B" /> meeting point
            </span>
          </label>
          <textarea id="c-note" className="input" value={d.hostNote} placeholder="Meet at the back table. It's under Maya." onChange={(e) => set('hostNote', e.target.value)} />
                  </div>

        <div className="field">
          <label htmlFor="c-desc">details</label>
          <textarea id="c-desc" className="input" style={{ minHeight: 64 }} value={d.description} placeholder="optional" onChange={(e) => set('description', e.target.value)} />
        </div>

        <div className="two">
          <div className="field">
            <label htmlFor="c-cap">seats</label>
            <input id="c-cap" className="input" type="number" min={1} max={200} value={d.capacity} onChange={(e) => set('capacity', parseInt(e.target.value || '1', 10))} />
          </div>
          <div className="field">
            <label htmlFor="c-cost">cost, $</label>
            <input id="c-cost" className="input" type="number" min={0} step={1} value={d.cost} onChange={(e) => set('cost', parseInt(e.target.value || '0', 10))} />
          </div>
        </div>

        {d.cost > 0 && (
          <div className="stack gap-8">
            <span className="eyebrow">payment</span>
            {(['table', 'checkout'] as PaymentMode[]).map((pm) => (
              <button key={pm} type="button" className={`option ${d.payment === pm ? 'on' : ''}`} onClick={() => set('payment', pm)}>
                <span className="radio">{d.payment === pm && <Icon name="check" size={12} strokeWidth={3.5} />}</span>
                <span className="stack gap-4">
                  <span className="small strong">{pm === 'table' ? 'at the table' : 'pay on rsvp'}</span>
                  <span className="hint">{pm === 'table' ? 'you collect it' : 'seat held 10 min while they pay. refund from the roster.'}</span>
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="stack gap-8">
          <span className="eyebrow">audience</span>
          {(['invited', 'link', 'public'] as Audience[]).map((a) => (
            <button key={a} type="button" className={`option ${d.audience === a ? 'on' : ''}`} onClick={() => set('audience', a)}>
              <span className="radio">{d.audience === a && <Icon name="check" size={12} strokeWidth={3.5} />}</span>
              <span className="stack gap-4">
                <span className="small strong row gap-6">
                  <Icon name={a === 'invited' ? 'lock' : a === 'link' ? 'link' : 'globe'} size={14} />
                  {audienceLabel(a)}
                </span>
                <span className="hint">{audienceConsequence(a)}</span>
              </span>
            </button>
          ))}
        </div>

        {myClub && (
          <div className="stack gap-8">
            <span className="eyebrow">club</span>
            <button type="button" className={`option ${d.clubId === myClub.id ? 'on' : ''}`} onClick={() => set('clubId', d.clubId === myClub.id ? '' : myClub.id)}>
              <Checkbox on={d.clubId === myClub.id} />
              <span className="stack gap-4">
                <span className="small strong">{myClub.name}</span>
                <span className="hint">shows on the club page</span>
              </span>
            </button>
          </div>
        )}

        {mode === 'again' && review ? (
          <div className="stack gap-8">
            <SectionTitle right={<span className="chip lime">{review.final.length}</span>}>invites</SectionTitle>
            <div className="card stack gap-12">
              <AudienceGroup label={`members · ${review.members.length}`} people={review.members} />
              <AudienceGroup label={`came last time · ${review.previous.length}`} people={review.previous} />
              {review.duplicates.length > 0 && (
                <span className="hint">
                  counted once: {review.duplicates.map((p) => p.name).join(', ')}
                </span>
              )}
              {review.excluded.length > 0 && <span className="hint">not invited: {review.excluded.map((e) => `${e.person.name} (${e.reason})`).join(', ')}.</span>}
              <div className="hair" />
              <div className="row gap-8 wrap">
                {review.final.map((p) => (
                  <span key={p.id} className="chip">
                    <Avatar person={p} size={16} /> {p.name}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="stack gap-8">
            <SectionTitle right={<span className="chip muted">{invited.length}</span>}>invite</SectionTitle>
            <div className="row gap-8 wrap">
              {people.map((p) => {
                const on = d.invitedIds.includes(p.id)
                return (
                  <button key={p.id} type="button" className={`chip selectable ${on ? 'on' : ''}`} onClick={() => set('invitedIds', on ? d.invitedIds.filter((x) => x !== p.id) : [...d.invitedIds, p.id])}>
                    {p.name || 'new guest'}
                  </button>
                )
              })}
              {me !== 'you' && (
                <button type="button" className={`chip selectable ${d.invitedIds.includes('you') ? 'on' : ''}`} onClick={() => set('invitedIds', d.invitedIds.includes('you') ? d.invitedIds.filter((x) => x !== 'you') : [...d.invitedIds, 'you'])}>
                  {state.you.name || 'the guest'}
                </button>
              )}
            </div>
                      </div>
        )}

        <div className="stack gap-8">
          <span className="eyebrow">cover</span>
          <Cover cover={d.coverSrc ? { kind: 'photo', src: d.coverSrc } : { kind: 'poster', tone: d.coverTone }} title={d.title || 'your plan'} wide />
          <div className="row gap-8 wrap">
            {TONES.map((t) => (
              <button key={t} type="button" className={`chip selectable ${!d.coverSrc && d.coverTone === t ? 'on' : ''}`} onClick={() => setD((x) => ({ ...x, coverTone: t, coverSrc: '' }))}>
                {t}
              </button>
            ))}
            <label className="chip selectable" style={{ cursor: 'pointer' }}>
              <Icon name="plus" size={14} /> photo
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={async (e) => {
                  const f = e.target.files?.[0]
                  if (!f) return
                  try {
                    set('coverSrc', await shrink(f))
                  } catch {
                    toast("couldn't read that photo")
                  }
                }}
              />
            </label>
          </div>
                  </div>

        <div className="stack gap-10">
          <button type="button" className="btn btn-primary" onClick={publish} disabled={busy}>
            {mode === 'edit' && source?.status === 'published' ? 'save' : invited.length ? `publish · invite ${invited.length}` : 'publish'}
          </button>
          {!(mode === 'edit' && source?.status === 'published') && (
            <div className="two">
              <button type="button" className="btn btn-ghost btn-sm" onClick={saveDraft}>
                save draft
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={preview}>
                <Icon name="eye" size={16} /> preview
              </button>
            </div>
          )}
          {tried && !publishable && <span className="hint error center">fix the fields above</span>}
          {mode === 'edit' && source?.status === 'published' && <span className="hint center">guests get one text about the change</span>}
          {mode === 'edit' && source?.status === 'draft' && (
            <button
              type="button"
              className="text-btn danger"
              style={{ alignSelf: 'center', marginTop: 8 }}
              onClick={async () => {
                await dispatch({ type: 'deletePlan', planId: source.id })
                toast('deleted')
                nav('/host', { replace: true })
              }}
            >
              delete draft
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function AudienceGroup({ label, people }: { label: string; people: { id: string; name: string; tone: Tone }[] }) {
  return (
    <div className="stack gap-6">
      <span className="eyebrow">{label}</span>
      <span className="small">{people.length ? people.map((p) => p.name).join(', ') : 'nobody'}</span>
    </div>
  )
}
