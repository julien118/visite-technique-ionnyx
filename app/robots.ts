import type { MetadataRoute } from 'next';

// Outil privé MTC37 : le retrait de Google est assuré par le header
// « X-Robots-Tag: noindex » (voir next.config.mjs), PAS par un Disallow.
// On AUTORISE volontairement le crawl : si Google ne peut pas crawler la page,
// il ne verra jamais la directive noindex et l'URL pourrait rester listée.
// Aucun sitemap n'est déclaré (aucun sitemap.ts/xml pour cette app).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
    },
  };
}
