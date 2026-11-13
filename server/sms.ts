/**
 * The one notification channel. Twilio when configured, otherwise a console transport that
 * prints every text and keeps it in memory so the pilot can be demoed without a carrier.
 */
export interface SmsResult {
  status: 'sent' | 'failed'
  detail?: string
}

export interface SmsTransport {
  name: 'console' | 'twilio'
  send(to: string, body: string): Promise<SmsResult>
}

export interface ConsoleEntry {
  at: string
  to: string
  body: string
}

export class ConsoleSms implements SmsTransport {
  name = 'console' as const
  log: ConsoleEntry[] = []
  /** Phone numbers that fail on purpose, for rehearsing retry. */
  failing = new Set<string>()

  async send(to: string, body: string): Promise<SmsResult> {
    const at = new Date().toISOString()
    this.log.push({ at, to, body })
    if (this.log.length > 500) this.log.shift()
    if (this.failing.has(to)) {
      this.failing.delete(to)
      console.log(`[sms] FAILED  ${to}: ${body}`)
      return { status: 'failed', detail: 'simulated carrier failure' }
    }
    console.log(`[sms] -> ${to}: ${body}`)
    return { status: 'sent' }
  }
}

export class TwilioSms implements SmsTransport {
  name = 'twilio' as const
  constructor(
    private sid: string,
    private token: string,
    private from: string,
  ) {}

  async send(to: string, body: string): Promise<SmsResult> {
    try {
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${this.sid}/Messages.json`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.sid}:${this.token}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: to, From: this.from, Body: body }),
      })
      if (!res.ok) return { status: 'failed', detail: `twilio ${res.status}` }
      return { status: 'sent' }
    } catch (e) {
      return { status: 'failed', detail: (e as Error).message }
    }
  }
}

export function makeSms(env: NodeJS.ProcessEnv): SmsTransport {
  if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM) return new TwilioSms(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN, env.TWILIO_FROM)
  return new ConsoleSms()
}
