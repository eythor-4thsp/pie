import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { actorId, useStore } from '../lib/store'
import { TopBar, useToast } from '../components/ui'

const HOODS = ['West Village', 'Greenwich Village', 'East Village', 'Greenpoint', 'Prospect Heights']

export interface ClubFields {
  name: string
  cadence: string
  neighborhood: string
  description: string
}

export function ClubForm({ initial, submitLabel, onSave }: { initial: ClubFields; submitLabel: string; onSave: (f: ClubFields) => void }) {
  const [f, setF] = useState<ClubFields>(initial)
  const set = <K extends keyof ClubFields>(k: K, v: ClubFields[K]) => setF((x) => ({ ...x, [k]: v }))
  const ok = f.name.trim().length > 1 && f.cadence.trim().length > 1
  return (
    <form
      className="stack gap-16"
      onSubmit={(e) => {
        e.preventDefault()
        if (ok) onSave({ name: f.name.trim(), cadence: f.cadence.trim(), neighborhood: f.neighborhood, description: f.description.trim() })
      }}
    >
      <div className="field">
        <label htmlFor="cl-name">what's it called?</label>
        <input id="cl-name" className="input big" style={{ fontSize: 30 }} value={f.name} placeholder="West Village Supper Club" onChange={(e) => set('name', e.target.value)} autoFocus />
      </div>
      <div className="field">
        <label htmlFor="cl-cadence">how often, roughly</label>
        <input id="cl-cadence" className="input" value={f.cadence} placeholder="every other Friday, 7:30-ish" onChange={(e) => set('cadence', e.target.value)} />
        <span className="hint">people join knowing what they're signing up for. a monthly club needs a longer runway between dinners.</span>
      </div>
      <div className="stack gap-8">
        <span className="eyebrow">where, mostly</span>
        <div className="row gap-8 wrap">
          {HOODS.map((n) => (
            <button key={n} type="button" className={`chip selectable ${f.neighborhood === n ? 'on' : ''}`} onClick={() => set('neighborhood', n)}>
              {n}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <label htmlFor="cl-desc">what happens</label>
        <textarea id="cl-desc" className="input" value={f.description} placeholder="Eight-ish people, one long table. You come, you eat, you end up talking to whoever's next to you." onChange={(e) => set('description', e.target.value)} />
      </div>
      <button type="submit" className="btn btn-primary" disabled={!ok}>
        {submitLabel}
      </button>
    </form>
  )
}

/** A host who has run one dinner starts a club so the group has somewhere to come back to. */
export function ClubNew() {
  const { state, dispatch } = useStore()
  const nav = useNavigate()
  const toast = useToast()
  const me = actorId(state)
  const existing = Object.values(state.clubs).find((c) => c.organizerId === me)

  if (existing) {
    return (
      <div className="screen">
        <TopBar back="/host" />
        <div className="pad stack gap-12">
          <h1 className="title">you already run {existing.name}</h1>
          <p className="body muted">One club per organizer for now. Edit it from the club page.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="screen">
      <TopBar back="/host" title="start a club" />
      <div className="pad stack gap-16">
        <p className="body muted">A club is a home for the group between dinners: who runs it, what happens, how often, and the next one. Coming to a dinner, joining the club, and saying yes to the next invite stay three separate decisions.</p>
        <ClubForm
          initial={{ name: '', cadence: '', neighborhood: 'West Village', description: '' }}
          submitLabel="start the club"
          onSave={async (f) => {
            const id = `club_${f.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'club'}_${Math.random().toString(36).slice(2, 6)}`
            try {
              await dispatch({ type: 'createClub', club: { id, ...f, organizerId: me, memberIds: [me], mutedIds: [], requestIds: [], listedIds: [me], posts: [], reports: [] } })
              toast("it's yours. share the club page after the next dinner", 'check')
              nav(`/club/${id}`, { replace: true })
            } catch (e) {
              toast((e as Error).message)
            }
          }}
        />
      </div>
    </div>
  )
}
