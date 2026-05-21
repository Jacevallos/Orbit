/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Never serve stale data for dynamic routes from the client-side router cache.
    // Without this, navigating back shows cached (outdated) project/chat lists.
    staleTimes: {
      dynamic: 0,
    },
  },
};

module.exports = nextConfig;
