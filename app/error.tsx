'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Error boundary Next.js : intercepte toute exception levée pendant le rendu
// d'une page (ex: rapport au contenu malformé) et affiche un écran propre
// au lieu de l'écran blanc générique "Application error".
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Trace dans la console + remonte l'erreur au serveur pour alerte Telegram
    // immédiate (le token du bot reste côté serveur).
    console.error('Erreur applicative interceptée:', error);
    fetch('/api/client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: error?.message || String(error),
        digest: error?.digest,
        url: typeof window !== 'undefined' ? window.location.href : '',
      }),
    }).catch(() => {});
  }, [error]);

  const router = useRouter();

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-red-50 rounded-full mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        <h1 className="text-gray-900 text-lg font-semibold mb-1">Une erreur est survenue</h1>
        <p className="text-gray-400 text-sm mb-6">
          Un problème inattendu s&apos;est produit. Vous pouvez réessayer ou revenir à vos chantiers.
        </p>
        <div className="flex flex-col gap-2 max-w-xs mx-auto">
          <button
            onClick={() => reset()}
            className="h-12 px-6 btn-primary font-semibold rounded-xl transition-transform"
          >
            Réessayer
          </button>
          <button
            onClick={() => router.push('/chantiers')}
            className="h-12 px-6 text-gray-500 text-sm font-medium rounded-xl active:bg-gray-100 transition-colors"
          >
            Retour aux chantiers
          </button>
        </div>
      </div>
    </div>
  );
}
