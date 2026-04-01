'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Chantier, Rapport, RapportContenu } from '@/lib/types';
import { createClient } from '@/lib/supabase/client';
import ReportView from '@/components/ReportView';

interface RapportClientProps {
  chantier: Chantier;
  rapport: Rapport | null;
}

const GENERATION_STEPS = [
  { label: 'Analyse des observations vocales…', icon: 'mic' },
  { label: 'Corrélation des photos…', icon: 'photo' },
  { label: 'Structuration du rapport…', icon: 'doc' },
  { label: 'Rédaction professionnelle…', icon: 'pen' },
  { label: 'Finalisation…', icon: 'check' },
];

function StepIcon({ icon, active }: { icon: string; active: boolean }) {
  const cls = active ? 'text-[#1E3A5F]' : 'text-gray-300';
  switch (icon) {
    case 'mic':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className={`w-5 h-5 ${cls}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
        </svg>
      );
    case 'photo':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className={`w-5 h-5 ${cls}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      );
    case 'doc':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className={`w-5 h-5 ${cls}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      );
    case 'pen':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className={`w-5 h-5 ${cls}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
      );
    case 'check':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className={`w-5 h-5 ${cls}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    default:
      return null;
  }
}

export default function RapportClient({ chantier, rapport: initialRapport }: RapportClientProps) {
  const router = useRouter();
  const supabase = createClient();
  const [rapport, setRapport] = useState(initialRapport);
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');
  const [currentStep, setCurrentStep] = useState(0);
  const stepIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasStartedRef = useRef(false);

  const contenu = rapport?.contenu_json as RapportContenu | null;

  // Auto-lancer la génération si pas de rapport existant
  useEffect(() => {
    if (!contenu && !hasStartedRef.current) {
      hasStartedRef.current = true;
      handleGenerate();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Animation des étapes pendant la génération
  useEffect(() => {
    if (generating) {
      setCurrentStep(0);
      stepIntervalRef.current = setInterval(() => {
        setCurrentStep((prev) => {
          if (prev < GENERATION_STEPS.length - 1) return prev + 1;
          return prev;
        });
      }, 2500);
    } else {
      if (stepIntervalRef.current) {
        clearInterval(stepIntervalRef.current);
        stepIntervalRef.current = null;
      }
    }
    return () => {
      if (stepIntervalRef.current) clearInterval(stepIntervalRef.current);
    };
  }, [generating]);

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

  // Télécharger un vrai fichier PDF
  async function handleDownloadPdf() {
    setDownloading(true);
    try {
      const response = await fetch('/api/export-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chantierId: chantier.id }),
      });

      if (!response.ok) throw new Error('Erreur export PDF');

      const blob = await response.blob();
      const dateStr = new Date(chantier.date_visite).toISOString().slice(0, 10);
      const fileName = `rapport-visite-${chantier.client_prenom}-${chantier.client_nom}-${dateStr}.pdf`
        .replace(/\s+/g, '-');

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Erreur PDF:', err);
      setError('Erreur lors de l\'export PDF');
    } finally {
      setDownloading(false);
    }
  }

  // Partager le rapport
  const [shareToast, setShareToast] = useState(false);
  async function handleShare() {
    const shareUrl = window.location.href;
    const title = `Rapport de visite — ${chantier.client_prenom} ${chantier.client_nom}`;

    if (navigator.share) {
      try {
        await navigator.share({ title, url: shareUrl });
      } catch {
        // L'utilisateur a annulé le partage
      }
    } else {
      await navigator.clipboard.writeText(shareUrl);
      setShareToast(true);
      setTimeout(() => setShareToast(false), 2000);
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
        {/* Génération en cours — loader multi-étapes */}
        {generating && (
          <div className="py-12">
            {/* Icone animée */}
            <div className="flex justify-center mb-8">
              <div className="relative w-20 h-20">
                {/* Cercle de fond */}
                <div className="absolute inset-0 rounded-full border-4 border-gray-100" />
                {/* Cercle animé */}
                <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-[#1E3A5F] animate-spin" style={{ animationDuration: '1.5s' }} />
                {/* Icone document au centre */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-[#1E3A5F]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
              </div>
            </div>

            <p className="text-center text-lg font-semibold text-gray-800 mb-1">
              Rapport en cours de construction
            </p>
            <p className="text-center text-sm text-gray-400 mb-8">
              {chantier.client_prenom} {chantier.client_nom}
            </p>

            {/* Etapes progressives */}
            <div className="space-y-3 max-w-xs mx-auto">
              {GENERATION_STEPS.map((step, i) => {
                const isActive = i <= currentStep;
                const isCurrent = i === currentStep;
                return (
                  <div
                    key={i}
                    className={`flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all duration-500 ${
                      isCurrent
                        ? 'bg-[#1E3A5F]/5 scale-[1.02]'
                        : isActive
                        ? 'bg-white'
                        : 'opacity-0 translate-y-2'
                    }`}
                    style={{
                      transitionDelay: isActive ? '0ms' : '0ms',
                    }}
                  >
                    <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors duration-500 ${
                      isCurrent
                        ? 'bg-[#1E3A5F]/10'
                        : isActive
                        ? 'bg-green-50'
                        : 'bg-gray-100'
                    }`}>
                      {isActive && !isCurrent ? (
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <StepIcon icon={step.icon} active={isActive} />
                      )}
                    </div>
                    <span className={`text-sm font-medium transition-colors duration-500 ${
                      isCurrent
                        ? 'text-[#1E3A5F]'
                        : isActive
                        ? 'text-gray-500'
                        : 'text-gray-300'
                    }`}>
                      {step.label}
                    </span>
                    {isCurrent && (
                      <div className="ml-auto flex gap-0.5">
                        <div className="w-1.5 h-1.5 bg-[#1E3A5F] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-1.5 h-1.5 bg-[#1E3A5F] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-1.5 h-1.5 bg-[#1E3A5F] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Erreur avec bouton réessayer */}
        {error && !generating && (
          <div className="py-12 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-red-50 rounded-full mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <p className="text-gray-700 text-lg font-medium mb-1">Erreur de génération</p>
            <p className="text-gray-400 text-sm mb-6">{error}</p>
            <button
              onClick={handleGenerate}
              className="h-12 px-6 bg-[#F97316] text-white font-semibold rounded-xl active:bg-orange-600 transition-colors"
            >
              Réessayer
            </button>
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
          <div className="max-w-lg mx-auto flex gap-2">
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
              onClick={handleShare}
              className="h-12 px-4 bg-gray-100 text-gray-700 font-semibold rounded-xl active:bg-gray-200 transition-colors flex items-center justify-center gap-2 text-sm"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
            </button>
            <button
              onClick={handleGenerate}
              className="h-12 px-4 bg-gray-100 text-gray-700 font-semibold rounded-xl active:bg-gray-200 transition-colors flex items-center justify-center gap-2 text-sm"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Toast "Lien copié" */}
      {shareToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-4 py-2 rounded-lg text-sm shadow-lg z-50 animate-fade-in">
          Lien copié dans le presse-papier
        </div>
      )}
    </div>
  );
}
