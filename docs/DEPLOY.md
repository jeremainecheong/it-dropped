# Deploying It Dropped

The stack is split in two, and only one half belongs on Vercel:

| Component | Where it runs | Why |
|---|---|---|
| `frontend/` (Next.js) | **Vercel** | Static/serverless, no long-lived processes |
| `backend/` API (Go) | Your own host — Vultr/k8s (`infra/k8s`), Fly.io, Railway, Render | Long-running HTTP server |
| `backend/` scraper (Go) | Same host, as a CronJob or loop | Needs to run on a schedule, not per-request |
| `backend/` Telegram bot | Same host | Long-lived process |
| Postgres | Supabase | Already the source of truth |

> **Vercel cannot host the Go scraper.** Serverless functions are request-scoped
> and capped well below a full scrape; the scraper must live somewhere that can
> run background work. Deploy the frontend to Vercel and point it at your API.

---

## 1. Frontend on Vercel

**Project settings**

- **Root Directory**: `frontend`  ← required, the repo is a monorepo
- Framework preset: Next.js (auto-detected)
- Build command / install command: defaults are fine (pnpm is detected from the lockfile)

**Environment variables** (Project → Settings → Environment Variables)

| Variable | Example | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://abcd.supabase.co` | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJhbGci...` | anon/public key — safe in the browser |
| `API_BASE_URL` | `https://api.your-domain.com` | Public origin of the Go API |

`API_BASE_URL` is consumed by the rewrite in `next.config.mjs`, which proxies
`/api/dropradar/*` → `<API_BASE_URL>/api/v1/*`. Because the rewrite is
server-side, the browser only ever calls your own origin — so **no CORS
configuration is needed** on the Go API.

If `API_BASE_URL` is unset it falls back to `http://localhost:8080`, which on
Vercel means every product request fails. Set it before the first deploy.

---

## 2. Google SSO

Two consoles to configure. Do them in this order.

### a) Google Cloud Console

1. **APIs & Services → OAuth consent screen** — configure it, add your domain
   under *Authorised domains*. While it is in *Testing*, only accounts you list
   as test users can sign in; *Publish* it for public sign-ups.
2. **APIs & Services → Credentials → Create credentials → OAuth client ID**
   - Application type: **Web application**
   - **Authorised redirect URI** — this is Supabase's callback, *not* yours:
     ```
     https://<your-project-ref>.supabase.co/auth/v1/callback
     ```
3. Copy the **Client ID** and **Client secret**.

### b) Supabase Dashboard

1. **Authentication → Providers → Google** — enable it, paste the Client ID and
   Client secret, save.
2. **Authentication → URL Configuration**
   - **Site URL**: `https://your-domain.com`
   - **Redirect URLs** — add every origin that will complete a sign-in:
     ```
     https://your-domain.com/auth/callback
     https://*-your-team.vercel.app/auth/callback   ← preview deploys
     http://localhost:3000/auth/callback            ← local dev
     ```

Supabase rejects any `redirect_to` not on this allow-list, so a missing entry
is the usual cause of "signed in with Google, bounced back to /login".

### c) Confirm the provider is actually on

`signInWithOAuth` only builds a URL, so it returns no error when the provider
is disabled — the failure surfaces after the browser has already navigated
away, as a bare 400 that names no provider:

```json
{"code":400,"error_code":"validation_failed","msg":"Unsupported provider: provider is not enabled"}
```

Check before blaming the callback route. This needs only the publishable key,
and lists every provider the project has enabled:

```bash
curl -s "https://<project-ref>.supabase.co/auth/v1/settings" \
  -H "apikey: <publishable-key>" | jq '.external | with_entries(select(.value))'
```

A newly created project has `email` alone, so Google reads `false` until step
(b) is saved.

### How the flow works in this codebase

```
GoogleButton  →  supabase.auth.signInWithOAuth({ provider: 'google' })
              →  Google consent screen
              →  https://<project>.supabase.co/auth/v1/callback
              →  /auth/callback?code=…&next=/shop   (app/auth/callback/route.ts)
              →  exchangeCodeForSession(code)  → session cookie
              →  redirect to `next`
```

`next` is validated to be a same-origin relative path, so it cannot be used as
an open redirect.

---

## 3. Backend (API + scraper)

Deploy from `infra/k8s` (manifests provided) or any container host.

Required environment:

```bash
DATABASE_URL=postgres://…            # Supabase Postgres connection string
GIN_MODE=release
API_PORT=8080

# Scraper
REGIONS=us,uk,eu,jp,au,sg
SCRAPE_INTERVAL=5m                   # loop mode; ignored by the CronJob
SCRAPE_TIMEOUT=30s
REQUEST_DELAY=500ms

# Telegram bot (optional)
TELEGRAM_BOT_TOKEN=…
```

Apply the schema and migrations to Supabase first:

```bash
psql "$DATABASE_URL" -f docs/schema.sql
for m in docs/migrations/*.sql; do psql "$DATABASE_URL" -f "$m"; done
```

Migration `008` is required for region alerts ("tell me when this drops in my
country") and for `any_change` price alerts to record a rise. Without it the
scraper logs an error every cycle that produces a `new` drop.

### Running the alert integration tests

The alert matcher is SQL that compiles fine while matching the wrong rows, so
it has tests against a real Postgres. They skip unless a database is provided:

```bash
export TEST_DATABASE_URL="postgres://…/postgres?sslmode=disable"
go test ./internal/database/ -run 'TestRegionAlert|TestPriceDrop|TestAnyChange' -v
```

The suite truncates the tables it seeds on start, so point it at a scratch
database — never at production. Supabase's `auth.users` is referenced by the
alert tables; a local database needs a stub with `id` and `raw_user_meta_data`.

### Scrape rate

A full cycle is roughly 4 pages × 6 regions ≈ 24 upstream requests. At the
default `SCRAPE_INTERVAL=5m` that is ~290 requests/hour spread across six
different storefronts — deliberately polite. Lower it only if you have a
reason to, and keep `REQUEST_DELAY` in place: it spaces out the pages within a
single region so no one store sees a burst.

The scraper is safe to run as either a loop (`SCRAPE_INTERVAL`) or a one-shot
CronJob (`infra/k8s/scraper-cronjob.yaml`, `*/5`). Do not run both against the
same database.

---

## 4. Post-deploy checks

```bash
# API reachable and talking to Postgres
curl https://api.your-domain.com/health

# Frontend proxy resolves to the API (not localhost)
curl https://your-domain.com/api/dropradar/products?limit=1

# OAuth callback rejects a missing code instead of erroring
curl -sI "https://your-domain.com/auth/callback" | grep -i location
```

Then sign in with Google once end-to-end and confirm you land on `/shop`.
