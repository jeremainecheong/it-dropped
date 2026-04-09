/** @type {import('next').NextConfig} */
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
        destination: 'http://localhost:8080/api/v1/:path*',
      },
    ]
  },
}

export default nextConfig
