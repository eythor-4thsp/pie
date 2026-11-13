# pie

Plans that actually happen. A mobile-first progressive web app for a recurring West Village supper club: a guest arrives from a text, decides whether to go, and finds the table. A host publishes the plan, changes it once on the day, and reliably reaches the guests affected. The product earns a second use when the host brings the group back together with less work.

Two ways to run it:

- **Local demo.** The PWA alone, with fictional people and a simulated text channel, everything in the browser. Good for the clickable demos.
- **Pilot.** The same app served by a small Node server: phone sign-in, real access rules, persistent RSVPs, one SMS channel, an audit log. Two phones see one roster.

## Run it

```bash
npm install
npm run dev          # local demo at http://localhost:5173
```

```bash
npm run build        # type-check and build the PWA into dist/
npm run server       # pilot server at http://localhost:8787, serving dist/ and the API
```

```bash
npm test             # reducer tests and an end-to-end server test
```

Production: `npm run build && npm run build:server && npm start`, or the Dockerfile. Copy `.env.example` to `.env`; without Twilio values the server runs in demo mode and shows login codes in the app. See `docs/pilot.md` for the pilot runbook and the measurement definitions.

## What's in it

| Roadmap item | Where |
| - | - |
| Accept an invitation: preview, "i'm in", minimal identity, confirmed state with pinned meeting point, calendar file, withdraw, returning guest sees their response | `src/screens/Plan.tsx` |
| Full dinner with a waitlist, time-limited seat offers, lapsed offers; canceled plan; forwarded private link shows only the public preview | `Plan.tsx`, `src/core/reducer.ts` |
| Host composer: title, date and local time, venue, host note, capacity, cost and how it is paid, audience with its consequence, club, invite picker, photo or poster, save draft, preview as guest, publish once, copy link | `src/screens/Composer.tsx` |
| Roster: going, pending, waiting, passed, seats left; invite more (by phone on the pilot); helpers with limited rights; refunds; cancel | `src/screens/Roster.tsx` |
| Day-of change: preview recipients, save once, per-recipient delivery, retry that resends only failures, a text log | `Roster.tsx`, `reducer.ts`, `server/sms.ts` |
| Thread with the meeting point pinned above the chat, for people who are in | `src/screens/Thread.tsx` |
| Club home: organizer, cadence, join or request access, invitation preference, directory with per-member visibility, announcements, reports and blocks, earlier dinners | `src/screens/Club.tsx` |
| Plan this again: title, venue, club carried over; fresh date required; audience review merges members and previous guests, deduplicates, excludes opt-outs and blocks by name | `Composer.tsx` in `again` mode, `reviewAudience` in `src/core/select.ts` |
| Discovery: neighborhood, this weekend, free, friends going, familiar-face cue that can be switched off for testing | `src/screens/Discover.tsx` |
| Paid gatherings: seat held during checkout, one charge to one ticket to one seat, declined cards release the hold, host refunds, text receipt | `src/screens/Checkout.tsx`, `reducer.ts` |
| Organizer insights: seats filled, show-up rate, guest conversion, new vs returning, host effort from the debrief, repeat attendance, compare two dinners, discovery supply gate | `src/screens/Insights.tsx`, `src/core/metrics.ts` |
| Host debrief and attendance reconciliation after each dinner | `Roster.tsx` |
| Phone sign-in, sessions, personalized state, access rules, SQLite persistence, audit log, SMS transport | `server/` |
| Install prompt, standalone detection, iOS instructions, service worker, manifest | `src/lib/pwa.ts`, `vite.config.ts` |

## How it is built

The rules of the product live in one pure module, `src/core/`, and both the browser and the server run it:

- `types.ts` is the record model: plans with revisions and an update log, one RSVP per guest per plan, tickets, texts, clubs.
- `reducer.ts` applies actions. Capacity, waitlist offers, holds, publish idempotency, retry semantics, and the `allowed` permission table all live here, so the demo and the pilot cannot disagree.
- `select.ts` and `metrics.ts` are read-only views: who can see a plan, seats left, the audience review, the pilot measures.

The browser store (`src/lib/store.tsx`) runs the reducer directly in local mode with a simulated text transport, or sends every action to `POST /api/act` in pilot mode. The server (`server/index.ts`) checks the session, rewrites "you" to the real user, checks `allowed`, applies the reducer, persists only changed documents to SQLite via `node:sqlite`, then hands pending texts to the transport and records the result per recipient.

The server returns a personalized state: the current user is always `you`, restricted plans arrive redacted, rosters and texts are filtered by role. The screens never need to know which mode they are in beyond sign-in.

## Design

Tokens are at the top of `src/styles/global.css`: near-black ground, charcoal surfaces, cosmic latte text, key lime for the one primary action, muted gray for secondary text, hairline borders at 10% white, cherry for destructive actions. Instrument Serif for titles and the wordmark, Space Mono for times and metadata, Greycliff CF for everything else with Figtree as the web fallback. Action labels are lowercase; names, addresses, and times are conventional.

The hero image for Friday dumplings is an illustration rendered for the prototype. Swap in a candid 4:3 photo of the actual dinner.

## Not done

- The payment processor is a test double. Wire a real one behind the `hold` and `pay` actions and drive `pay` from its webhook.
- SMS delivery is Twilio or console. Carrier delivery receipts are not polled; "sent" means the API accepted the message.
- Push notifications and email are not channels yet. Texts are the one consented channel.
- Host stipends and referral payouts are deliberately absent; the roadmap calls them a later business experiment.
