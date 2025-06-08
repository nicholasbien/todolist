/** @type {import('next').NextConfig} */
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        source: '/manifest.json',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      { source: '/auth/:path*', destination: `${API_URL}/auth/:path*` },
      { source: '/todos/:path*', destination: `${API_URL}/todos/:path*` },
      { source: '/categories/:path*', destination: `${API_URL}/categories/:path*` },
      { source: '/email/:path*', destination: `${API_URL}/email/:path*` },
    ];
  },
};

module.exports = nextConfig;
