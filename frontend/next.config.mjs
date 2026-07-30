/** @type {import('next').NextConfig} */

// There is no separate API to point at any more. The catalogue is read
// straight from Supabase: by the route handlers under app/api/dropradar/* for
// anything the browser asks for, and by lib/api.ts for server-rendered pages,
// the sitemap and the OG images. The rewrite that used to proxy
// /api/dropradar/* to a Go service is gone with it, so API_BASE_URL is no
// longer read anywhere and does not need setting on the host.

const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
