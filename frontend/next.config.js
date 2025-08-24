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
    // These rewrites proxy frontend API requests to the backend server
    // Required for components that use direct fetch() calls with relative URLs
    // Components using authenticatedFetch() get environment-based URLs and don't need these
    return [
      { source: '/auth/:path*', destination: `${API_URL}/auth/:path*` },
      { source: '/todos/:path*', destination: `${API_URL}/todos/:path*` },
      { source: '/categories/:path*', destination: `${API_URL}/categories/:path*` },
      { source: '/spaces/:path*', destination: `${API_URL}/spaces/:path*` },
      { source: '/email/:path*', destination: `${API_URL}/email/:path*` },
      { source: '/contact', destination: `${API_URL}/contact` },
      { source: '/chat', destination: `${API_URL}/chat` },
      { source: '/insights', destination: `${API_URL}/insights` },
      { source: '/journals/:path*', destination: `${API_URL}/journals/:path*` },
    ];
  },
};

module.exports = nextConfig;
