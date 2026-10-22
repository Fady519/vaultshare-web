import { http, HttpResponse } from 'msw'
import { db } from '../db'
import { currentTotp, secondsLeft } from '../totp'

/*
  Not part of the API contract. These exist only in the mock so the flows can be
  clicked through without a mail server or a phone:
  - /__dev/outbox  the emails the "server" sent (verify codes, recovery links)
  - /__dev/totp    the current authenticator code for an account
  - /__dev/ping    lets the app check the mock is really the one answering
*/
export const devHandlers = [
  http.get('/__dev/ping', () => HttpResponse.json({ mock: true })),

  http.get('/__dev/outbox', ({ request }) => {
    const to = new URL(request.url).searchParams.get('to')?.toLowerCase()
    return HttpResponse.json(db.outbox.filter((m) => !to || m.to === to).slice(0, 5))
  }),

  http.get('/__dev/totp', async ({ request }) => {
    const email = new URL(request.url).searchParams.get('email')?.toLowerCase()
    const user = db.users.find((u) => u.email === email)
    // newest totp factor, confirmed or still being set up
    const factor = user
      ? db.factors.filter((f) => f.userId === user.id && f.type === 'totp' && f.secret).pop()
      : undefined
    if (!factor?.secret) return HttpResponse.json({ code: null, secondsLeft: 0 })
    return HttpResponse.json({ code: await currentTotp(factor.secret), secondsLeft: secondsLeft() })
  }),
]
