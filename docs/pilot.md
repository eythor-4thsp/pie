# Running the two-dinner pilot

This is the runbook for the Weeks 2 to 6 pilot: one organizer with a real recurring group, two dinners, one notification channel.

## What the server guarantees

- **Identity.** A phone number plus a 6-digit code. No passwords. A returning guest on the same number gets the same RSVP back. Sessions are httpOnly cookies that last 90 days.
- **Access.** A plan for "invited people" is only readable by the invited phone numbers, the host, and helpers. Anyone else sees the title, host, date, and neighborhood, with no address, roster, or notes. A forwarded link exposes nothing private. Revoking an invitation is removing the person from the roster's invite list.
- **One seat per guest.** The server applies every action in order, in one process. Two people racing for the last seat produce exactly one confirmation and one waitlist spot. Repeated taps are no-ops.
- **Changes are saved before they are sent.** A day-of change writes the plan, then queues one text per confirmed guest, then records sent or failed per person. Retry resends only the failures. The original link always shows the current details or the cancellation.
- **Audit.** Every applied action is recorded with its actor and time in the `audit` table.

## Set up

```bash
cp .env.example .env            # fill in PUBLIC_URL and, for real texts, the Twilio values
npm install
npm run build                   # the PWA
npm run build:server            # server-dist/index.mjs
npm start                       # serves the app and the API on PORT
```

Or `docker build -t pie . && docker run -p 8787:8787 -v pie-data:/data pie`.

Without Twilio values the server runs in demo mode: texts print to the server log, and login codes appear inside the sign-in screen. With Twilio set, codes and plan texts go out as SMS and nothing is shown in the app.

The first start with an empty database seeds the fictional club so the demos work. Set `SEED=0` for a clean pilot database. The fictional people's numbers are `+1 212 555 0101` through `0110`; the demo guest is `+1 212 555 0100`.

## The host's week

1. **Publish.** Make a plan, pick "invited people", pick the audience, publish, copy the link. The composer records the minutes from first draft to publish.
2. **Invite by phone.** From the roster, "invite more" takes a phone number and a name. The guest gets one text with the link. Their number is their sign-in.
3. **Watch the roster.** Going, pending, waiting, passed, seats left. Pending means invited with no answer; the guest sees the current plan whenever they open the link.
4. **Change the plan once.** "Update the meeting point" previews who will be texted, saves once, and shows sent or failed per person. Retry only touches failures.
5. **After dinner.** Mark who came (intent and attendance are kept apart), then the debrief: minutes to publish, things fixed by hand, texts sent outside pie, one line of notes.
6. **Plan this again.** Title, venue, and club carry over. A fresh date is required. The audience review shows members who want invitations plus previous guests, deduplicated, with opt-outs and blocks excluded by name.

## Measures

All five are computed on the host's "numbers" screen from the records above, counts beside every rate.

| Measure | Definition in the product |
| - | - |
| Guest conversion | People who said yes over identified people who opened the invitation. Anonymous opens and link previews are not counted, so the number can overstate but never hides an abandoned step. |
| Show-up rate | People marked as came over people who were confirmed. Requires the host to reconcile the roster. |
| Repeat attendance | Dinner-one attendees who came to dinner two, over dinner-one attendees who were eligible and invited back. |
| Host effort | Minutes to publish (auto-clocked, editable), manual interventions, and logistics texts outside pie, from the debrief. |
| Host retention | Whether the host published a repeat plan on their own. |

Agree on these before invitations go out. Exclude host tests from guest counts by reconciling the roster after each dinner.

## Decision rules

- Guests RSVP but do not come: investigate logistics and reminders before adding supply.
- Guests come but the host does not repeat: watch the host prepare the next gathering with their usual tools.
- Expansion signal: at least two independent hosts publish a second event, guests attend both cycles, and hosts report less coordination work.

## Public discovery gate

The numbers screen shows supply per upcoming weekend for the pilot neighborhood. The proposed launch condition is three bookable public plans from two hosts for three successive weekends. Reports and blocks live on the club page and must have an owner before discovery opens.

## Demos

- **A text from Maya.** Guest mode. Open the invitation from the "texts you got" list, say yes, find the table, withdraw.
- **The table moved.** Two phones. Maya updates the meeting point on one; the guest reopens yesterday's link on the other. Try a forwarded private link, a duplicate RSVP, and a retried text.
- **Same club, next Friday.** Maya makes one dinner from scratch and one with "plan this again". Compare the audience lists.
- **A free evening.** Discovery with and without the familiar-face cue (the eye button).

Three alternate endings are one tap away on the "you" tab in local mode: a forwarded private invite, a full dinner with a waitlist, a canceled plan, and a paid dinner with checkout.
