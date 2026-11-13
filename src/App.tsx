import { useEffect, type ReactNode } from 'react'
import { HashRouter, MemoryRouter, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { StoreProvider, useStore } from './lib/store'
import { ToastProvider } from './components/ui'
import { TabBar } from './components/TabBar'
import { PieMark } from './components/Icon'
import { Plans } from './screens/Plans'
import { Plan } from './screens/Plan'
import { Thread } from './screens/Thread'
import { Club } from './screens/Club'
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

function Shell() {
  const { auth } = useStore()
  if (auth === 'loading') return <Splash />
  return (
    <div className="app">
      <ScrollToTop />
      <RoleBanner />
      <Routes>
        <Route
          path="/"
          element={
            <RequireUser>
              <Plans />
            </RequireUser>
          }
        />
        <Route path="/login" element={<Login />} />
        <Route path="/p/:id" element={<Plan />} />
        <Route path="/p/:id/chat" element={<Thread />} />
        <Route path="/p/:id/checkout" element={<Checkout />} />
        <Route path="/club/:id" element={<Club />} />
        <Route path="/discover" element={<Discover />} />
        <Route
          path="/you"
          element={
            <RequireUser>
              <You />
            </RequireUser>
          }
        />
        <Route
          path="/host"
          element={
            <RequireUser>
              <HostHome />
            </RequireUser>
          }
        />
        <Route
          path="/host/insights"
          element={
            <RequireUser>
              <Insights />
            </RequireUser>
          }
        />
        <Route
          path="/host/new"
          element={
            <RequireUser>
              <ComposerRoute mode="new" />
            </RequireUser>
          }
        />
        <Route
          path="/host/p/:id"
          element={
            <RequireUser>
              <Roster />
            </RequireUser>
          }
        />
        <Route
          path="/host/p/:id/edit"
          element={
            <RequireUser>
              <ComposerRoute mode="edit" />
            </RequireUser>
          }
        />
        <Route
          path="/host/again/:id"
          element={
            <RequireUser>
              <ComposerRoute mode="again" />
            </RequireUser>
          }
        />
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
