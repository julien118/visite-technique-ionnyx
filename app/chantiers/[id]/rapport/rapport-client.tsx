'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Chantier, Rapport, RapportContenu } from '@/lib/types';
import { createClient } from '@/lib/supabase/client';
import ReportView from '@/components/ReportView';

interface RapportClientProps {
  chantier: Chantier;
  rapport: Rapport | null;
}

export default function RapportClient({ chantier, rapport: initialRapport }: RapportClientProps) {
  const router = useRouter();
  const supabase = createClient();
  const [rapport, setRapport] = useState(initialRapport);
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');

  const contenu = rapport?.contenu_json as RapportContenu | null;

  // Générer ou régénérer le rapport
  async function handleGenerate() {
    setGenerating(true);
    setError('');

    try {
      const response = await fetch('/api/generate-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chantierId: chantier.id }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Erreur génération');
      }

      const { rapport: rapportContenu } = await response.json();

      // Mettre à jour l'état local
      setRapport((prev) => ({
        id: prev?.id || '',
        chantier_id: chantier.id,
        contenu_json: rapportContenu,
        contenu_html: null,
        pdf_url: null,
        created_at: prev?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));
    } catch (err) {
      console.error('Erreur:', err);
      setError(err instanceof Error ? err.message : 'Erreur lors de la génération du rapport');
    } finally {
      setGenerating(false);
    }
  }

  // Mettre à jour le rapport après édition inline
  async function handleUpdateContenu(updatedContenu: RapportContenu) {
    setRapport((prev) => prev ? { ...prev, contenu_json: updatedContenu } : null);

    // Sauvegarder en BDD
    if (rapport?.id) {
      await supabase
        .from('rapports')
        .update({ contenu_json: updatedContenu })
        .eq('id', rapport.id);
    }
  }

  // Télécharger en PDF (via window.print pour un rendu fidèle)
  async function handleDownloadPdf() {
    setDownloading(true);
    try {
      const response = await fetch('/api/export-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chantierId: chantier.id }),
      });

      if (!response.ok) throw new Error('Erreur export PDF');

      const { html } = await response.json();

      // Ouvrir une nouvelle fenêtre avec le HTML du rapport pour impression/PDF
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(`
          <!DOCTYPE html>
          <html lang="fr">
          <head>
            <meta charset="UTF-8">
            <title>Rapport — ${chantier.client_prenom} ${chantier.client_nom}</title>
            <style>
              @media print {
                body { margin: 0; padding: 20px; }
                img { max-width: 200px; height: auto; }
              }
            </style>
          </head>
          <body>${html}</body>
          </html>
        `);
        printWindow.document.close();
        setTimeout(() => printWindow.print(), 500);
      }
    } catch (err) {
      console.error('Erreur PDF:', err);
      setError('Erreur lors de l\'export PDF');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-[#1E3A5F] text-white px-4 py-4 sticky top-0 z-10">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <button
            onClick={() => router.push(`/chantiers/${chantier.id}`)}
            className="flex items-center justify-center w-10 h-10 -ml-2 rounded-lg active:bg-white/10 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-lg font-bold flex-1 truncate">Rapport</h1>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-4 pb-32">
        {/* Pas encore de rapport → bouton générer */}
        {!contenu && !generating && (
          <div className="text-center py-16">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-orange-100 rounded-full mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-gray-500 text-lg mb-2">Prêt à générer le rapport</p>
            <p className="text-gray-400 text-sm mb-6">
              L&apos;IA va structurer vos observations et corréler les photos
            </p>
            <button
              onClick={handleGenerate}
              className="h-14 px-8 bg-[#F97316] text-white font-bold text-lg rounded-xl active:bg-orange-600 transition-colors"
            >
              Générer le rapport
            </button>
          </div>
        )}

        {/* Génération en cours */}
        {generating && (
          <div className="text-center py-16">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
              <div className="w-8 h-8 border-3 border-blue-200 border-t-[#1E3A5F] rounded-full animate-spin" />
            </div>
            <p className="text-gray-700 text-lg font-medium mb-1">Génération en cours…</p>
            <p className="text-gray-400 text-sm">
              L&apos;IA analyse vos observations et structure le rapport
            </p>
          </div>
        )}

        {/* Erreur */}
        {error && (
          <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">
            {error}
          </div>
        )}

        {/* Rapport affiché */}
        {contenu && !generating && (
          <ReportView contenu={contenu} onUpdate={handleUpdateContenu} />
        )}
      </main>

      {/* Barre d'actions en bas (si rapport généré) */}
      {contenu && !generating && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3 z-20">
          <div className="max-w-lg mx-auto flex gap-3">
            <button
              onClick={handleDownloadPdf}
              disabled={downloading}
              className="flex-1 h-12 bg-[#1E3A5F] text-white font-semibold rounded-xl active:bg-[#162d4a] disabled:opacity-50 transition-colors flex items-center justify-center gap-2 text-sm"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              {downloading ? 'Export…' : 'PDF'}
            </button>
            <button
              onClick={handleGenerate}
              className="flex-1 h-12 bg-gray-100 text-gray-700 font-semibold rounded-xl active:bg-gray-200 transition-colors flex items-center justify-center gap-2 text-sm"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Régénérer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
