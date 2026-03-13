/** @type {import('next').NextConfig} */

const BACKEND_URL = (process.env.BACKEND_URL || 'http://localhost:8141').replace(/\/$/, '');

const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  trailingSlash: true,
  // Use static export for Capacitor builds
  ...(process.env.CAPACITOR_BUILD && { output: 'export' }),
  images: {
    unoptimized: true,
  },
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
  // Rewrite /agent/stream to the backend so SSE streaming works same-origin
  // (avoids CORS issues that occur when EventSource hits the backend directly).
  // Next.js rewrites stream the response — they don't buffer like API routes.
  ...(!process.env.CAPACITOR_BUILD && {
    async rewrites() {
      return [
        {
          source: '/agent/stream',
          destination: `${BACKEND_URL}/agent/stream`,
        },
      ];
    },
  }),
};

module.exports = nextConfig;
