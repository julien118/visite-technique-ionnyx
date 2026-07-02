import { withSentryConfig } from '@sentry/nextjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Outil privé réservé au client MTC37 : ne doit JAMAIS apparaître dans Google.
  // Header noindex sur TOUTES les routes (pages, API, assets). C'est ce header
  // (et non un Disallow dans robots.txt) qui garantit le retrait de l'index.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Robots-Tag',
            value: 'noindex, nofollow, noarchive',
          },
        ],
      },
    ];
  },
};

// Sentry n'enveloppe la config que si org + project sont définis : tant que ce
// n'est pas le cas, le build et le comportement restent strictement identiques.
const sentryEnabled = Boolean(process.env.SENTRY_ORG && process.env.SENTRY_PROJECT);

export default sentryEnabled
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN, // facultatif : source maps lisibles
      tunnelRoute: '/monitoring', // contourne les bloqueurs de pub
      widenClientFileUpload: true,
      silent: !process.env.CI,
      disableLogger: true,
    })
  : nextConfig;
