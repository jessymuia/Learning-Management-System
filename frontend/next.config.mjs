/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable standalone output so the Docker runner stage only needs node server.js
  output: 'standalone',
  async rewrites() {
    // Proxy /api/* to the Laravel backend.
    // NEXT_PUBLIC_API_BASE is the server-to-server address (e.g. http://api:8000 in Docker).
    // The browser always hits /api/* on the Next.js origin, which is then proxied server-side.
    const apiBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000';
    return [
      {
        source: '/api/:path*',
        destination: `${apiBase}/api/:path*`,
      },
    ];
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
      { protocol: 'http', hostname: 'localhost' },
    ],
  },
};
export default nextConfig;
