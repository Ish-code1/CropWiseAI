/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "firebasestorage.googleapis.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },

  // Ignore TypeScript build errors (temporary)
  typescript: {
    ignoreBuildErrors: true,
  },

  // Silence the firebase-admin punycode deprecation warning in dev
  webpack: (config) => {
    config.resolve.fallback = { ...config.resolve.fallback, punycode: false };
    return config;
  },
};

module.exports = nextConfig;
