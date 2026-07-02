'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ToastProvider';

const ETAPES = [
  'Connexion à Costructor…',
  'Rapprochement du client…',
  'Création du devis…',
  'Ajout des postes…',
  'Finalisation…',
];

export default function BoutonPousser({
  devisId,
  dejaEnvoye,
  totalHT,
}: {
  devisId: string;
  dejaEnvoye: boolean;
  totalHT: number;
}) {
  const router = useRouter();
  const { show } = useToast();
  const [enCours, setEnCours] = useState(false);
  const [etape, setEtape] = useState(0);
  const [confirmOuvert, setConfirmOuvert] = useState(false);

  async function pousser() {
    if (enCours) return;
    setConfirmOuvert(false);
    setEnCours(true);
    setEtape(0);
    const it = setInterval(() => setEtape((e) => Math.min(e + 1, ETAPES.length - 1)), 700);
    try {
      const res = await fetch('/api/devis/pousser', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ devisId }),
      });
      clearInterval(it);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Échec de l'envoi vers Costructor");
      show('Brouillon créé dans Costructor ✓', 'success');
      setEnCours(false); // stoppe le chargement (sinon le bouton tourne indéfiniment)
      router.refresh(); // ré-affiche la carte « Brouillon créé » + « Ouvrir dans Costructor »
      // Remonte automatiquement en haut pour que l'utilisateur voie la carte + le bouton d'ouverture.
      setTimeout(() => {
        document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' });
      }, 150);
    } catch (e) {
      clearInterval(it);
      show(e instanceof Error ? e.message : 'Erreur', 'error');
      setEnCours(false);
    }
  }

  function demarrer() {
    if (enCours || totalHT === 0) return;
    if (dejaEnvoye) setConfirmOuvert(true);
    else void pousser();
  }

  if (enCours) {
    return (
      <div className="rounded-xl border border-primary bg-primary/5 p-4 text-center">
        <div className="mx-auto mb-2 h-6 w-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        <p className="text-sm text-gray-700">{ETAPES[etape]}</p>
      </div>
    );
  }

  return (
    <>
      <button
        onClick={demarrer}
        disabled={totalHT === 0}
        className="btn-primary w-full py-3.5 rounded-xl text-base font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {dejaEnvoye ? 'Mettre à jour dans Costructor' : 'Envoyer vers Costructor'}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
      </button>
      {totalHT === 0 && (
        <p className="mt-1.5 text-center text-[11px] text-gray-400">Saisissez au moins une quantité pour activer l&apos;envoi.</p>
      )}

      {confirmOuvert && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setConfirmOuvert(false)} />
          <div className="relative w-full sm:max-w-sm bg-white rounded-t-2xl sm:rounded-2xl p-6 animate-scale-in" style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}>
            <h3 className="text-lg font-bold text-foreground mb-2">Ce devis est déjà dans Costructor</h3>
            <p className="text-gray-500 text-sm mb-6">L&apos;ancien brouillon sera remplacé par cette version à jour.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmOuvert(false)} className="btn-tertiary flex-1 py-3 rounded-xl">Annuler</button>
              <button onClick={pousser} className="btn-primary flex-1 py-3 rounded-xl">Remplacer</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
