import { useState } from 'react'
import { Link } from 'react-router-dom'
import { actorId, useStore } from '../lib/store'
import { gatheringMetrics, hostMetrics, supply } from '../core/metrics'
import { dayDate, money, plural, when } from '../core/format'
import type { GatheringMetrics } from '../core/metrics'
import { Icon } from '../components/Icon'
import { Empty, SectionTitle, TopBar } from '../components/ui'

function pct(n: number | null): string {
  return n === null ? '–' : `${Math.round(n * 100)}%`
}

export function Insights() {
  const { state } = useStore()
  const me = actorId(state)
  const m = hostMetrics(state, me)
  const past = m.gatherings.filter((g) => g.attended !== null || new Date(g.plan.startsAt) < new Date()).reverse()
  const [a, setA] = useState(past[0]?.plan.id ?? '')
  const [b, setB] = useState(past[1]?.plan.id ?? '')
  const ga = a ? gatheringMetrics(state, state.plans[a]) : null
  const gb = b ? gatheringMetrics(state, state.plans[b]) : null
  const hood = state.clubs['wvsc']?.neighborhood ?? 'West Village'
  const sup = supply(state, hood)

  return (
    <div className="screen">
      <TopBar back="/host" title="the numbers" />
      <div className="pad stack gap-8">
        <h1 className="title">numbers</h1>
      </div>

      <section className="section pad">
        <SectionTitle>overall</SectionTitle>
        <div className="two">
          <div className="stat lime">
            <span className="n">{pct(m.repeatRate)}</span>
            <span className="eyebrow">
              came back · {m.repeatCount.returned} of {m.repeatCount.eligible}
            </span>
          </div>
          <div className="stat">
            <span className="n">{m.publishedAgain ? 'yes' : 'not yet'}</span>
            <span className="eyebrow">repeated a dinner</span>
          </div>
        </div>
              </section>

      {past.length === 0 ? (
        <section className="section pad">
          <Empty>nothing yet</Empty>
        </section>
      ) : (
        <section className="section pad">
          <SectionTitle>compare</SectionTitle>
          <div className="two">
            <select className="input" value={a} onChange={(e) => setA(e.target.value)} aria-label="first dinner">
              {past.map((g) => (
                <option key={g.plan.id} value={g.plan.id}>
                  {g.plan.title}
                </option>
              ))}
            </select>
            <select className="input" value={b} onChange={(e) => setB(e.target.value)} aria-label="second dinner">
              <option value="">none</option>
              {past.map((g) => (
                <option key={g.plan.id} value={g.plan.id}>
                  {g.plan.title}
                </option>
              ))}
            </select>
          </div>
          <div className="card card-flush mt-12" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr className="eyebrow">
                  <th style={th}>measure</th>
                  <th style={th}>{ga ? dayDate(ga.plan.startsAt) : ''}</th>
                  <th style={th}>{gb ? dayDate(gb.plan.startsAt) : ''}</th>
                </tr>
              </thead>
              <tbody>
                <MetricRow label="seats filled" a={ga} b={gb} f={(g) => `${g.confirmed} of ${g.seats}`} />
                <MetricRow label="showed up" a={ga} b={gb} f={(g) => (g.attended === null ? '–' : `${g.attended} of ${g.confirmed} · ${pct(g.showUp)}`)} />
                <MetricRow label="opened → yes" a={ga} b={gb} f={(g) => (g.viewers === 0 ? '–' : `${g.confirmed} of ${g.viewers} · ${pct(g.conversion)}`)} />
                <MetricRow label="new vs returning" a={ga} b={gb} f={(g) => `${g.firstTimers} new · ${g.returning} returning`} />
                <MetricRow label="minutes to publish" a={ga} b={gb} f={(g) => (g.minutesToPublish === null ? '–' : `${g.minutesToPublish}`)} />
                <MetricRow label="fixed by hand" a={ga} b={gb} f={(g) => (g.interventions === null ? '–' : `${g.interventions}`)} />
                <MetricRow label="texts outside pie" a={ga} b={gb} f={(g) => (g.outsideTexts === null ? '–' : `${g.outsideTexts}`)} />
                <MetricRow label="collected" a={ga} b={gb} f={(g) => (g.revenue || g.refunded ? `${money(g.revenue)} · ${money(g.refunded)} refunded` : 'free')} />
              </tbody>
            </table>
          </div>
                  </section>
      )}

      <section className="section pad">
        <SectionTitle>all</SectionTitle>
        <div className="list">
          {[...m.gatherings].reverse().map((g) => (
            <Link key={g.plan.id} to={`/host/p/${g.plan.id}`} className="plan-row">
              <div className="stack gap-4 grow">
                <span className="small strong">{g.plan.title}</span>
                <span className="eyebrow">
                  {when(g.plan.startsAt)} · {g.confirmed} of {g.seats} seats · {g.attended === null ? '' : `${g.attended} came`}
                  {g.plan.repeatOf ? ' · repeat' : ''}
                </span>
              </div>
              <Icon name="back" size={16} style={{ transform: 'rotate(180deg)', color: 'var(--muted)' }} />
            </Link>
          ))}
        </div>
      </section>

      <section className="section pad">
        <SectionTitle>public plans · {hood}</SectionTitle>
        <div className="stack gap-6">
          {sup.map((s) => (
            <div key={s.weekend} className="row" style={{ justifyContent: 'space-between' }}>
              <span className="small">weekend of {dayDate(s.weekend)}</span>
              <span className={`chip ${s.plans >= 3 && s.hosts >= 2 ? 'lime' : 'muted'}`}>
                {plural(s.plans, 'public plan')} · {plural(s.hosts, 'host')}
              </span>
            </div>
          ))}
        </div>
        <p className="hint mt-8">lime: 3+ plans from 2+ hosts</p>
      </section>
    </div>
  )
}

const th: React.CSSProperties = { textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid var(--hair)', fontWeight: 400 }

function MetricRow({ label, a, b, f }: { label: string; a: GatheringMetrics | null; b: GatheringMetrics | null; f: (g: GatheringMetrics) => string }) {
  const td: React.CSSProperties = { padding: '10px 12px', borderBottom: '1px solid var(--hair)', verticalAlign: 'top' }
  return (
    <tr>
      <td style={{ ...td, color: 'var(--muted)' }}>{label}</td>
      <td style={td}>{a ? f(a) : ''}</td>
      <td style={td}>{b ? f(b) : ''}</td>
    </tr>
  )
}
