import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useStore } from '../lib/store'
import { PieMark } from '../components/Icon'
import { TopBar } from '../components/ui'

/** Phone, code, name. The minimum identity needed to save and retrieve an RSVP. */
export function Login() {
  const { startLogin, verifyLogin, me, dispatch, mode } = useStore()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const next = params.get('next') ?? '/'
  const [step, setStep] = useState<'phone' | 'code' | 'name'>('phone')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [devCode, setDevCode] = useState<string | undefined>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const start = async () => {
    setBusy(true)
    setError('')
    try {
      const dc = await startLogin(phone)
      setDevCode(dc)
      if (dc) setCode(dc)
      setStep('code')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const verify = async () => {
    setBusy(true)
    setError('')
    try {
      await verifyLogin(phone, code)
      setStep('name')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const finish = async () => {
    if (name.trim()) await dispatch({ type: 'you', patch: { name: name.trim() } })
    nav(next, { replace: true })
  }

  if (mode !== 'remote') {
    return (
      <div className="screen">
        <TopBar back="/" />
        <div className="pad stack gap-12">
          <h1 className="title">no sign-in needed</h1>
        </div>
      </div>
    )
  }

  return (
    <div className="screen no-tabs">
      <TopBar back={next} />
      <div className="pad stack gap-16" style={{ paddingTop: 24 }}>
        <PieMark size={40} />
        <h1 className="title">{step === 'name' ? 'your name' : step === 'code' ? 'check your texts' : 'sign in'}</h1>
        {step === 'code' && <p className="body muted">code sent to {phone}</p>}

        {step === 'phone' && (
          <form
            className="stack gap-12"
            onSubmit={(e) => {
              e.preventDefault()
              void start()
            }}
          >
            <div className="field">
              <label htmlFor="lg-phone">phone</label>
              <input id="lg-phone" className="input" type="tel" inputMode="tel" autoComplete="tel" autoFocus placeholder="+1 212 555 0100" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            {error && <span className="hint error">{error}</span>}
            <button type="submit" className="btn btn-primary" disabled={busy || phone.replace(/\D/g, '').length < 8}>
              send code
            </button>
            {me?.sms === 'console' && <span className="hint center">demo: the code appears on the next screen</span>}
          </form>
        )}

        {step === 'code' && (
          <form
            className="stack gap-12"
            onSubmit={(e) => {
              e.preventDefault()
              void verify()
            }}
          >
            <div className="field">
              <label htmlFor="lg-code">code</label>
              <input id="lg-code" className="input" inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} style={{ fontFamily: 'var(--mono)', fontSize: 24, letterSpacing: '0.2em' }} />
              {devCode && <span className="hint lime">demo code · {devCode}</span>}
            </div>
            {error && <span className="hint error">{error}</span>}
            <button type="submit" className="btn btn-primary" disabled={busy || code.length < 6}>
              sign in
            </button>
            <button type="button" className="text-btn" style={{ alignSelf: 'center' }} onClick={() => setStep('phone')}>
              wrong number?
            </button>
          </form>
        )}

        {step === 'name' && (
          <form
            className="stack gap-12"
            onSubmit={(e) => {
              e.preventDefault()
              void finish()
            }}
          >
            <div className="field">
              <label htmlFor="lg-name">name</label>
              <input id="lg-name" className="input" autoComplete="name" autoFocus placeholder={me?.user?.name || 'what people call you'} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <button type="submit" className="btn btn-primary" disabled={!name.trim() && !me?.user?.name}>
              {me?.user?.name && !name.trim() ? `keep ${me.user.name}` : 'done'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
