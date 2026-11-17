# Ridzo Admin

Web dashboard for Ridzo staff, built with Next.js 16.

- **Review queue:** check each mechanic's NIC, licence, certificate and toolkit photo. Approve or reject each one with a reason. The mechanic gets an SMS.
- **Mechanics:** search everyone, see who is online, suspend or reinstate.
- **Live issues:** mechanics on the way to a customer who stopped sharing location for 10+ minutes. From there you can call either side, find the customer another mechanic, cancel, or close the issue. The page refreshes every 20 seconds.
- **Pricing:** service prices, travel-charge formula, night rate, maximum distance and commission.

## Run it

```bash
# 1. The API must be running (from the project root)
npm run api

# 2. Create your admin login (once, from backend/)
cd backend && npm run admin:create -- you@example.com "Your Name"

# 3. Start the admin app (from the project root)
npm run admin          # http://localhost:3001
```

`admin/.env.local` sets where the API is:
```
RIDZO_API_URL=http://localhost:4000
```

## How it's secured
- Every page and form talks to the Ridzo API **from this server**. The browser never sees the API address or the admin token.
- The admin token is kept in an `httpOnly`, `SameSite=Strict` cookie, which is `Secure` in production. It lasts 8 hours.
- The API checks the admin token on every request. `proxy.ts` only redirects signed-out visitors to `/login` for convenience.
- Mechanic documents are streamed through `/api/documents/...` with `Cache-Control: no-store`. They are never public URLs.
- Every approve, reject, suspend and price change is recorded in the API's `admin_audit_log`, along with the admin who did it.
