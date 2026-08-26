# Doges v2 — Cloudflare Pages street-dog safety network

Fresh Cloudflare Pages + Pages Functions + D1 build with:

- permanent dog QR URLs
- consent-based location sightings
- public accepted location history
- optional sighting notes + condition tags
- suspicious-location moderation
- Cloudflare Turnstile on public sightings and admin login
- **multiple admin accounts**
- owner/admin roles
- revocable signed admin sessions
- D1-prepared SQL
- hashed reporter fingerprint (raw IP is not stored)
- no R2, SMS, email provider, paid maps, or other paid integration

## Important change from v1

Admin usernames/password hashes are **not Cloudflare environment variables anymore**.

Admins now live in the D1 `admins` table. This fixes the old single-admin setup and supports multiple admins.

Cloudflare secrets now only contain platform secrets:

- `TURNSTILE_SECRET_KEY`
- `SESSION_SECRET`
- `IP_HASH_SECRET`

Text variables:

- `TURNSTILE_SITE_KEY`
- `TURNSTILE_HOSTNAMES`

D1 binding:

- `DB` -> your D1 database

Old `ADMIN_USERNAME` / `ADMIN_PASSWORD_HASH` variables are ignored by v2 and may be deleted after v2 works.

---

## 1. Build settings

Cloudflare Pages:

- Production branch: `main`
- Framework preset: None
- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: blank

The repository `/functions` directory is compiled as Pages Functions.

There is intentionally **no `_redirects` file**. Cloudflare Pages SPA fallback handles `/dog/...` routes when no custom `404.html` is present.

---

## 2. D1 migrations

### If you already use the original Doges database

Your old `dogs` and `sightings` tables can stay.

Run only:

`migrations/0002_multi_admin.sql`

in:

Cloudflare Dashboard -> D1 -> `doges-db` -> Console

### If this is a completely new D1 database

Run, in order:

1. `migrations/0001_init.sql`
2. `migrations/0002_multi_admin.sql`

Then confirm:

```sql
SELECT name
FROM sqlite_master
WHERE type='table'
ORDER BY name;
```

You should see at least:

- `dogs`
- `sightings`
- `admins`
- `admin_auth_attempts`
- `admin_audit`

---

## 3. Cloudflare Pages variables and secrets

Pages project -> Settings -> Variables and secrets.

### Text

```text
TURNSTILE_SITE_KEY=<your public Turnstile site key>
TURNSTILE_HOSTNAMES=dogesbhoi.pages.dev
```

If you later add a custom hostname, comma-separate allowed hostnames:

```text
TURNSTILE_HOSTNAMES=dogesbhoi.pages.dev,doges.example
```

Do not include `https://`.

### Secret

```text
TURNSTILE_SECRET_KEY=<Turnstile secret>
SESSION_SECRET=<random secret>
IP_HASH_SECRET=<random secret>
```

Generate the last two locally:

```bash
npm run make-secrets
```

Copy only the values after `=` into Cloudflare.

Do not commit them to Git.

### D1 binding

Pages project -> Settings -> Bindings:

```text
Variable name: DB
Database: doges-db
```

Redeploy after changing bindings or variables.

---

## 4. Create the first owner admin

Do this locally in Termux. The password never needs to be pasted into GitHub or Cloudflare variables.

```bash
cd ~/dogeshbhoi

read -rsp "Owner username: " ADMIN_USERNAME
echo

read -rsp "Owner password (16+ chars): " ADMIN_PASSWORD
echo

export ADMIN_USERNAME ADMIN_PASSWORD
export ADMIN_ROLE=owner

npm run make-first-admin

unset ADMIN_USERNAME ADMIN_PASSWORD ADMIN_ROLE
```

The command prints **one `INSERT INTO admins(...)` SQL statement**.

Copy that one SQL statement into:

D1 -> `doges-db` -> Console -> Execute.

Then check:

```sql
SELECT id,username,role,active
FROM admins;
```

The password hash uses PBKDF2-SHA256 with **100,000 iterations** because Cloudflare Workers currently rejects PBKDF2 counts above 100,000 in production.

---

## 5. Multiple admins

Log in as an `owner`.

The dashboard has an **Admins** section.

Owners can:

- create another `admin`
- create another `owner`
- disable/enable another account

Normal `admin` accounts can:

- add dogs
- generate/reprint permanent QR codes
- review sightings
- accept/reject held location reports

Normal admins cannot manage other admin accounts.

Safety rules:

- an owner cannot disable their own account from the UI/API
- the final active owner cannot be disabled
- disabling an account increments its `session_version`, invalidating its existing sessions

---

## 6. Turnstile

Create a Managed Turnstile widget for:

```text
dogesbhoi.pages.dev
```

The backend validates:

- Turnstile success
- expected action (`admin_login` or `sighting`)
- expected hostname from `TURNSTILE_HOSTNAMES`

Turnstile tokens are single-use. The frontend resets the widget after a failed login/submission before allowing another attempt.

---

## 7. Sighting safety

Public scanner flow:

1. scan permanent QR
2. dog profile opens
3. tap `Share sighting`
4. browser asks for location permission
5. optional condition + note
6. Turnstile
7. server stores the report

Rules:

- first-ever sighting for a dog -> `review`
- GPS accuracy over 150 m -> `review`
- large short-time location jumps -> `review`
- improbable travel speed -> `review`
- only `accepted` sightings appear publicly
- same reporter: maximum 3 reports for one dog in 10 minutes
- same reporter: maximum 20 reports total per hour
- nearby independent reports can raise confidence

A static QR and browser GPS cannot cryptographically prove a person is physically next to a dog. The app therefore treats submissions as community sightings rather than unquestionable truth.

---

## 8. Admin login protection

Admin login has:

- Turnstile
- strict hostname/action verification
- generic `Invalid login` response
- reporter rate limit: 8 failures / 15 minutes
- username rate limit: 20 failures / hour
- PBKDF2 password hashes in D1
- signed `HttpOnly; Secure; SameSite=Strict` session cookie
- server-side D1 account check on protected API calls
- session revocation when an account is disabled
- no raw IP storage

To clear rate-limit entries during setup only:

```sql
DELETE FROM admin_auth_attempts;
```

Do not add a public debug-auth endpoint.

---

## 9. Permanent QR

A dog gets a random ID such as:

```text
DG-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

QR points to:

```text
https://dogesbhoi.pages.dev/dog/DG-...
```

Dog details, vaccination state, photo, and location history can change without changing that URL.

Therefore the QR does **not** need reprinting after normal updates.

---

## 10. Free-tier design

The app contains no code that purchases or upgrades a Cloudflare plan.

Used services:

- Cloudflare Pages static assets
- Pages Functions
- D1
- Turnstile
- Leaflet
- OpenStreetMap standard tiles for the small MVP

Not used:

- R2
- paid maps
- SMS
- email API
- paid authentication provider

Cloudflare pricing/limits can change, so keep the Pages project on Free and do not enable paid services if the requirement is strictly zero billing.

OpenStreetMap's public standard tile service has a usage policy and is suitable only for modest usage. If this becomes a high-traffic service, review a sustainable map-tile solution before scaling.

---

## 11. Deploy / replace the old repo

After extracting this v2 ZIP over your repository:

```bash
cd ~/dogeshbhoi

git add -A
git commit -m "Replace Doges with secure multi-admin v2"

git pull --rebase origin main
git push origin main
```

If Git reports a merge conflict, do not force-push until you review it.

After Cloudflare deploys:

1. run `0002_multi_admin.sql`
2. create first owner SQL and run it
3. set `TURNSTILE_HOSTNAMES`
4. generate/set `SESSION_SECRET` + `IP_HASH_SECRET`
5. redeploy
6. open `/admin`
7. log in with the D1 owner account
8. add a second admin from the dashboard
9. create a test dog
10. download QR and test a sighting from another phone
