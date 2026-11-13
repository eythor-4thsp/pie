import { useEffect, type ReactNode } from 'react'
import { HashRouter, MemoryRouter, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { StoreProvider, useStore } from './lib/store'
import { ToastProvider } from './components/ui'
import { TabBar } from './components/TabBar'
import { Icon, PieMark } from './components/Icon'
import { Plans } from './screens/Plans'
import { Plan } from './screens/Plan'
import { Thread } from './screens/Thread'
import { Club } from './screens/Club'
import { ClubNew } from './screens/ClubNew'
import { Discover } from './screens/Discover'
import { You } from './screens/You'
import { HostHome } from './screens/HostHome'
import { Composer } from './screens/Composer'
import { Roster } from './screens/Roster'
import { Insights } from './screens/Insights'
import { Login } from './screens/Login'
import { Checkout } from './screens/Checkout'

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [pathname])
  return null
}

function RoleBanner() {
  const { state, dispatch, mode } = useStore()
  const nav = useNavigate()
  if (mode !== 'local' || state.you.role !== 'host') return null
  return (
    <div className="role-banner" role="status">
      <span>viewing as Maya · host</span>
      <button
        type="button"
        className="text-btn"
        style={{ color: 'var(--lime)', fontFamily: 'var(--mono)', fontSize: 11 }}
        onClick={() => {
          void dispatch({ type: 'role', role: 'guest' })
          nav('/')
        }}
      >
        back to guest
      </button>
    </div>
  )
}

/** The recoverable state: an action that never reached the server, with one tap to send it again. */
function ErrorBanner() {
  const { error, clearError, dispatch } = useStore()
  if (!error) return null
  return (
    <div className="role-banner" role="alert" style={{ background: 'var(--cherry-dim)', borderColor: 'rgba(255,43,94,0.4)', color: 'var(--text)', fontFamily: 'var(--sans)', fontSize: 13 }}>
      <span className="row gap-8">
        <Icon name="alert" size={14} stroke="#FF2B5E" /> {error.message}
      </span>
      <span className="row gap-12">
        <button type="button" className="text-btn lime" onClick={() => dispatch(error.action).catch(() => {})}>
          retry
        </button>
        <button type="button" className="text-btn" onClick={clearError} aria-label="dismiss">
          <Icon name="x" size={14} />
        </button>
      </span>
    </div>
  )
}

function ComposerRoute({ mode }: { mode: 'new' | 'edit' | 'again' }) {
  const { id = '' } = useParams()
  return <Composer key={`${mode}:${id}`} mode={mode} />
}

/** Screens that are about a person need one. Plan and club pages stay open to anyone with the link. */
function RequireUser({ children }: { children: ReactNode }) {
  const { mode, auth } = useStore()
  const loc = useLocation()
  if (mode === 'remote' && auth === 'anon') return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname)}`} replace />
  return <>{children}</>
}

function Splash() {
  return (
    <div className="screen no-tabs" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh' }}>
      <div className="row gap-10 pop">
        <PieMark size={32} />
        <span className="wordmark">pie</span>
      </div>
    </div>
  )
}

const guarded = (el: ReactNode) => <RequireUser>{el}</RequireUser>

function Shell() {
  const { auth } = useStore()
  if (auth === 'loading') return <Splash />
  return (
    <div className="app">
      <ScrollToTop />
      <RoleBanner />
      <ErrorBanner />
      <Routes>
        <Route path="/" element={guarded(<Plans />)} />
        <Route path="/login" element={<Login />} />
        <Route path="/p/:id" element={<Plan />} />
        <Route path="/p/:id/chat" element={<Thread />} />
        <Route path="/p/:id/checkout" element={<Checkout />} />
        <Route path="/club/:id" element={<Club />} />
        <Route path="/discover" element={<Discover />} />
        <Route path="/you" element={guarded(<You />)} />
        <Route path="/host" element={guarded(<HostHome />)} />
        <Route path="/host/insights" element={guarded(<Insights />)} />
        <Route path="/host/club/new" element={guarded(<ClubNew />)} />
        <Route path="/host/new" element={guarded(<ComposerRoute mode="new" />)} />
        <Route path="/host/p/:id" element={guarded(<Roster />)} />
        <Route path="/host/p/:id/edit" element={guarded(<ComposerRoute mode="edit" />)} />
        <Route path="/host/again/:id" element={guarded(<ComposerRoute mode="again" />)} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <TabBar />
    </div>
  )
}

/** The hosted preview (an embedded page) cannot carry a hash route, so it uses an in-memory router. */
const Router = import.meta.env.VITE_ROUTER === 'memory' ? MemoryRouter : HashRouter

export function App() {
  return (
    <StoreProvider>
      <ToastProvider>
        <Router>
          <Shell />
        </Router>
      </ToastProvider>
    </StoreProvider>
  )
}
