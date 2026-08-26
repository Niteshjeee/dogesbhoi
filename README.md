# Doges — Cloudflare Pages street-dog safety MVP

A zero-paid-service MVP for permanent dog QR profiles, consent-based sightings, location history, notes, suspicious-location review, and a server-protected admin dashboard.

## What is included

- Permanent URLs such as `https://doges.pages.dev/d/DG-...`
- QR generation in the browser; changing dog data never changes the QR URL
- Public dog profile + accepted location-history map
- Scanner-controlled geolocation permission
- Optional 250-character sighting note + condition tags
- Cloudflare Turnstile on public sightings and admin login
- D1 database with prepared/bound SQL statements
- Suspicious jump / speed / poor-GPS checks
- Public history contains accepted sightings only
- Admin moderation for held sightings
- Admin password stored only as a PBKDF2 hash in a Cloudflare secret
- Signed `HttpOnly; Secure; SameSite=Strict` admin session cookie
- Hashed reporter fingerprint for rate limiting; raw IP is not stored
- `_routes.json` sends only `/api/*` through Pages Functions so static pages do not consume Function requests
- No R2, paid map API, SMS, email provider, or other paid service is required

## Cloudflare architecture

`Cloudflare Pages (static Vite site) -> Pages Functions -> D1`

Cloudflare documents that Pages Functions run on the Workers runtime and can be used for authentication and form handling. D1 can be bound directly to Pages Functions.

## 1. Install and build

```bash
npm install
npm run build
```

Build output: `dist/`

## 2. Create D1

In Cloudflare Dashboard create a D1 database, for example `doges-db`.

Run `migrations/0001_init.sql` against that database. You can do this from the D1 dashboard SQL console or with Wrangler.

Bind the database to the Pages project with **Variable name exactly `DB`**:

`Workers & Pages -> your Pages project -> Settings -> Bindings -> Add -> D1 database`

Redeploy after adding the binding.

## 3. Create Turnstile

Create one Managed Turnstile widget for your Pages hostname (for example `doges.pages.dev`).

Set these Pages environment variables/secrets:

- `TURNSTILE_SITE_KEY` — public widget site key
- `TURNSTILE_SECRET_KEY` — secret key; keep secret

The app uses action names `sighting` and `admin_login`, and the Function verifies tokens server-side.

## 4. Generate admin secrets safely

Use a strong password with at least 12 characters. Do not put the password in source code.

On macOS/Linux:

```bash
read -s ADMIN_PASSWORD
export ADMIN_PASSWORD
npm run make-admin-hash
unset ADMIN_PASSWORD
```

The script prints three values:

- `ADMIN_PASSWORD_HASH`
- `SESSION_SECRET`
- `IP_HASH_SECRET`

Add each as a **secret** in the Cloudflare Pages project. Also add:

- `ADMIN_USERNAME` — e.g. `admin-doges`

Never commit the printed secret values to Git.

Rotating `SESSION_SECRET` immediately invalidates every old admin login cookie.

## 5. Deploy to Pages

For a Git-connected Pages project:

- Framework preset: Vite
- Build command: `npm run build`
- Build output directory: `dist`

Keep the `/functions` directory at repository root. Cloudflare turns those files into Pages Functions automatically.

## 6. Security checklist before public launch

1. D1 binding name is exactly `DB`.
2. All six environment values exist: `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, `SESSION_SECRET`, `IP_HASH_SECRET`.
3. Turnstile hostname is restricted to your real Pages/custom hostname.
4. Do not enable R2/paid add-ons if your requirement is strictly no billing.
5. Test that `/admin` cannot load dashboard data after logout.
6. Submit an intentionally huge location jump and confirm it appears as `review`, not public history.
7. Use a second browser/device near the last accepted location and confirm corroboration can raise confidence.
8. Keep Cloudflare account 2FA enabled.

## How sighting trust works in this MVP

A report is never accepted merely because a QR was scanned. It must pass Turnstile and location validation first.

- GPS accuracy over 500 m -> held for review
- Large short-time location jump / speed over 120 km/h -> held for review
- Same reporter: max 3 reports per dog in 10 minutes
- Same reporter: max 20 reports total per hour
- A different reporter within 500 m of the previous accepted sighting within 6 hours can raise confidence to high
- Held/rejected reports are never returned by the public dog API

This cannot cryptographically prove that a phone is physically beside a dog; a static QR can be photographed and device GPS can be spoofed. The design therefore treats submissions as **sightings**, not unquestionable truth.

## Free-tier / billing philosophy

This repository deliberately contains no paid API integration. It uses Pages static hosting, Pages Functions, D1 and Turnstile only. Cloudflare plan limits/pricing can change over time, so check the current dashboard before launch and do not opt into paid plans or paid bindings if your requirement is strictly ₹0.

The application itself never contains code that upgrades a Cloudflare plan or buys usage.

## Map note

The history map uses Leaflet with OpenStreetMap's public standard tile server. This has no billing integration in this project, but OpenStreetMap's public tile service has a usage policy and is not intended for heavy commercial-scale traffic. For a small community MVP it keeps the project simple; if traffic becomes large, switch to an appropriate tile provider or self-hosted tiles after reviewing costs/limits.
