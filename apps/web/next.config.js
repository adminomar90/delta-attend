/** @type {import('next').NextConfig} */
const nextConfig = {
  // A separate output directory lets CI validate a production build without
  // overwriting a running developer's .next directory.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  async headers() {
    const revalidate = { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' };
    return [
      { source: '/sw-notifications.js', headers: [
        { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
        { key: 'Cache-Control', value: 'no-store, max-age=0' },
        { key: 'Service-Worker-Allowed', value: '/' },
      ] },
      { source: '/manifest.webmanifest', headers: [revalidate, { key: 'Content-Type', value: 'application/manifest+json; charset=utf-8' }] },
      ...['favicon.ico', 'favicon-32x32.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'maskable-icon-192.png', 'maskable-icon-512.png'].map((file) => ({ source: `/${file}`, headers: [revalidate] })),
    ];
  },
};

module.exports = nextConfig;

