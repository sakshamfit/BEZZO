/** @type {import('next').NextConfig} */
const apiInternalUrl = process.env.BEZZO_API_INTERNAL_URL ?? 'http://127.0.0.1:4000';

const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  // If an external API URL is provided, proxy to it. Otherwise, Next.js internal route handlers handle the requests.
  async rewrites() {
    if (process.env.BEZZO_API_INTERNAL_URL && process.env.BEZZO_API_INTERNAL_URL !== 'internal') {
      return [
        { source: '/api/v1/:path*', destination: `${process.env.BEZZO_API_INTERNAL_URL}/api/v1/:path*` },
        { source: '/health', destination: `${process.env.BEZZO_API_INTERNAL_URL}/health` },
        { source: '/version', destination: `${process.env.BEZZO_API_INTERNAL_URL}/version` },
      ];
    }
    return [];
  },
  // Next's dev server rejects cross-origin asset requests by default; the preview host is dynamic.
  allowedDevOrigins: ['*.run.app', '*.aistudio.google.com', '*.e2b.app', '*.arena.ai', 'localhost', '127.0.0.1'],
  experimental: {
    // The web client is a consumer of the published API contract only, so no workspace source
    // transpilation is required.
    optimizePackageImports: [],
  },
};

export default nextConfig;
