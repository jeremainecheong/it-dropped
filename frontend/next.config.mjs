/** @type {import('next').NextConfig} */

// Where the Go API lives. Locally this is the dev server on :8080; in a
// deployed environment (Vercel, k8s) set API_BASE_URL to the public API origin,
// e.g. https://api.itdropped.com — without it, every /api/dropradar/* call
// would proxy to a localhost that doesn't exist on the serverless host.
const apiBaseUrl = (process.env.API_BASE_URL || 'http://localhost:8080').replace(/\/$/, '')

const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async rewrites() {
    return [
      {
        source: '/api/dropradar/:path*',
        destination: `${apiBaseUrl}/api/v1/:path*`,
      },
    ]
  },
}

export default nextConfig
