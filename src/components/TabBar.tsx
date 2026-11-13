import { NavLink, useLocation } from 'react-router-dom'
import { useStore } from '../lib/store'
import { Icon } from './Icon'

interface Tab {
  to: string
  label: string
  icon: string
  dot?: boolean
}

export function TabBar() {
  const { state } = useStore()
  const loc = useLocation()
  const host = state.you.role === 'host'
  const invitesWaiting = Object.values(state.plans).some(
    (p) => p.status === 'published' && p.invitedIds.includes('you') && !state.rsvps[`${p.id}:you`] && new Date(p.startsAt) > new Date(),
  )
  const tabs: Tab[] = host
    ? [
        { to: '/host', label: 'dinners', icon: 'home' },
        { to: '/club/wvsc', label: 'club', icon: 'users' },
        { to: '/discover', label: 'nearby', icon: 'compass' },
        { to: '/you', label: 'you', icon: 'user' },
      ]
    : [
        { to: '/', label: 'plans', icon: 'home', dot: invitesWaiting },
        { to: '/discover', label: 'nearby', icon: 'compass' },
        { to: '/club/wvsc', label: 'club', icon: 'users' },
        { to: '/you', label: 'you', icon: 'user' },
      ]
  const hide = /^\/p\/[^/]+\/chat/.test(loc.pathname)
  if (hide) return null
  return (
    <nav className="tabbar" aria-label="main">
      <div className="tabbar-inner">
        {tabs.map((t) => (
          <div className="tab-wrap" key={t.to}>
            <NavLink to={t.to} end={t.to === '/'} className={({ isActive }) => `tab ${isActive ? 'on' : ''}`}>
              <Icon name={t.icon} size={22} strokeWidth={1.7} />
              <span>{t.label}</span>
            </NavLink>
            {t.dot && <span className="tab-dot" aria-label="invites waiting" />}
          </div>
        ))}
      </div>
    </nav>
  )
}
