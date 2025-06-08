/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, must-revalidate',
          },
          {
            key: 'Service-Worker-Allowed',
            value: '/',
          },
        ],
      },
      {
        source: '/manifest.json',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, must-revalidate',
          },
        ],
      },
    ];
  },
  async rewrites() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    return [
      {
        source: '/todos/:path*',
        destination: `${apiUrl}/todos/:path*`,
      },
      {
        source: '/categories/:path*',
        destination: `${apiUrl}/categories/:path*`,
      },
      {
        source: '/classify',
        destination: `${apiUrl}/classify`,
      },
      {
        source: '/auth/:path*',
        destination: `${apiUrl}/auth/:path*`,
      },
      {
        source: '/email/:path*',
        destination: `${apiUrl}/email/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
