'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Chantier, Rapport, RapportContenu } from '@/lib/types';
import { createClient } from '@/lib/supabase/client';
import ReportView from '@/components/ReportView';
import LogoLink from '@/components/LogoLink';
import AssistantTicket from '@/components/AssistantTicket';

interface RapportClientProps {
  chantier: Chantier;
  rapport: Rapport | null;
  hasPCloudConnected: boolean;
  pcloudEmail: string | null;
  capturePhotoUrls: string[];
  hasDevis: boolean;
}

const GENERATION_STEPS = [
  { label: 'Analyse des observations vocales…', icon: 'mic' },
  { label: 'Corrélation des photos…', icon: 'photo' },
  { label: 'Structuration du rapport…', icon: 'doc' },
  { label: 'Rédaction professionnelle…', icon: 'pen' },
  { label: 'Finalisation…', icon: 'check' },
];

// Étapes affichées pendant la préparation du devis (réplique ATG).
const DEVIS_STEPS = [
  'Lecture de vos observations…',
  'Recherche dans vos devis passés…',
  'Sélection des ouvrages de votre bibliothèque…',
  'Rédaction des descriptions techniques…',
  'Mise en forme du devis…',
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

export default function RapportClient({ chantier, rapport: initialRapport, hasPCloudConnected, pcloudEmail, capturePhotoUrls, hasDevis }: RapportClientProps) {
  const router = useRouter();
  const supabase = createClient();
  const [rapport, setRapport] = useState(initialRapport);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [currentStep, setCurrentStep] = useState(0);
  const stepIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasStartedRef = useRef(false);

  // ===== Devis (Phase 3) : préparation depuis le rapport =====
  const [preparingDevis, setPreparingDevis] = useState(false);
  const [devisStep, setDevisStep] = useState(0);

  // Padding bas dynamique : le contenu ne doit JAMAIS passer sous la barre
  // d'actions fixe (dont la hauteur varie selon les boutons affichés). On mesure
  // la barre et on réserve exactement sa hauteur (+ un peu d'air).
  const [bottomPad, setBottomPad] = useState(240);
  const roRef = useRef<ResizeObserver | null>(null);
  const bottomBarRef = useCallback((el: HTMLDivElement | null) => {
    roRef.current?.disconnect();
    if (!el) return;
    const maj = () => setBottomPad(el.offsetHeight + 24);
    maj();
    const ro = new ResizeObserver(maj);
    ro.observe(el);
    roRef.current = ro;
  }, []);

  async function handlePrepareDevis() {
    if (preparingDevis) return;
    setPreparingDevis(true);
    setDevisStep(0);
    const stepInterval = setInterval(() => {
      setDevisStep((prev) => (prev < DEVIS_STEPS.length - 1 ? prev + 1 : prev));
    }, 5500);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120000);
    try {
      const res = await fetch('/api/devis/proposer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chantierId: chantier.id }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      clearInterval(stepInterval);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Échec de la préparation du devis');
      }
      setDevisStep(DEVIS_STEPS.length);
      setTimeout(() => router.push(`/chantiers/${chantier.id}/devis`), 400);
    } catch (e) {
      clearTimeout(timer);
      clearInterval(stepInterval);
      const msg =
        e instanceof DOMException && e.name === 'AbortError'
          ? 'La préparation prend trop de temps. Vérifiez le réseau et réessayez.'
          : e instanceof Error
            ? e.message
            : 'Erreur lors de la préparation du devis';
      setError(msg);
      setPreparingDevis(false);
      setDevisStep(0);
    }
  }

  // pCloud
  const [showPCloudModal, setShowPCloudModal] = useState(false);
  const [pcloudStatus, setPCloudStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [pcloudLink, setPCloudLink] = useState('');
  const [pcloudConnected, setPCloudConnected] = useState(hasPCloudConnected);
  const [connectEmail, setConnectEmail] = useState(pcloudEmail || '');
  const [connectPassword, setConnectPassword] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState('');

  // PDF preview
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const [pdfBlobUrl, setPdfBlobUrl] = useState('');
  const [loadingPdf, setLoadingPdf] = useState(false);

  // Toast
  const [shareToast, setShareToast] = useState('');

  // Sauvegarde photos vers pellicule
  const [savingPhotos, setSavingPhotos] = useState(false);
  const [showSavePhotosModal, setShowSavePhotosModal] = useState(false);
  const [confirmingSkipPhotos, setConfirmingSkipPhotos] = useState(false);
  const [photosAlreadySaved, setPhotosAlreadySaved] = useState(false);
  const savePhotosPromptHandledRef = useRef(false);
  // Fallback client : si le fetch serveur renvoie 0 (timing, cookies SSR…),
  // on retente côté client pour que la popup puisse s'afficher.
  const [clientPhotoUrls, setClientPhotoUrls] = useState<string[]>([]);

  const contenu = rapport?.contenu_json as RapportContenu | null;
  // Photos disponibles : on combine les sources possibles pour ne rien perdre
  // (prop serveur OU fallback client si le prop est vide).
  const effectiveCapturePhotoUrls = capturePhotoUrls.length > 0 ? capturePhotoUrls : clientPhotoUrls;
  const allPhotoUrls = contenu
    ? Array.from(new Set((contenu.observations ?? []).flatMap((o) => (o.photos ?? []).map((p) => p.url))))
    : Array.from(new Set(effectiveCapturePhotoUrls));

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

  // Fallback : si le prop serveur capturePhotoUrls est vide, on retente côté client
  // au montage (RLS, timing SSR, etc.). Ça garantit que la popup peut s'afficher.
  useEffect(() => {
    if (capturePhotoUrls.length > 0) return;
    let cancelled = false;
    supabase
      .from('capture_items')
      .select('photo_url')
      .eq('chantier_id', chantier.id)
      .eq('type', 'photo')
      .not('photo_url', 'is', null)
      .then(({ data }) => {
        if (cancelled || !data) return;
        const urls = data.map((d) => d.photo_url as string).filter(Boolean);
        if (urls.length > 0) setClientPhotoUrls(urls);
      });
    return () => { cancelled = true; };
  }, [capturePhotoUrls.length, chantier.id, supabase]);

  // Pendant la génération du rapport : on profite du temps d'attente pour proposer
  // d'enregistrer les photos dans la pellicule. Une seule proposition par session.
  useEffect(() => {
    if (generating && effectiveCapturePhotoUrls.length > 0 && !savePhotosPromptHandledRef.current) {
      const t = setTimeout(() => setShowSavePhotosModal(true), 200);
      return () => clearTimeout(t);
    }
  }, [generating, effectiveCapturePhotoUrls.length]);

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
    // Nom personnalisé façon ATG : « compte-rendu-jerome-lechat-2026-06-18.pdf »
    // (doit rester aligné avec le Content-Disposition de /api/export-pdf).
    const slug = `${chantier.client_prenom || ''} ${chantier.client_nom || ''}`
      .normalize('NFD').replace(/[^\x00-\x7f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const fileName = `compte-rendu-${slug || 'client'}-${dateStr}.pdf`;
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

  function dismissSavePhotosPrompt() {
    savePhotosPromptHandledRef.current = true;
    setShowSavePhotosModal(false);
    setConfirmingSkipPhotos(false);
  }

  function requestSkipConfirmation() {
    setConfirmingSkipPhotos(true);
  }

  function cancelSkipConfirmation() {
    setConfirmingSkipPhotos(false);
  }

  // === Enregistrement photos dans la pellicule via feuille de partage native ===
  async function handleSavePhotosToGallery() {
    if (allPhotoUrls.length === 0 || savingPhotos) return;
    setSavingPhotos(true);
    try {
      const dateStr = new Date(chantier.date_visite).toISOString().slice(0, 10);
      const files = await Promise.all(
        allPhotoUrls.map(async (url, i) => {
          const res = await fetch(url);
          if (!res.ok) throw new Error('Téléchargement photo échoué');
          const blob = await res.blob();
          const ext = (blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
          return new File([blob], `visite-${dateStr}-photo-${i + 1}.${ext}`, { type: blob.type });
        })
      );

      if (typeof navigator !== 'undefined' && navigator.canShare?.({ files })) {
        try {
          await navigator.share({
            files,
            title: `Photos visite — ${chantier.client_prenom} ${chantier.client_nom}`,
          });
          // Partage abouti : on referme la popup, on ne la repropose plus,
          // et on masque le bouton du bas qui devient inutile.
          savePhotosPromptHandledRef.current = true;
          setShowSavePhotosModal(false);
          setPhotosAlreadySaved(true);
        } catch {
          // Utilisateur a annulé : silencieux, on laisse la popup ouverte.
        }
      } else {
        setShareToast('Fonction disponible uniquement sur iPhone / Android');
        setTimeout(() => setShareToast(''), 3000);
      }
    } catch (err) {
      console.error('Erreur sauvegarde photos:', err);
      setShareToast('Erreur — réessayez');
      setTimeout(() => setShareToast(''), 2500);
    } finally {
      setSavingPhotos(false);
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

  // === pCloud ===
  function handlePCloudClick() {
    if (pcloudStatus === 'success') return;
    if (pcloudStatus === 'error') { uploadToPCloud(); return; }
    if (pcloudConnected) {
      uploadToPCloud();
    } else {
      setShowPCloudModal(true);
    }
  }

  async function handleConnectPCloud(e: React.FormEvent) {
    e.preventDefault();
    setConnecting(true);
    setConnectError('');
    try {
      const response = await fetch('/api/auth/pcloud/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: connectEmail, password: connectPassword, region: 'EU' }),
      });
      const data = await response.json();
      if (!response.ok) {
        setConnectError(data.error || 'Connexion échouée');
        return;
      }
      setConnectPassword('');
      setPCloudConnected(true);
      setShowPCloudModal(false);
      uploadToPCloud();
    } catch {
      setConnectError('Erreur réseau');
    } finally {
      setConnecting(false);
    }
  }

  async function uploadToPCloud() {
    setPCloudStatus('uploading');
    try {
      const response = await fetch('/api/pcloud/upload-rapport', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chantierId: chantier.id }),
      });
      if (!response.ok) {
        const data = await response.json();
        if (data.error === 'pCloud non connecté') {
          setPCloudConnected(false);
          setPCloudStatus('idle');
          setShowPCloudModal(true);
          return;
        }
        throw new Error(data.error || 'Erreur pCloud');
      }
      const { publicLink } = await response.json();
      setPCloudLink(publicLink || '');
      setPCloudStatus('success');
    } catch (err) {
      console.error('Erreur pCloud:', err);
      setPCloudStatus('error');
    }
  }

  function renderPCloudButton() {
    const baseClass = 'w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 active:scale-[0.97] transition-all';

    if (pcloudStatus === 'uploading') {
      return (
        <button disabled className={`${baseClass} btn-primary opacity-80`}>
          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          Envoi en cours…
        </button>
      );
    }
    if (pcloudStatus === 'success') {
      return (
        <div>
          <button disabled className={`${baseClass} bg-emerald-700 text-white`}>
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
            Enregistré dans pCloud
          </button>
          {pcloudLink && (
            <a href={pcloudLink} target="_blank" rel="noopener noreferrer" className="block text-center text-xs text-emerald-600 font-medium mt-1.5 active:text-emerald-700">
              Ouvrir dans pCloud →
            </a>
          )}
        </div>
      );
    }
    if (pcloudStatus === 'error') {
      return (
        <button onClick={handlePCloudClick} className={`${baseClass} bg-red-500 text-white`}>
          <span className="text-base">⚠️</span>
          Erreur — Réessayer
        </button>
      );
    }
    return (
      <button onClick={handlePCloudClick} className={`${baseClass} btn-primary`}>
        <span className="text-base">☁️</span>
        Envoyer vers pCloud
      </button>
    );
  }

  return (
    <div className="min-h-full bg-[#F8FAFC]">
      {/* Header — bannière noire (parité ATG) : retour → liste, logo + client, « ? ». */}
      <header className="bg-header border-b border-white/10 px-5 py-4 pt-safe sticky top-0 z-10 flex items-center gap-3">
        <button
          onClick={() => router.push('/chantiers')}
          aria-label="Retour"
          className="flex h-10 w-10 -ml-2 items-center justify-center rounded-lg text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <div className="flex-1 min-w-0">
          <LogoLink width={120} height={28} />
          <p className="text-xs text-gray-300 truncate">{chantier.client_prenom} {chantier.client_nom}</p>
        </div>
        <AssistantTicket className="shrink-0" />
      </header>

      <main className="max-w-2xl mx-auto px-5 py-4" style={{ paddingBottom: bottomPad }}>
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
          <>
            {/* Carte devis en tête (parité ATG) — l'étape suivante après le rapport */}
            <div className="mb-5 rounded-2xl border border-primary bg-primary/5 p-4">
              <div className="flex items-start gap-3 mb-3">
                <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Compte rendu généré</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {hasDevis
                      ? "Un devis est déjà en préparation pour ce chantier. Vous pouvez le reprendre là où vous l'avez laissé."
                      : 'Vos observations peuvent maintenant être converties en devis structuré.'}
                  </p>
                </div>
              </div>
              {hasDevis ? (
                <button
                  onClick={() => router.push(`/chantiers/${chantier.id}/devis`)}
                  className="btn-primary w-full text-sm py-3 rounded-xl flex items-center justify-center gap-2"
                >
                  Continuer mon devis
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
                </button>
              ) : (
                <button
                  onClick={handlePrepareDevis}
                  disabled={preparingDevis}
                  className="btn-primary w-full text-sm py-3 rounded-xl flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {preparingDevis ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Préparation…
                    </>
                  ) : (
                    <>
                      <span className="text-base">📋</span>
                      Préparer mon devis
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
                    </>
                  )}
                </button>
              )}
            </div>

            <ReportView contenu={contenu} onUpdate={handleUpdateContenu} />
          </>
        )}
      </main>

      {/* ===== POPUP "Enregistrer photos dans pellicule" ===== */}
      {/* Reste affichée même après la fin du loader. Ne se ferme QUE via les boutons. */}
      {showSavePhotosModal && effectiveCapturePhotoUrls.length > 0 && (
        <div className="fixed inset-0 z-30 flex items-center justify-center px-4">
          {/* Backdrop non cliquable : on force l'utilisateur à choisir explicitement */}
          <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" />
          {/* Carte */}
          <div className="relative bg-white rounded-2xl shadow-2xl p-5 max-w-sm w-full animate-scale-in">
            {!confirmingSkipPhotos ? (
              <>
                <div className="text-center mb-4">
                  <div
                    className="inline-flex w-14 h-14 rounded-full items-center justify-center mb-3"
                    style={{ background: 'linear-gradient(135deg, #D1FAE5, #A7F3D0)' }}
                  >
                    <span className="text-2xl">🖼️</span>
                  </div>
                  <h3 className="font-bold text-gray-900 text-base mb-1">
                    Enregistrer vos photos&nbsp;?
                  </h3>
                  <p className="text-sm text-gray-600">
                    Vous voulez enregistrer vos {effectiveCapturePhotoUrls.length} photo{effectiveCapturePhotoUrls.length > 1 ? 's' : ''} de la visite dans votre pellicule iPhone&nbsp;?
                  </p>
                </div>
                <button
                  onClick={handleSavePhotosToGallery}
                  disabled={savingPhotos}
                  className="w-full h-12 btn-primary rounded-xl font-semibold text-sm flex items-center justify-center gap-2 mb-2 disabled:opacity-60 active:scale-[0.97] transition-all"
                >
                  {savingPhotos ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Préparation…
                    </>
                  ) : (
                    <>
                      <span className="text-base">📥</span>
                      Oui, enregistrer dans ma pellicule
                    </>
                  )}
                </button>
                <button
                  onClick={requestSkipConfirmation}
                  disabled={savingPhotos}
                  className="w-full h-10 text-gray-500 text-sm font-medium rounded-xl active:bg-gray-100 transition-colors disabled:opacity-50"
                >
                  Plus tard
                </button>
              </>
            ) : (
              <>
                <div className="text-center mb-4">
                  <div
                    className="inline-flex w-14 h-14 rounded-full items-center justify-center mb-3"
                    style={{ background: 'linear-gradient(135deg, #FEF3C7, #FDE68A)' }}
                  >
                    <span className="text-2xl">⚠️</span>
                  </div>
                  <h3 className="font-bold text-gray-900 text-base mb-1">
                    Êtes-vous sûr·e&nbsp;?
                  </h3>
                  <p className="text-sm text-gray-600">
                    Vos {effectiveCapturePhotoUrls.length} photo{effectiveCapturePhotoUrls.length > 1 ? 's' : ''} ne ser{effectiveCapturePhotoUrls.length > 1 ? 'ont' : 'a'} pas enregistré{effectiveCapturePhotoUrls.length > 1 ? 'es' : 'e'} dans votre pellicule iPhone.
                  </p>
                </div>
                <button
                  onClick={cancelSkipConfirmation}
                  className="w-full h-12 btn-primary rounded-xl font-semibold text-sm flex items-center justify-center gap-2 mb-2 active:scale-[0.97] transition-all"
                >
                  <span className="text-base">↩️</span>
                  Revenir en arrière
                </button>
                <button
                  onClick={dismissSavePhotosPrompt}
                  className="w-full h-10 text-gray-500 text-sm font-medium rounded-xl active:bg-gray-100 transition-colors"
                >
                  Oui, ne pas enregistrer
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ===== OVERLAY PRÉPARATION DU DEVIS ===== */}
      {preparingDevis && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col items-center justify-center px-6 text-center" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center mb-8 animate-pulse">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="9" y1="13" x2="15" y2="13" /><line x1="9" y1="17" x2="13" y2="17" /></svg>
          </div>
          <p className="text-sm font-semibold text-foreground mb-1">Préparation de votre devis</p>
          <p className="text-xs text-gray-400 mb-8 max-w-xs">Vos observations sont croisées avec vos devis passés et votre bibliothèque pour proposer un devis structuré.</p>
          <div className="w-full max-w-xs space-y-3">
            {DEVIS_STEPS.map((step, i) => (
              <div key={i} className={`flex items-center gap-3 transition-all duration-500 ${i <= devisStep ? 'opacity-100' : 'opacity-30'}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${i < devisStep ? 'bg-primary text-white' : i === devisStep ? 'bg-primary/20 text-primary animate-pulse' : 'bg-gray-200 text-gray-400'}`}>
                  {i < devisStep ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  ) : (
                    <span className="text-xs font-bold">{i + 1}</span>
                  )}
                </div>
                <span className="text-sm text-foreground text-left">{step}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== NOUVELLE BARRE D'ACTIONS ===== */}
      {contenu && !generating && (
        <div
          ref={bottomBarRef}
          className="fixed bottom-0 left-0 right-0 bg-white z-20 flex flex-col gap-2 px-5 py-4 pb-safe border-t border-border"
        >
          <div className="max-w-2xl mx-auto w-full flex flex-col gap-1.5">
            {/* Niveau 1 — pCloud (principal) */}
            {renderPCloudButton()}

            {/* Niveau 2 — Prévisualiser le PDF */}
            <button
              onClick={handlePreviewPdf}
              disabled={loadingPdf}
              className="w-full py-3 btn-secondary rounded-xl font-medium text-sm flex items-center justify-center gap-2 active:scale-[0.97] disabled:opacity-50 transition-all"
            >
              {loadingPdf ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Génération…
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                  Prévisualiser le PDF
                </>
              )}
            </button>

            {/* Niveau 3 — Partager + Régénérer */}
            <div className="flex gap-1.5">
              <button onClick={handleNativeShare} className="flex-1 py-3 btn-tertiary rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 transition-all">
                <span className="text-sm">📤</span>
                Partager
              </button>
              <button onClick={handleGenerate} className="flex-1 py-3 btn-tertiary rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 transition-all">
                <span className="text-sm">🔄</span>
                Régénérer
              </button>
            </div>

            {/* Niveau 4 — Enregistrer photos dans pellicule */}
            {/* Masqué si l'utilisateur a déjà sauvegardé via la popup (succès du share) */}
            {allPhotoUrls.length > 0 && !photosAlreadySaved && (
              <button
                onClick={handleSavePhotosToGallery}
                disabled={savingPhotos}
                className="w-full py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-all text-gray-500 active:bg-gray-100 disabled:opacity-50"
              >
                {savingPhotos ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                    Préparation des photos…
                  </>
                ) : (
                  <>
                    <span className="text-sm">🖼️</span>
                    Enregistrer les photos dans ma galerie ({allPhotoUrls.length})
                  </>
                )}
              </button>
            )}
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

      {/* Modale connexion pCloud */}
      {showPCloudModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 backdrop-blur-sm">
          <div className="absolute inset-0 bg-black/60" onClick={() => !connecting && setShowPCloudModal(false)} />
          <div className="relative bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl animate-scale-in">
            <div className="text-center mb-5">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4" style={{ background: 'linear-gradient(135deg, #D1FAE5, #A7F3D0)' }}>
                <span className="text-3xl">☁️</span>
              </div>
              <h2 className="text-xl font-bold text-gray-900">Connecter pCloud</h2>
            </div>
            <p className="text-sm text-gray-600 text-center mb-2">
              Vos rapports seront automatiquement enregistrés dans le dossier <strong>2 ETUDES-DEVIS</strong> de votre pCloud.
            </p>
            <p className="text-xs text-gray-400 text-center mb-5">
              Votre mot de passe n&apos;est jamais stocké : il est échangé contre un jeton sécurisé lors de la connexion.
            </p>

            <form onSubmit={handleConnectPCloud} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Email pCloud</label>
                <input
                  type="email"
                  value={connectEmail}
                  onChange={(e) => setConnectEmail(e.target.value)}
                  required
                  autoComplete="username"
                  className="w-full h-11 px-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                  placeholder="email@exemple.com"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Mot de passe pCloud</label>
                <input
                  type="password"
                  value={connectPassword}
                  onChange={(e) => setConnectPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="w-full h-11 px-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                  placeholder="••••••••"
                />
              </div>

              {connectError && (
                <p className="text-xs text-red-500 text-center">{connectError}</p>
              )}

              <button
                type="submit"
                disabled={connecting || !connectEmail || !connectPassword}
                className="w-full h-12 btn-primary font-semibold rounded-xl transition-transform disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {connecting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Connexion…
                  </>
                ) : (
                  'Connecter pCloud'
                )}
              </button>
              <button
                type="button"
                onClick={() => setShowPCloudModal(false)}
                disabled={connecting}
                className="w-full h-12 bg-[#F3F4F6] text-gray-500 font-medium rounded-xl active:bg-gray-200 transition-colors"
              >
                Plus tard
              </button>
            </form>
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
