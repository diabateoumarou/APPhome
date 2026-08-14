/**
 * Configuration Next.js — vitrine APPhome.
 * Auteur : DIABATE Oumarou — DATACONNECT AFRICA · 13 août 2026
 */
const config = {
  reactStrictMode: true,
  images: {
    // Les photos sont servies par MinIO en développement, par le CDN en production.
    remotePatterns: [
      { protocol: 'http', hostname: '192.168.32.135', port: '9000' },
      { protocol: 'https', hostname: '**' },
    ],
  },
};

export default config;
