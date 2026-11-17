# Deploying Ridzo (staging) and building the Android APK

## 1. Deploy the API with HTTPS (Render)
1. Create an account at https://render.com and connect GitHub. Allow it access to this repo.
2. In the Render dashboard, go to **New → Blueprint**, then pick this repo and the branch to deploy. Render reads [`render.yaml`](render.yaml).
3. Render asks for the secret values. These are never stored in git:
   | Key | Where to find it |
   |---|---|
   | `SUPABASE_URL` | Supabase → Project Settings → API |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API Keys → `service_role` |
   | `TEXTLK_API_TOKEN`, `TEXTLK_SENDER_ID` | Text.lk dashboard (leave empty while `SMS_PROVIDER=console`) |
   | `GOOGLE_MAPS_API_KEY` | Google Cloud → Credentials (the Routes API must be **enabled**) |
4. Click **Apply** and wait for the deploy. Open `https://<your-service>.onrender.com/health`. You should see `{"ok":true,"env":"staging",...}`.

**Plan and region:**
- It runs in **Singapore** (closest to Sri Lanka) on the smallest always-on plan.
- Don't use the Free plan. It sleeps after 15 minutes without traffic, which stops dispatch, offer time-outs and alerts.

**Logging in on staging:**
- `SMS_PROVIDER=console`, so login codes appear in **Render → Logs**, not by SMS.
- Switch to `textlk` once your `RIDZO` sender ID is approved.

**Test tools on staging** (fake customer requests, approvals) need the secret header:
```bash
curl -X POST https://<your-service>.onrender.com/dev/jobs \
  -H "x-dev-token: <DEV_ROUTES_TOKEN from Render → Environment>" -H 'content-type: application/json' -d '{ ... }'
```
Without the header these routes return 404. On `APP_ENV=production` they don't exist at all.

## 2. Build the APK (EAS)
1. Put your Render URL in [`eas.json`](eas.json): `EXPO_PUBLIC_API_URL` in the `preview` and `production` profiles. It must be `https://`. Release builds refuse plain `http://`.
2. Build:
   ```bash
   npx eas-cli build --platform android --profile preview
   ```
   EAS creates the Android signing key and stores it securely on first build. Back it up from **expo.dev → project → Credentials**.
3. When the build finishes, EAS shows a link and a QR code. Open it on an Android phone to install. Android will ask to allow installing from that source.

**Profiles:**
- `preview` builds an **APK** for testers.
- `production` builds an **AAB** for Google Play. Play requires AAB.

## What makes this build "release-safe"
- **HTTPS only:** plain-HTTP traffic is blocked (`usesCleartextTraffic: false`), and the app refuses a non-HTTPS API address.
- **App backups off** (`allowBackup: false`): login tokens can't be copied off the phone via backups.
- **Unused permissions removed:** microphone, draw-over-other-apps, broad storage.
- **Smaller and obfuscated:** R8 code shrinking/obfuscation and resource shrinking are on, and the network inspector is off.
- **Properly signed:** the build is signed with a release key managed by EAS. Version numbers increase automatically on each build.
- **Server:** runs as a non-root user in a two-stage Docker image with production dependencies only. It sits behind HTTPS, uses real client IPs for rate limits, and keeps its secrets in Render only.
