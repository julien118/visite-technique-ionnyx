'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Chantier, Rapport, RapportContenu } from '@/lib/types';
import { createClient } from '@/lib/supabase/client';
import ReportView from '@/components/ReportView';

interface RapportClientProps {
  chantier: Chantier;
  rapport: Rapport | null;
  hasDriveConnected: boolean;
}

const GENERATION_STEPS = [
  { label: 'Analyse des observations vocales…', icon: 'mic' },
  { label: 'Corrélation des photos…', icon: 'photo' },
  { label: 'Structuration du rapport…', icon: 'doc' },
  { label: 'Rédaction professionnelle…', icon: 'pen' },
  { label: 'Finalisation…', icon: 'check' },
];

function StepIcon({ icon, done }: { icon: string; done: boolean }) {
  if (done) {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    );
  }
  const cls = 'text-gray-400';
  const icons: Record<string, React.ReactNode> = {
    mic: <svg xmlns="http://www.w3.org/2000/svg" className={`w-4 h-4 ${cls}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>,
    photo: <svg xmlns="http://www.w3.org/2000/svg" className={`w-4 h-4 ${cls}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>,
    doc: <svg xmlns="http://www.w3.org/2000/svg" className={`w-4 h-4 ${cls}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
    pen: <svg xmlns="http://www.w3.org/2000/svg" className={`w-4 h-4 ${cls}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>,
    check: <svg xmlns="http://www.w3.org/2000/svg" className={`w-4 h-4 ${cls}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  };
  return <>{icons[icon] || null}</>;
}

export default function RapportClient({ chantier, rapport: initialRapport, hasDriveConnected }: RapportClientProps) {
  const router = useRouter();
  const supabase = createClient();
  const [rapport, setRapport] = useState(initialRapport);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [currentStep, setCurrentStep] = useState(0);
  const stepIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasStartedRef = useRef(false);

  // Drive
  const [showDriveModal, setShowDriveModal] = useState(false);
  const [driveStatus, setDriveStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [driveLink, setDriveLink] = useState('');

  // PDF preview
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const [pdfBlobUrl, setPdfBlobUrl] = useState('');
  const [loadingPdf, setLoadingPdf] = useState(false);

  // Toast
  const [shareToast, setShareToast] = useState('');

  const contenu = rapport?.contenu_json as RapportContenu | null;

  useEffect(() => {
    if (!contenu && !hasStartedRef.current) {
      hasStartedRef.current = true;
      handleGenerate();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (generating) {
      setCurrentStep(0);
      stepIntervalRef.current = setInterval(() => {
        setCurrentStep((prev) => prev < GENERATION_STEPS.length - 1 ? prev + 1 : prev);
      }, 2500);
    } else {
      if (stepIntervalRef.current) { clearInterval(stepIntervalRef.current); stepIntervalRef.current = null; }
    }
    return () => { if (stepIntervalRef.current) clearInterval(stepIntervalRef.current); };
  }, [generating]);

  // Cleanup blob URL
  useEffect(() => {
    return () => { if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl); };
  }, [pdfBlobUrl]);

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

  async function handleUpdateContenu(updatedContenu: RapportContenu) {
    setRapport((prev) => prev ? { ...prev, contenu_json: updatedContenu } : null);
    if (rapport?.id) {
      await supabase.from('rapports').update({ contenu_json: updatedContenu }).eq('id', rapport.id);
    }
  }

  // === PDF preview ===
  async function handlePreviewPdf() {
    setLoadingPdf(true);
    try {
      const response = await fetch('/api/export-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chantierId: chantier.id }),
      });
      if (!response.ok) throw new Error('Erreur export PDF');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setPdfBlobUrl(url);
      setShowPdfPreview(true);
    } catch (err) {
      console.error('Erreur PDF:', err);
      setError('Erreur lors de la génération du PDF');
    } finally {
      setLoadingPdf(false);
    }
  }

  function handleDownloadFromPreview() {
    if (!pdfBlobUrl) return;
    const dateStr = new Date(chantier.date_visite).toISOString().slice(0, 10);
    const fileName = `rapport-visite-${chantier.client_prenom}-${chantier.client_nom}-${dateStr}.pdf`.replace(/\s+/g, '-');
    const a = document.createElement('a');
    a.href = pdfBlobUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function closePdfPreview() {
    setShowPdfPreview(false);
    if (pdfBlobUrl) {
      URL.revokeObjectURL(pdfBlobUrl);
      setPdfBlobUrl('');
    }
  }

  // === Partage natif ===
  async function handleNativeShare() {
    const shareUrl = window.location.href;
    const title = `Rapport de visite — ${chantier.client_prenom} ${chantier.client_nom}`;
    if (navigator.share) {
      try { await navigator.share({ title, url: shareUrl }); } catch { /* annulé */ }
    } else {
      await navigator.clipboard.writeText(shareUrl);
      setShareToast('Lien copié dans le presse-papier');
      setTimeout(() => setShareToast(''), 2000);
    }
  }

  // === Google Drive ===
  function handleDriveClick() {
    if (driveStatus === 'success') return; // Déjà envoyé
    if (driveStatus === 'error') { uploadToDrive(); return; } // Retry
    if (hasDriveConnected) {
      uploadToDrive();
    } else {
      setShowDriveModal(true);
    }
  }

  function handleConnectDrive() {
    setShowDriveModal(false);
    window.location.href = `/api/auth/google?chantierId=${chantier.id}`;
  }

  async function uploadToDrive() {
    setDriveStatus('uploading');
    try {
      const response = await fetch('/api/drive/upload-rapport', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chantierId: chantier.id }),
      });
      if (!response.ok) {
        const data = await response.json();
        if (data.error === 'Google Drive non connecté') {
          setDriveStatus('idle');
          setShowDriveModal(true);
          return;
        }
        throw new Error(data.error || 'Erreur Drive');
      }
      const { webViewLink } = await response.json();
      setDriveLink(webViewLink || '');
      setDriveStatus('success');
    } catch (err) {
      console.error('Erreur Drive:', err);
      setDriveStatus('error');
    }
  }

  // === Drive button content ===
  function renderDriveButton() {
    const baseClass = 'w-full h-14 rounded-xl font-semibold text-base flex items-center justify-center gap-3 active:scale-[0.97] transition-all';

    if (driveStatus === 'uploading') {
      return (
        <button disabled className={`${baseClass} btn-primary opacity-80`}>
          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          Envoi en cours…
        </button>
      );
    }
    if (driveStatus === 'success') {
      return (
        <div>
          <button disabled className={`${baseClass} bg-emerald-700 text-white`}>
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
            Enregistré dans Drive
          </button>
          {driveLink && (
            <a href={driveLink} target="_blank" rel="noopener noreferrer" className="block text-center text-sm text-emerald-600 font-medium mt-2 active:text-emerald-700">
              Ouvrir dans Drive →
            </a>
          )}
        </div>
      );
    }
    if (driveStatus === 'error') {
      return (
        <button onClick={handleDriveClick} className={`${baseClass} bg-red-500 text-white`}>
          <span>⚠️</span>
          Erreur — Réessayer
        </button>
      );
    }
    // idle
    return (
      <button onClick={handleDriveClick} className={`${baseClass} btn-primary`} style={{ boxShadow: '0 4px 15px rgba(16,185,129,0.3)' }}>
        <span className="text-xl">☁️</span>
        Envoyer vers Google Drive
      </button>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* Header */}
      <header className="bg-[#1A1A1A] text-white px-4 py-4 sticky top-0 z-10">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <button onClick={() => router.push(`/chantiers/${chantier.id}`)} className="flex items-center justify-center w-10 h-10 -ml-2 rounded-lg active:bg-white/10 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          </button>
          <h1 className="text-lg font-semibold flex-1 text-center">Rapport</h1>
          <div className="w-10" />
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-4 pb-[220px]">
        {/* Loader */}
        {generating && (
          <div className="py-12">
            <div className="h-[3px] bg-gray-200 rounded-full mb-8 overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${((currentStep + 1) / GENERATION_STEPS.length) * 100}%`, background: 'linear-gradient(90deg, #1A1A1A, #10B981)' }} />
            </div>
            <div className="flex justify-center mb-8">
              <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #D1FAE5, #A7F3D0)', animation: 'spin 3s linear infinite' }}>
                <svg xmlns="http://www.w3.org/2000/svg" className="w-9 h-9 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} style={{ animation: 'spin 3s linear infinite reverse' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
            </div>
            <p className="text-center text-xl font-bold text-gray-900 mb-1">Rapport en cours de construction</p>
            <p className="text-center text-sm text-gray-500 mb-8">{chantier.client_prenom} {chantier.client_nom}</p>
            <div className="space-y-2 max-w-xs mx-auto">
              {GENERATION_STEPS.map((step, i) => {
                const isDone = i < currentStep;
                const isCurrent = i === currentStep;
                const isVisible = i <= currentStep;
                return (
                  <div key={i} className={`flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-500 ${!isVisible ? 'opacity-0 translate-y-2' : ''} ${isCurrent ? 'bg-[#F3F4F6]' : isDone ? 'bg-emerald-50' : 'bg-[#F9FAFB]'}`}>
                    <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${isDone ? 'bg-emerald-100' : isCurrent ? 'bg-white' : 'bg-gray-100'}`}>
                      {isCurrent ? <div className="w-4 h-4 border-2 border-gray-300 border-t-[#1A1A1A] rounded-full animate-spin" /> : <StepIcon icon={step.icon} done={isDone} />}
                    </div>
                    <span className={`text-sm transition-colors ${isCurrent ? 'font-medium text-gray-900' : isDone ? 'text-gray-600' : 'text-gray-400'}`}>{step.label}</span>
                    {isCurrent && (
                      <div className="ml-auto flex gap-0.5">
                        <div className="w-1.5 h-1.5 bg-[#1A1A1A] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-1.5 h-1.5 bg-[#1A1A1A] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-1.5 h-1.5 bg-[#1A1A1A] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Erreur */}
        {error && !generating && (
          <div className="py-12 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-red-50 rounded-full mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
            </div>
            <p className="text-gray-900 text-lg font-medium mb-1">Erreur de génération</p>
            <p className="text-gray-400 text-sm mb-6">{error}</p>
            <button onClick={handleGenerate} className="h-12 px-6 btn-primary font-semibold rounded-xl transition-transform">Réessayer</button>
          </div>
        )}

        {/* Rapport */}
        {contenu && !generating && (
          <ReportView contenu={contenu} onUpdate={handleUpdateContenu} />
        )}
      </main>

      {/* ===== NOUVELLE BARRE D'ACTIONS ===== */}
      {contenu && !generating && (
        <div
          className="fixed bottom-0 left-0 right-0 bg-white z-20 flex flex-col gap-2 px-4 pt-3"
          style={{
            boxShadow: '0 -4px 20px rgba(0,0,0,0.06)',
            paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
          }}
        >
          <div className="max-w-lg mx-auto w-full flex flex-col gap-2">
            {/* Niveau 1 — Google Drive (principal) */}
            {renderDriveButton()}

            {/* Niveau 2 — Prévisualiser le PDF */}
            <button
              onClick={handlePreviewPdf}
              disabled={loadingPdf}
              className="w-full h-12 btn-secondary rounded-xl font-medium text-sm flex items-center justify-center gap-2 active:scale-[0.97] disabled:opacity-50 transition-all"
            >
              {loadingPdf ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Génération…
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                  Prévisualiser le PDF
                </>
              )}
            </button>

            {/* Niveau 3 — Partager + Régénérer */}
            <div className="flex gap-2">
              <button onClick={handleNativeShare} className="flex-1 h-12 btn-tertiary rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-all">
                <span className="text-base">📤</span>
                Partager
              </button>
              <button onClick={handleGenerate} className="flex-1 h-12 btn-tertiary rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-all">
                <span className="text-base">🔄</span>
                Régénérer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== MODALE PRÉVISUALISATION PDF ===== */}
      {showPdfPreview && pdfBlobUrl && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          {/* Header modale */}
          <div className="flex items-center justify-between px-4 py-3 bg-[#1A1A1A] shrink-0">
            <span className="text-white font-semibold text-sm truncate flex-1">
              Rapport — {chantier.client_prenom} {chantier.client_nom}
            </span>
            <div className="flex items-center gap-3 shrink-0">
              <button onClick={handleDownloadFromPreview} className="text-emerald-400 text-sm font-medium active:text-emerald-300">
                Télécharger
              </button>
              <button onClick={closePdfPreview} className="text-white text-sm font-medium active:text-gray-300 ml-2">
                Fermer ✕
              </button>
            </div>
          </div>

          {/* Iframe PDF */}
          <iframe
            src={`${pdfBlobUrl}#toolbar=1&navpanes=0&scrollbar=1`}
            className="flex-1 w-full border-0 bg-gray-100"
            title="Aperçu du rapport"
          />
        </div>
      )}

      {/* Modale connexion Google Drive */}
      {showDriveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 backdrop-blur-sm">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowDriveModal(false)} />
          <div className="relative bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl animate-scale-in">
            <div className="text-center mb-5">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4" style={{ background: 'linear-gradient(135deg, #D1FAE5, #A7F3D0)' }}>
                <span className="text-3xl">☁️</span>
              </div>
              <h2 className="text-xl font-bold text-gray-900">Connecter Google Drive</h2>
            </div>
            <p className="text-sm text-gray-600 text-center mb-2">
              Tous vos rapports seront automatiquement enregistrés dans un dossier <strong>&quot;Assistant de Visite - Compte-rendu&quot;</strong> dans votre Google Drive.
            </p>
            <p className="text-xs text-gray-400 text-center mb-6">
              L&apos;application n&apos;accède qu&apos;aux fichiers qu&apos;elle crée. Vos autres fichiers restent privés.
            </p>
            <button onClick={handleConnectDrive} className="w-full h-12 btn-primary font-semibold rounded-xl transition-transform mb-3">
              Connecter mon Drive
            </button>
            <button onClick={() => setShowDriveModal(false)} className="w-full h-12 bg-[#F3F4F6] text-gray-500 font-medium rounded-xl active:bg-gray-200 transition-colors">
              Plus tard
            </button>
          </div>
        </div>
      )}

      {/* Toast */}
      {shareToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 bg-[#1A1A1A] text-white px-4 py-2 rounded-xl text-sm shadow-lg z-50 animate-fade-in">
          {shareToast}
        </div>
      )}
    </div>
  );
}
