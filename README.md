# Doges v2.1 — Cloudflare Pages street-dog safety MVP

Doges is a Cloudflare Pages + Pages Functions + D1 app for permanent street-dog QR profiles, consent-based sightings, notes, location history, moderation, and multiple admin accounts.

## v2.1 important simplification

Turnstile hostname verification now compares the hostname returned by Cloudflare Turnstile with the hostname of the actual incoming request. **There is no `TURNSTILE_HOSTNAMES` environment variable in v2.1.**

Admin users are stored in D1. Old `ADMIN_USERNAME` and `ADMIN_PASSWORD_HASH` Cloudflare variables are not used.

## Required Cloudflare configuration

### Pages variables / secrets

- `TURNSTILE_SITE_KEY` — Text
- `TURNSTILE_SECRET_KEY` — Secret
- `SESSION_SECRET` — Secret
- `IP_HASH_SECRET` — Secret

### Binding

- D1 binding name exactly `DB` -> your `doges-db`

That is all. No `TURNSTILE_HOSTNAMES`, `ADMIN_USERNAME`, or `ADMIN_PASSWORD_HASH` Cloudflare variable is required.

## Database

For a database that already has the v1 tables, run only:

`migrations/0002_multi_admin.sql`

For a brand-new database, run `0001_init.sql` first and then `0002_multi_admin.sql`.

## Generate secrets

```bash
npm run make-secrets
```

Put the generated `SESSION_SECRET` and `IP_HASH_SECRET` values into Pages secrets.

## Create first owner

```bash
read -rp "Owner username: " ADMIN_USERNAME
read -rsp "Owner password (16+ chars): " ADMIN_PASSWORD
echo
export ADMIN_USERNAME ADMIN_PASSWORD ADMIN_ROLE=owner
npm run make-first-admin
unset ADMIN_USERNAME ADMIN_PASSWORD ADMIN_ROLE
```

Paste the one generated `INSERT INTO admins(...)` statement into the D1 console.

Admin usernames are 3-32 lowercase letters, digits, dot, underscore or hyphen.

## Multiple admins

The first account can have role `owner`. An owner can create more `admin` or `owner` accounts from the dashboard. Admin accounts live in D1, not Cloudflare environment variables.

## Login security

- Password hashes: PBKDF2-SHA256, 100,000 iterations, random salt
- Turnstile verified server-side
- Turnstile action checked
- Turnstile hostname checked against the real request hostname
- Rate limiting stored in D1
- HttpOnly + Secure + SameSite=Strict signed session cookie
- Disabled users and session-version changes invalidate sessions
- Same-origin checks on state-changing admin requests

## Permanent QR

The QR stores only a permanent URL such as:

`https://dogesbhoi.pages.dev/dog/DG-...`

Changing dog details or adding location history does not change the QR.

## Deploy

Cloudflare Pages settings:

- Production branch: `main`
- Build command: `npm run build`
- Build output: `dist`

After changing Pages bindings/secrets, trigger a fresh deployment.
