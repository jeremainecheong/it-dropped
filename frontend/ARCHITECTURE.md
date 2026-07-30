# It Dropped — frontend architecture

## Overview

The frontend is a Next.js App Router application that reads Supabase directly.
It is both the site and the read API: there is no separate backend service to
call. The Go code in `backend/` is a scheduled scraper that writes to the same
database; it never serves a request.

## Stack

- **Next.js 14** (App Router) with **React 19** and **TypeScript**
- **Tailwind CSS** with custom design tokens
- **shadcn/ui** over **Radix UI** primitives
- **Recharts** for price history and dashboard aggregates
- **@supabase/supabase-js** and **@supabase/ssr** for data and auth

## How data reaches the page

Three distinct paths, chosen by what the caller can do:

| Path | Used by | Reads via |
|---|---|---|
| Server component | product pages, sitemap, OG images | `lib/api.ts` → Supabase directly |
| Route handler | anything the browser asks for | `app/api/dropradar/*` → `lib/catalogue.ts` |
| Browser client | auth, wishlist, alerts, forum | `lib/supabase.ts` → Supabase directly |

Server-rendered pages cannot go through the route handlers — those are
same-origin URLs that do not exist yet at build time — so `lib/api.ts` reads
Supabase itself. Both server paths are wrapped in React's `cache`, because
Next dedupes `fetch` but cannot see supabase-js calls, and a product page
otherwise reads the same row twice.

The product page resolves its product and every regional sibling on the server
and passes both to the client component. The browser makes no product request
of its own.

## The read API

`app/api/dropradar/*` returns `{ success, data, meta }`. All of it is
read-only and uses the publishable key, which row level security restricts to
reading the catalogue.

| Route | Notes |
|---|---|
| `products` | filters, whitelisted sorts, `count=exact` for `meta.total` |
| `products/[id]` | 404s rather than 500s on a missing row |
| `products/by-handle/[handle]` | every region carrying the same garment |
| `products/search` | ranked; calls the `search_products` function |
| `drops` | the change feed |
| `trending` | most recently touched listings |
| `stats` | the `region_stats` view |
| `analytics` | the `analytics_summary` function |
| `status` | catalogue freshness |

Sorting by price is sorting by `price_usd`, a stored generated column, because
PostgREST can order by columns but not by an expression. Ranked search and the
handle-to-style-code lookup are Postgres functions for the same reason.

## Auth

Supabase Auth with **PKCE**, via `createBrowserClient`. This matters: the plain
`createClient` defaults to the implicit flow, which returns the session in the
URL fragment — and fragments never reach the server, so the callback route at
`app/auth/callback/route.ts` would find no `code`. PKCE puts the code in the
query string and the verifier in a cookie, which is also what lets server
components see a session at all.

`next` on the callback is validated to be a same-origin relative path, so it
cannot be used as an open redirect.

## Caching

- Route handlers revalidate on a per-route basis: 60s for the time-sensitive
  feeds, 300s for the catalogue, never for `status`.
- The service worker caches **same-origin static assets only**. It must not
  touch cross-origin requests: Supabase reads are cross-origin, and caching
  them meant a freshly posted comment came back without itself. Navigations are
  network-first, because a cached document names build-hashed chunks that stop
  existing at the next deploy.

## Design system

Monochrome — black, white and greys — with SF Pro throughout, an 8px spacing
grid, and transitions kept subtle. Product imagery is hotlinked from the
retailer's CDN, so every image has a placeholder fallback: a delisted asset is
ordinary wear, not an exception.

## Environment

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_…
NEXT_PUBLIC_SITE_URL=https://your-domain.com
```

There is no API base URL. `NEXT_PUBLIC_SITE_URL` defaults to
`https://itdropped.app`, so leaving it unset on another domain points canonical
tags and the sitemap at a site you do not own.
