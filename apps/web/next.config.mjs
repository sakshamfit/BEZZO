/** @type {import('next').NextConfig} */
const apiInternalUrl = process.env.BEZZO_API_INTERNAL_URL ?? 'http://127.0.0.1:4000';

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The browser must never talk to the API host directly: in a sandbox/preview environment
  // `127.0.0.1:4000` is not reachable from the user's machine, and in production the API sits behind
  // the CDN/WAF on its own origin. Every browser call therefore goes to this app's own origin and is
  // proxied server-side to the API.
  async rewrites() {
    return [
      { source: '/api/v1/:path*', destination: `${apiInternalUrl}/api/v1/:path*` },
      { source: '/health', destination: `${apiInternalUrl}/health` },
      { source: '/version', destination: `${apiInternalUrl}/version` },
    ];
  },
  // Next's dev server rejects cross-origin asset requests by default; the preview host is dynamic.
  allowedDevOrigins: ['*.e2b.app', '*.arena.ai', 'localhost', '127.0.0.1'],
  experimental: {
    // The web client is a consumer of the published API contract only, so no workspace source
    // transpilation is required.
    optimizePackageImports: [],
  },
};

export default nextConfig;
