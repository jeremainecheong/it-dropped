# Deploying It Dropped

Two platforms, both free at hobby scale, and no server to run.

| Component | Where it runs | Why |
|---|---|---|
| `frontend/` (Next.js) | **Vercel** | Pages, plus the read API as route handlers |
| Catalogue read API | **Vercel**, `frontend/app/api/dropradar/*` | 13 read-only routes over Supabase |
| Postgres + PostgREST + Auth | **Supabase** | The source of truth |
| `backend/` scraper (Go) | **GitHub Actions**, daily | A 20-second batch job wants a scheduler, not a server |
| `backend/` Telegram bot | Only if you want announcements — see below | Long-lived process |

> **There is no separate Go API any more.** It was 13 read-only GET routes over
> four public tables. Migration 014 moved the queries PostgREST cannot express
> (ranked search, the handle-to-style-code lookup, the stats CTEs, the analytics
> aggregates) into Postgres functions and a view; the route handlers under
> `frontend/app/api/dropradar/*` are thin wrappers that return the identical
> `{success, data, meta}` envelope, so no call site changed. `backend/cmd/api`
> and `internal/api` have been deleted rather than left to rot — two copies of
> the same queries is how this project ended up with a frozen catalogue and a
> broken style code in the first place.

> **Why the scrape is daily.** Vercel's Hobby plan caps cron at **once per day**,
> and a `*/5` schedule is rejected at deploy time. Daily also keeps the scraper
> inside Supabase's 5 GB free egress: the differ reads the region's rows on every
> cycle, which is ~720 MB/month at one run a day and would be ~35 GB at every
> five minutes.

---

## 1. Frontend on Vercel

**Project settings**

- **Root Directory**: `frontend`  ← required, the repo is a monorepo
- Framework preset: Next.js (auto-detected)
- Build command / install command: defaults are fine (npm, from `package-lock.json`)

**Environment variables** (Project → Settings → Environment Variables)

| Variable | Example | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://abcd.supabase.co` | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `sb_publishable_...` | publishable key — safe in the browser |
| `NEXT_PUBLIC_SITE_URL` | `https://your-domain.com` | Canonical URLs, sitemap, OG images |

There is no `API_BASE_URL` and no service key. Every read goes through the
publishable key, which is safe because migration 013 gives the catalogue tables
RLS with a SELECT-only policy — the same key cannot write.

`NEXT_PUBLIC_SITE_URL` defaults to `https://itdropped.app`; if that is not your
domain, canonical tags and the sitemap will point at someone else's site.

---

## 1b. Scraper on GitHub Actions

`.github/workflows/scrape.yml` runs `backend/cmd/scraper` once a day and can be
triggered by hand from the Actions tab.

**Repository secret** (Settings → Secrets and variables → Actions):

| Secret | Where to get it |
|---|---|
| `DATABASE_URL` | Supabase → **Connect** → **Session pooler** (or Transaction pooler) |
| `SCRAPE_PROXY_TOKEN` | Generate one; must match the same variable on Vercel. See below |
| `TELEGRAM_BOT_TOKEN` | Optional. Absent, drops are stored but not announced |
| `TELEGRAM_CHANNEL_ID` | Optional, with the token |

### Why the storefronts are fetched through Vercel

The stores answer a GitHub Actions runner's address `429`, with a `Retry-After`
of a minute or more, **on the first request of a run** — before the scraper has
asked for anything. GitHub's egress ranges are shared and heavily abused, and
Shopify rate limits them on sight.

Nothing in the scraper fixes that. There is no burst to slow down and no limit
to wait out; the address is over quota on arrival. Measured from Vercel, the
same six stores answer `200` in about 130ms each.

So the fetch moves and everything else stays put. `app/api/scrape/store` returns
a storefront's `products.json` verbatim, and the scraper fetches that instead of
the store. Actions remains the scheduler and still does all the parsing,
diffing and writing — it just never talks to Stüssy.

Set one shared token in **both** places:

```bash
openssl rand -hex 32
```

- **Vercel** → Project → Settings → Environment Variables → `SCRAPE_PROXY_TOKEN`
  (Production), then redeploy so the running deployment picks it up.
- **GitHub** → Settings → Secrets and variables → Actions → `SCRAPE_PROXY_TOKEN`.

`SCRAPE_PROXY_URL` is set in the workflow rather than as a secret, because it is
the public site. Leave both unset locally and the scraper fetches the stores
directly, which is what a laptop wants.

The endpoint takes a **region code, never a URL** — it resolves the storefront
from a hardcoded map — and refuses every request when no token is configured
rather than falling open. Both matter: an endpoint that fetches a URL a caller
hands it is an open proxy.

Use a **pooler** string, not the direct `db.<ref>.supabase.co` host: the direct
host resolves to IPv6 only and GitHub's runners are IPv4, so it cannot connect
at all.

Either pooler works. pgx caches named prepared statements, which the
transaction pooler on `:6543` cannot honour — the second query on a connection
fails with *prepared statement already exists*. Rather than leave that as a trap
(the dashboard offers the transaction pooler first), `database.New` detects
`:6543` or `pgbouncer=true` and switches to unnamed statements.

Two things to know about Actions as a scheduler: scheduled runs are queued and
can be delayed by tens of minutes at busy times, which is harmless daily and
would not be at five-minute cadence; and **GitHub disables scheduled workflows
in a repository with no activity for 60 days**, so a repo you stop committing to
will quietly stop scraping.

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

## 3. Database and the scraper

Nothing here is deployed as a service. The scraper runs in CI (section 1b);
this section covers the schema it writes into and running it by hand.

Scraper environment:

```bash
DATABASE_URL=postgres://…            # Supabase SESSION POOLER string
REGIONS=us,uk,eu,jp,au,sg
SCRAPE_INTERVAL=0                    # one cycle, then exit
SCRAPE_CYCLE_TIMEOUT=10m              # hard bound on one cycle
SCRAPE_TIMEOUT=30s                    # per-request
REQUEST_DELAY=1s                      # spacing between requests, all regions

# Optional: fetch the stores through Vercel instead of directly (section 1b).
# Unset locally — a laptop's address is not rate limited.
SCRAPE_PROXY_URL=https://<your-app>.vercel.app/api/scrape/store
SCRAPE_PROXY_TOKEN=…

# Telegram announcements (optional)
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

A full cycle is roughly 4 pages × 6 regions ≈ 24 upstream requests and takes
about 25 seconds.

`REQUEST_DELAY` is the minimum spacing between **any** two requests, across all
regions, not within one. That distinction is the whole point: the stores rate
limit on the client address, so six regions each politely pacing themselves
still arrives as one client at six times the rate. Left unpaced, all six first
pages leave inside the same second and are answered `429`. From a CI runner —
a datacentre address, shared with everything else on it — that is reliably what
happens.

The client handles the rest: it honours `Retry-After`, retries a rate limit six
times with jittered exponential backoff, and on a `429` holds *every* region
back rather than only the one that received it.

If runs still come back rate limited, raise `REQUEST_DELAY` before anything
else — 2s costs the cycle about a minute and is far more likely to help than a
longer retry budget.

`SCRAPE_CYCLE_TIMEOUT` bounds one cycle. It exists so the scraper deadlines
itself and exits with a readable error, rather than being killed partway
through a write by whatever is scheduling it. Keep it below the scheduler's own
timeout (the workflow allows 20 minutes for a 10 minute cycle).

`SCRAPE_INTERVAL=0` runs one cycle and exits, which is what CI wants. Any
positive value runs an internal loop instead — useful locally, wrong under a
scheduler, because the job never ends and the next run is skipped. Do not run
a loop and the scheduled job against the same database.

---

## 4. Post-deploy checks

```bash
# Catalogue reachable, and how fresh it is
curl https://your-domain.com/api/dropradar/status

# A read that exercises Postgres, PostgREST and the route handler together
curl "https://your-domain.com/api/dropradar/products?limit=1&sort=price_asc"

# The ranked-search function (this one is an RPC, not a table read)
curl "https://your-domain.com/api/dropradar/products/search?q=hoodie&limit=3"

# The publishable key must NOT be able to write. Expect [] — anything else
# means migration 013 has not been applied.
curl -X PATCH "https://<project-ref>.supabase.co/rest/v1/products?id=eq.<any-id>" \
  -H "apikey: <publishable-key>" -H "Authorization: Bearer <publishable-key>" \
  -H "Content-Type: application/json" -H "Prefer: return=representation" \
  -d '{"price": 1}'

# OAuth callback rejects a missing code instead of erroring
curl -sI "https://your-domain.com/auth/callback" | grep -i location
```

Then run the scrape workflow by hand from the Actions tab and confirm
`last_scrape_at` moves, and sign in with Google once end-to-end.
