'use client';

import { useEffect } from 'react';

// Filet de sécurité ultime : capture les erreurs survenant dans le layout racine
// lui-même (où error.tsx ne peut pas intervenir). Doit fournir ses propres
// <html>/<body> et n'utilise que des styles inline (le CSS global peut ne pas
// être chargé si le layout a planté). Remonte aussi l'erreur pour alerte Telegram.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Erreur globale interceptée:', error);
    fetch('/api/client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: '[global] ' + (error?.message || String(error)),
        digest: error?.digest,
        url: typeof window !== 'undefined' ? window.location.href : '',
      }),
    }).catch(() => {});
  }, [error]);

  return (
    <html lang="fr">
      <body style={{ fontFamily: 'system-ui, -apple-system, sans-serif', background: '#F8FAFC', margin: 0 }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 16px' }}>
          <div style={{ textAlign: 'center', maxWidth: 360 }}>
            <h1 style={{ fontSize: 18, fontWeight: 600, color: '#111827', margin: '0 0 4px' }}>
              Une erreur est survenue
            </h1>
            <p style={{ fontSize: 14, color: '#9CA3AF', margin: '0 0 24px' }}>
              Un problème inattendu s&apos;est produit. Veuillez réessayer.
            </p>
            <button
              onClick={() => reset()}
              style={{ height: 48, padding: '0 24px', background: '#10B981', color: '#fff', fontWeight: 600, border: 'none', borderRadius: 12, fontSize: 16, cursor: 'pointer' }}
            >
              Réessayer
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
