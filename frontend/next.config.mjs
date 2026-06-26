/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    // proxy /api/* to the Laravel backend in dev (avoids CORS)
    return [
      {
        source: '/api/:path*',
        destination: (process.env.NEXT_PUBLIC_API_BASE || 'http://api:8000') + '/api/:path*',
      },
    ];
  },
};
export default nextConfig;
