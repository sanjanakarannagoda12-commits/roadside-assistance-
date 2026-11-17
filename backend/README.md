# Ridzo API

Node.js + Express + TypeScript backend for the Ridzo mechanic app. Supabase provides the Postgres database and file storage.

## Quick start (no database needed)

```bash
cd backend
npm install
cp .env.example .env      # then fill JWT_SECRET and OTP_SECRET (command is in the file)
npm run dev
```

With `DB_DRIVER=memory` and `SMS_PROVIDER=console`:
- Data is kept in memory and is lost when the server restarts.
- OTP codes are **printed in this terminal** instead of being sent by SMS.

## Connect Supabase (real database)

1. Create a project at https://supabase.com. The free tier is fine.
2. Go to **SQL Editor → New query**, paste [`supabase/migrations/001_init.sql`](supabase/migrations/001_init.sql), and click **Run**.
   This creates the tables and the private `mechanic-documents` storage bucket.
   Then do the same with [`002_admin_pricing.sql`](supabase/migrations/002_admin_pricing.sql) and [`003_jobs_dispatch.sql`](supabase/migrations/003_jobs_dispatch.sql), in that order.
   It adds admins, Ridzo's price list, the travel charge settings, a status for each document, and online status.
   Both files are safe to run again.
3. Go to **Project Settings → API Keys** and copy the **Project URL** and the **service_role** key.
4. In `backend/.env`:
   ```
   DB_DRIVER=supabase
   SUPABASE_URL=https://xxxx.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=eyJ...
   ```
5. Restart with `npm run dev`. The startup log should show `Database: supabase`.

> The service_role key can bypass all database security. Keep it in `backend/.env` only. Never put it in the mobile app, and never commit it.

## Send real SMS (Text.lk)

1. Sign up at https://text.lk. Trial accounts get a few free units.
2. In the **dashboard → Developers**, copy your **API Token**.
3. In the **dashboard → Sending → Sender ID**, request **`RIDZO`**. Approval usually takes a few hours to 1 business day.
4. In `backend/.env`:
   ```
   SMS_PROVIDER=textlk
   TEXTLK_API_TOKEN=your-token
   TEXTLK_SENDER_ID=RIDZO        # or TextLKDemo for a quick test only
   ```
5. Send one test SMS to your own phone. It costs 1 unit:
   ```bash
   npm run sms:test -- 0771234567
   ```
6. Restart the API with `npm run dev`. Login codes now arrive by SMS and are no longer printed in the terminal.

Notes:
- Text.lk's rules say **`TextLKDemo` must not be used for OTPs or production**. The server refuses to start with it when `NODE_ENV=production`.
- The OTP message is 75 plain characters, so it fits in **one SMS unit**. Avoid emoji: they switch the message to Unicode, which has a 70-character limit.
- If Text.lk rejects a message (for example because of low balance, a bad token or an unapproved sender), the app shows *"We couldn't send the SMS"*. The real reason is printed in the API terminal as `[sms] failed to send OTP via textlk: ...`. The failed attempt doesn't block the user from retrying.
- Codes are generated and hashed by this server (Text.lk `type: "plain"`). We don't use Text.lk's `{{OTP}}` feature, which keeps the gateway swappable.

## Admins and the admin web app

Admins sign in to the admin web app (`../admin`) with an email and password.
Admin accounts are stored in Supabase, so `DB_DRIVER=supabase` is required.

```bash
npm run admin:create -- you@example.com "Your Name"   # you'll be asked to type a password (hidden)
```

Running the same command again for an existing email resets that admin's password.

## Pricing (set by Ridzo, not by mechanics)

Mechanics only choose **which** services they do. Admins set the prices on the **Pricing** page of the admin app.

```
Travel  = call-out fee (covers the first 3 km)
        + per-km rate × km after that            (one-way road distance)
        × night multiplier from 22:00 to 06:00   (Sri Lanka time)
        capped at a maximum, rounded to Rs 10

Total   = services + travel + parts − discount   (a discount can't reduce travel)
Ridzo   = commission % × (services + parts − discount)   (travel goes 100% to the mechanic, unless turned on)
Payout  = total − Ridzo commission
```

The defaults are Rs 500 for the first 3 km, Rs 80 per km after that, ×1.25 at night, a Rs 3,000 cap, a 15 km maximum distance and 10% commission.
The code is in [`src/services/pricing.ts`](src/services/pricing.ts).

### Road distance (Google Maps)
- **With `GOOGLE_MAPS_API_KEY`** in `.env`, the Google Routes API (`computeRouteMatrix`) gives real road distance and a traffic-aware ETA. One request covers all candidate mechanics for a job. That distance is used for:
  - choosing the mechanic who **arrives first**;
  - the travel charge;
  - the customer's "X min away";
  - the admin Live issues page.
- **Without a key, or if Google fails**, it falls back to straight-line distance × road factor. Nothing breaks, and every offer records which source it used.
- Results are cached for 2 minutes per location, which keeps the Google bill small.
- To set it up: Google Cloud console → enable **Routes API** → **Credentials → Create API key** → restrict the key to the Routes API → put it in `backend/.env` → restart. `GET /health` then shows `"maps":"google"`.
- `GOOGLE_MAPS_TRAFFIC=false` uses the cheaper non-traffic routing. Check Google's Routes pricing page for current prices.

## Matching and dispatch

```
Customer request
  → find mechanics who are approved, online, have sent their location in the last 5 min, are free,
    are within 15 km by road, and offer the service
  → rank them: nearest first, then best rated
  → offer to ONE mechanic for 30 s
      accept  → job is theirs (atomic: first accept wins, every other offer is withdrawn)
      decline → straight to the next mechanic
      timeout → also offered to the next mechanic, but the first can STILL accept while nobody else has
  → nobody accepted within 5 min → "no_mechanic" (the customer is told)
```

- `dispatcher.tick()` runs every 2 seconds from `server.ts`. It times out offers, moves on to the next mechanic, gives up on old requests, and switches off mechanics whose GPS has gone quiet.
- Every step is a conditional update or a unique index in Postgres, so running several API servers at once is safe.
- **Location tracking** works like PickMe/Uber. While online or on a job, the app sends `POST /mechanic/location` about every 15 seconds:
  - It keeps sending **in the background** (the mechanic is in another app, or the screen is locked) when the app is a real build and the mechanic allowed location "All the time".
  - In Expo Go, it only sends while the app is open.
  - These updates are the heartbeat. With no update for 5 minutes, the mechanic is switched offline.
  - Points that arrive late or out of order never move the mechanic "back in time".
  - While on a job, every point is saved in `job_location_points`, which gives the customer a live map and you a record for disputes.
- **If the mechanic goes dark on the way** (no location for 10 minutes while the job is "accepted"):
  - a *tracking lost* alert opens and the mechanic gets an SMS asking them to open Ridzo;
  - the customer's job view says so and offers to find another mechanic;
  - support sees it on the admin app's **Live issues** page, where they can re-match, cancel or close it.
  - The alert closes by itself when location returns.
  - A re-match sends the job back to dispatch without that mechanic. Their app is told and they get an SMS.
- Acceptance rate is accepted ÷ (accepted + declined + timed out) over the last 30 days. It's shown on the mechanic's Home screen and in the admin app.
- Until the customer app exists, simulate a customer with `POST /dev/jobs`:
  ```bash
  curl -X POST http://localhost:4000/dev/jobs -H 'content-type: application/json' -d '{
    "customerName":"Test Customer","customerPhone":"0711234567","vehicle":"Silver Corolla","vehicleType":"Sedan",
    "issueSummary":"Flat tyre","issueCategory":"tyre","lat":7.2906,"lng":80.6337,
    "address":"Peradeniya Rd, Kandy","paymentMethod":"cash"}'
  ```
  Use coordinates near where your phone is. `GET /dev/jobs/<id>` shows the job's status.

## API

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | – | Server status |
| GET | `/catalog` | – | Specialties, Ridzo's services and prices, districts |
| POST | `/pricing/quote` | – | `{ serviceKeys, distanceKm }` or `{ serviceKeys, from, to }`, returns the travel charge and the bill |
| POST | `/auth/otp/send` | – | `{ phone }`, texts a 6-digit code |
| POST | `/auth/otp/verify` | – | `{ phone, code }`, returns tokens, `isNewUser` and `me`. **Sign-up and login are the same call.** |
| POST | `/auth/refresh` | – | `{ refreshToken }`, returns a new token pair (rotated) |
| POST | `/auth/logout` | – | `{ refreshToken }`, revokes the session |
| GET | `/me` | ✓ | Profile, status, each document's status and reason, services, online status |
| PUT | `/mechanic/profile` | ✓ | `{ fullName, email?, serviceArea }` |
| POST | `/mechanic/documents/:type` | ✓ | multipart `file` (`nic`, `license`, `certificate`, `toolkit`). Re-uploading resets that document to "waiting for review" |
| PUT | `/mechanic/services` | ✓ | `{ serviceKeys: ["tyre_change", ...] }` |
| POST | `/mechanic/submit` | ✓ | Sends for review. Refused while any document is missing or rejected |
| POST | `/mechanic/availability` | ✓ | `{ online, lat, lng }`. **Only approved mechanics can go online** (403 `not_approved`). A location is required to go online |
| POST | `/mechanic/online`, `/mechanic/offline` | ✓ | Shortcuts for the above. Going offline hands any pending offer to the next mechanic |
| POST | `/mechanic/location` | ✓ | `{ lat, lng, accuracyM?, speedMps?, heading?, recordedAt?, source? }`, about every 15 s while online. The route is recorded during jobs |
| GET | `/mechanic/dashboard` | ✓ | Today's earnings, jobs today, rating, specialty, acceptance rate |
| GET / PUT | `/mechanic/profile` | ✓ | The name is locked once the NIC has been checked |
| POST / GET | `/mechanic/avatar` | ✓ | Profile photo (JPG/PNG, max 2 MB) |
| GET | `/mechanic/services` | ✓ | My services plus Ridzo's price list |
| GET | `/mechanic/offers/current` | ✓ | The job offered to me now, or one I missed that's still open |
| GET | `/jobs/:id/offer` | ✓ | `pending`, `missed`, `taken`, `closed`, `declined` or `accepted` |
| POST | `/jobs/:id/accept`, `/jobs/:id/decline` | ✓ | Accept is atomic (409 `job_taken`) |
| GET | `/mechanic/active-job` | ✓ | Resume after an app restart |
| POST | `/jobs/:id/arrived`, `/start`, `/bill`, `/complete`, `/cancel`, `/rate-customer` | ✓ | Job steps, in order. The server calculates the bill. `/start` needs the before photo |
| POST / GET | `/jobs/:id/photos/before`, `/jobs/:id/photos/after` | ✓ | Job photos (JPG/PNG, max 5 MB, private). Also readable by admins (`/admin/jobs/:id/photos/:kind`) and the customer |
| POST | `/admin/auth/login` | – | `{ email, password }`, returns an 8-hour admin token |
| GET | `/admin/mechanics` | admin | `?status=pending_review&search=&page=`, the review queue |
| GET | `/admin/mechanics/:id` | admin | Details, documents, services, history |
| GET | `/admin/mechanics/:id/documents/:type` | admin | The private document file |
| POST | `/admin/mechanics/:id/review` | admin | `{ documents: { nic: { status: "approved" } \| { status: "rejected", reason }, ... }, note? }`, then SMS the mechanic |
| POST | `/admin/mechanics/:id/suspend` | admin | `{ reason }`, takes them offline and blocks going online |
| POST | `/admin/mechanics/:id/reinstate` | admin | Approved again |
| GET / PATCH | `/admin/catalog`, `/admin/catalog/:key` | admin | Service prices and whether each service is offered |
| GET / PUT | `/admin/pricing` | admin | Travel formula and commission (returns worked examples) |
| POST | `/dev/review` | dev only | `{ phone, decision: "approve" \| "reject", reason? }` |
| POST / GET | `/dev/jobs`, `/dev/jobs/:id` | dev only | Fake customer request / its status, live mechanic position, `trackingLost` (also `/cancel`, `/rematch`, `/rate`) |
| GET | `/jobs/:id/mine` | ✓ | `yours`, `completed`, `cancelled` or `reassigned`. The app checks this every 10 s during a job |
| GET | `/admin/alerts` | admin | Live issues |
| POST | `/admin/jobs/:id/rematch`, `/admin/jobs/:id/cancel`, `/admin/alerts/:id/dismiss` | admin | Support actions (all audited) |

Mechanic tokens and admin tokens can't be used in place of each other. Every admin action is recorded in `admin_audit_log`.

Every error has the same shape:
```json
{ "error": { "code": "validation_error", "message": "...", "fields": { "fullName": "..." } } }
```

### Security rules built in
- **OTP codes:** 6 digits, valid for 5 minutes, single use, stored only as an HMAC hash. 30 seconds between sends, at most 5 per hour per number, and at most 5 wrong attempts per code.
- **Rate limiting:** 40 auth requests per 15 minutes per IP address.
- **Tokens:** access tokens are JWTs that last 15 minutes. Refresh tokens last 30 days, are stored hashed, and are replaced on every use. If an old refresh token is used again, all of that user's sessions are logged out.
- **Document uploads:** JPG, PNG, HEIC or PDF only, up to 5 MB, and the file contents are checked to match the stated type.
- **Database access:** RLS is enabled on every table with no policies, so only this API (using the service_role key) can read or write.

## Tests

```bash
npm test
```

86 tests cover:
- sign-up, login and onboarding
- OTP security, sessions and validation
- the Text.lk integration (with a fake network)
- admin review of each document, suspension and the go-online rule
- the price list and the fee formula
- tracking-lost alerts, re-match and cancel
- the Google Routes client (faked network: request format, out-of-order results, fallback, cache), ranking by road ETA, and job photos
- matching, the 30-second offer, late accept, atomic accept, GPS time-out, the job lifecycle, the dashboard and the profile They use the in-memory database, so they don't need Supabase.

## Testing sign-up and login with the app

1. Start the API with `npm run dev` (from the project root: `npm run api`). Note the **Network** URL it prints.
2. In the project root, `.env.local` must contain `EXPO_PUBLIC_API_URL=<that Network URL>`. Your phone must be on the same Wi-Fi.
3. Start the app with `npx expo start`.
4. **Sign up:** enter a new number and copy the code from the API terminal. You'll go through Basic details, Documents, Services & prices, and land on Under review.
5. **Log in:** close the app completely and reopen it. You stay logged in. Log out, then log in with the same number: you return to Under review with your data intact.
6. **Review:** open the admin app (`npm run admin` from the project root, then go to http://localhost:3001), open the mechanic from the **Review queue**, and approve or reject each document.
   Then tap **Check status** in the app.
7. **Reject a document:** the app shows, for example, *"NIC: Rejected — Photo is blurry"*. Only that document has to be uploaded again before resubmitting.
8. **Go online:** this only works once approved, and needs location permission. Suspending a mechanic in the admin app takes them offline.
9. **Get a job:** while online on Home, run the `POST /dev/jobs` command above with coordinates near your phone. The request appears within about 4 seconds.
