'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import LogoLink from '@/components/LogoLink';
import AssistantTicket from '@/components/AssistantTicket';
import { useToast } from '@/components/ToastProvider';
import { deplacerSection } from '@/lib/devis/sections-ordre';
import type { Chantier, Devis, SectionDevis, ArticleDevis } from '@/lib/types';

type Phase = 'technique' | 'metres';
type EtatMicro = 'pret' | 'enregistre' | 'traitement' | 'erreur';

interface ArticleBiblio {
  costructor_article_id: string;
  libelle: string;
  unite: string;
  prix_vente: number;
}

function formatEUR(n: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(
    Number.isFinite(n) ? n : 0,
  );
}
function normaliserRecherche(s: string): string {
  return (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

const Spin = ({ className = 'h-4 w-4' }: { className?: string }) => (
  <div className={`${className} border-2 border-white/30 border-t-white rounded-full animate-spin`} />
);

export default function DevisEditeur({ chantier, devis, phaseInitiale }: { chantier: Chantier; devis: Devis | null; phaseInitiale?: Phase }) {
  const router = useRouter();
  const { show } = useToast();

  const sectionsInitiales: SectionDevis[] =
    devis?.sections_finales && devis.sections_finales.length > 0
      ? devis.sections_finales
      : devis?.sections_proposees ?? [];

  const devisId = devis?.id ?? null;

  const [phase, setPhase] = useState<Phase>(phaseInitiale ?? 'technique');
  const [sections, setSections] = useState<SectionDevis[]>(sectionsInitiales);

  // Édition description d'article
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [savingDescription, setSavingDescription] = useState(false);
  // Renommage / ajout section
  const [editSectionIdx, setEditSectionIdx] = useState<number | null>(null);
  const [editSectionDraft, setEditSectionDraft] = useState('');
  const [savingSection, setSavingSection] = useState(false);
  const [sectionNouvelleIdx, setSectionNouvelleIdx] = useState<number | null>(null);
  // Autocomplétion (remplacer / ajouter)
  const [articlesBiblio, setArticlesBiblio] = useState<ArticleBiblio[] | null>(null);
  const [chargementBiblio, setChargementBiblio] = useState(false);
  const [rechercheKey, setRechercheKey] = useState<string | null>(null);
  // Suppressions
  const [suppressionCible, setSuppressionCible] = useState<{ sIdx: number; aIdx: number; libelle: string } | null>(null);
  const [suppressionSectionCible, setSuppressionSectionCible] = useState<{ sIdx: number; nom: string } | null>(null);
  const [reordEnCours, setReordEnCours] = useState(false);
  const dragFromRef = useRef<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  // Micro (phase métrés)
  const [etat, setEtat] = useState<EtatMicro>('pret');
  const [duree, setDuree] = useState(0);
  const [animKeys, setAnimKeys] = useState<Record<string, boolean>>({});
  const [enregistrement, setEnregistrement] = useState(false);
  // Empty state (aucun devis)
  const [generating, setGenerating] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const debutRef = useRef<number>(0);
  const autoSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sectionsRef = useRef<SectionDevis[]>(sectionsInitiales);

  useEffect(() => {
    sectionsRef.current = sections;
  }, [sections]);

  const totalHT = useMemo(
    () =>
      Math.round(
        sections.reduce(
          (acc, s) => acc + s.articles.reduce((sa, a) => sa + (a.quantite != null ? a.quantite * a.prix_vente : 0), 0),
          0,
        ) * 100,
      ) / 100,
    [sections],
  );

  // ---------- Persistance ----------
  async function sauver(next: SectionDevis[]) {
    if (!devisId) return;
    const res = await fetch('/api/devis/sauver', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ devisId, sections: next }),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(t || `Erreur ${res.status}`);
    }
  }
  function annulerAutoSave() {
    if (autoSaveRef.current) {
      clearTimeout(autoSaveRef.current);
      autoSaveRef.current = null;
    }
  }
  function planifierSauvegarde() {
    annulerAutoSave();
    autoSaveRef.current = setTimeout(() => {
      autoSaveRef.current = null;
      void sauver(sectionsRef.current).catch(() => {
        /* silencieux : re-tenté à la prochaine action / au récap */
      });
    }, 1000);
  }
  // Applique un nouvel état + sauvegarde immédiate, avec rollback en cas d'échec.
  async function appliquerEtSauver(next: SectionDevis[], okMsg?: string) {
    annulerAutoSave();
    const precedentes = sections;
    setSections(next);
    try {
      await sauver(next);
      if (okMsg) show(okMsg, 'success');
    } catch (e) {
      setSections(precedentes);
      show(e instanceof Error ? e.message : 'Échec de l’enregistrement', 'error');
    }
  }

  // ---------- Sections ----------
  function ouvrirEditionSection(sIdx: number, nom: string) {
    setEditingKey(null);
    setRechercheKey(null);
    setEditSectionIdx(sIdx);
    setEditSectionDraft(nom);
  }
  async function sauverTitreSection(sIdx: number) {
    const titre = editSectionDraft.trim();
    if (!titre || savingSection) return;
    setSavingSection(true);
    const next = sections.map((s, i) => (i === sIdx ? { ...s, nom: titre } : s));
    try {
      setSections(next);
      await sauver(next);
      if (sIdx === sectionNouvelleIdx) setSectionNouvelleIdx(null);
      setEditSectionIdx(null);
    } catch (e) {
      show(e instanceof Error ? e.message : 'Échec', 'error');
    } finally {
      setSavingSection(false);
    }
  }
  function ajouterSection() {
    if (savingSection) return;
    const next = [...sections, { nom: 'Nouvelle section', articles: [] as ArticleDevis[] }];
    const idx = next.length - 1;
    setSections(next);
    setSectionNouvelleIdx(idx);
    setEditSectionIdx(idx);
    setEditSectionDraft('Nouvelle section');
    void sauver(next).catch(() => {});
  }
  function annulerRenommageSection() {
    if (editSectionIdx != null && editSectionIdx === sectionNouvelleIdx) {
      // Section nouvelle jamais confirmée → on la retire.
      const idx = editSectionIdx;
      const next = sections.filter((_, i) => i !== idx);
      setSections(next);
      setSectionNouvelleIdx(null);
      setEditSectionIdx(null);
      void sauver(next).catch(() => {});
    } else {
      setEditSectionIdx(null);
    }
  }
  async function confirmerSuppressionSection() {
    if (!suppressionSectionCible) return;
    const { sIdx } = suppressionSectionCible;
    setSuppressionSectionCible(null);
    await appliquerEtSauver(sections.filter((_, i) => i !== sIdx), 'Section supprimée');
  }
  async function reordonnerSections(from: number, to: number) {
    if (reordEnCours) return;
    const next = deplacerSection(sections, from, to);
    if (next === sections) return;
    setReordEnCours(true);
    try {
      await appliquerEtSauver(next);
    } finally {
      setReordEnCours(false);
    }
  }
  const monterSection = (sIdx: number) => void reordonnerSections(sIdx, sIdx - 1);
  const descendreSection = (sIdx: number) => void reordonnerSections(sIdx, sIdx + 1);

  function demarrerGlisser(e: React.PointerEvent, sIdx: number) {
    if (reordEnCours || sections.length < 2) return;
    dragFromRef.current = sIdx;
    setDragOverIdx(sIdx);
    setEditingKey(null);
    setRechercheKey(null);
    try {
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }
  function survolerGlisser(e: React.PointerEvent) {
    if (dragFromRef.current == null) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const sec = el?.closest('[data-section-idx]') as HTMLElement | null;
    if (!sec) return;
    const idx = Number(sec.dataset.sectionIdx);
    if (!Number.isNaN(idx)) setDragOverIdx(idx);
  }
  function deposerGlisser(e: React.PointerEvent) {
    const from = dragFromRef.current;
    const to = dragOverIdx;
    dragFromRef.current = null;
    setDragOverIdx(null);
    try {
      (e.currentTarget as Element).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (from != null && to != null && from !== to) void reordonnerSections(from, to);
  }

  // ---------- Articles ----------
  function ouvrirEdition(key: string, description: string) {
    setEditSectionIdx(null);
    setRechercheKey(null);
    setEditingKey(key);
    setEditDraft(description);
  }
  async function sauverDescription(sIdx: number, aIdx: number) {
    if (savingDescription) return;
    setSavingDescription(true);
    const next = sections.map((s, i) =>
      i !== sIdx
        ? s
        : { ...s, articles: s.articles.map((a, j) => (j !== aIdx ? a : { ...a, description_technique: editDraft.trim() || a.libelle })) },
    );
    try {
      setSections(next);
      await sauver(next);
      setEditingKey(null);
      setEditDraft('');
      show('Description mise à jour', 'success');
    } catch (e) {
      show(e instanceof Error ? e.message : 'Échec', 'error');
    } finally {
      setSavingDescription(false);
    }
  }
  async function confirmerSuppression() {
    if (!suppressionCible) return;
    const { sIdx, aIdx } = suppressionCible;
    setSuppressionCible(null);
    setEditingKey(null);
    setRechercheKey(null);
    const next = sections
      .map((s, i) => (i !== sIdx ? s : { ...s, articles: s.articles.filter((_, j) => j !== aIdx) }))
      .filter((s) => s.articles.length > 0);
    await appliquerEtSauver(next, 'Article supprimé');
  }

  async function chargerBiblio() {
    if (articlesBiblio || chargementBiblio) return;
    setChargementBiblio(true);
    try {
      const res = await fetch('/api/devis/articles');
      if (!res.ok) throw new Error('Chargement de la bibliothèque échoué');
      const data = (await res.json()) as { articles: ArticleBiblio[] };
      setArticlesBiblio(data.articles ?? []);
    } catch (e) {
      show(e instanceof Error ? e.message : 'Bibliothèque indisponible', 'error');
    } finally {
      setChargementBiblio(false);
    }
  }
  function ouvrirRecherche(key: string) {
    setEditingKey(null);
    setEditSectionIdx(null);
    setRechercheKey(key);
    void chargerBiblio();
  }
  function fermerRecherche() {
    setRechercheKey(null);
  }
  async function choisirRemplacement(sIdx: number, aIdx: number, article: ArticleBiblio) {
    fermerRecherche();
    const next = sections.map((s, i) =>
      i !== sIdx
        ? s
        : {
            ...s,
            articles: s.articles.map((a, j) =>
              j !== aIdx
                ? a
                : {
                    ...a,
                    costructor_article_id: article.costructor_article_id,
                    libelle: article.libelle,
                    unite: article.unite,
                    prix_vente: article.prix_vente,
                    description_technique: article.libelle,
                  },
            ),
          },
    );
    await appliquerEtSauver(next, 'Article remplacé');
  }
  function ouvrirAjout(sIdx: number) {
    setEditingKey(null);
    setEditSectionIdx(null);
    setRechercheKey(`add::${sIdx}`);
    void chargerBiblio();
  }
  async function ajouterArticle(sIdx: number, article: ArticleBiblio) {
    fermerRecherche();
    if (sIdx === sectionNouvelleIdx) setSectionNouvelleIdx(null);
    const nouvel: ArticleDevis = {
      costructor_article_id: article.costructor_article_id,
      libelle: article.libelle,
      unite: article.unite,
      prix_vente: article.prix_vente,
      quantite: null,
      description_technique: article.libelle,
      origine: 'catalogue',
    };
    const next = sections.map((s, i) => (i === sIdx ? { ...s, articles: [...s.articles, nouvel] } : s));
    await appliquerEtSauver(next, 'Article ajouté');
  }

  // ---------- Métrés ----------
  function modifierQuantite(sIdx: number, aIdx: number, valeur: string) {
    const v = valeur === '' ? null : Number(valeur.replace(',', '.'));
    setSections((prev) => {
      const copie = prev.map((s) => ({ ...s, articles: s.articles.map((a) => ({ ...a })) }));
      const article = copie[sIdx]?.articles[aIdx];
      if (article) article.quantite = v != null && Number.isFinite(v) && v >= 0 ? v : null;
      return copie;
    });
    planifierSauvegarde();
  }

  async function demarrer() {
    setDuree(0);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (intervalRef.current) clearInterval(intervalRef.current);
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        await envoyerAudio(blob);
      };
      recorder.start();
      debutRef.current = Date.now();
      intervalRef.current = setInterval(() => setDuree(Math.floor((Date.now() - debutRef.current) / 1000)), 500);
      setEtat('enregistre');
    } catch (e) {
      show(e instanceof Error ? e.message : 'Permission micro refusée', 'error');
      setEtat('erreur');
    }
  }
  function arreter() {
    recorderRef.current?.stop();
    setEtat('traitement');
  }
  async function envoyerAudio(blob: Blob) {
    if (!devisId) return;
    annulerAutoSave();
    try {
      const fd = new FormData();
      fd.append('devisId', devisId);
      fd.append('audio', new File([blob], 'metres.webm', { type: 'audio/webm' }));
      fd.append('sections', JSON.stringify(sectionsRef.current));
      const res = await fetch('/api/devis/metres-vocaux', { method: 'POST', body: fd });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `Erreur ${res.status}`);
      }
      const data = (await res.json()) as { sections: SectionDevis[]; transcription?: string };
      const anim: Record<string, boolean> = {};
      data.sections.forEach((sNouv, i) => {
        sNouv.articles.forEach((aNouv, j) => {
          if (aNouv.quantite !== sectionsRef.current[i]?.articles[j]?.quantite) anim[`${i}::${j}`] = true;
        });
      });
      setSections(data.sections);
      setAnimKeys(anim);
      setEtat('pret');
      setTimeout(() => setAnimKeys({}), 1400);
    } catch (e) {
      show(e instanceof Error ? e.message : 'Erreur vocale', 'error');
      setEtat('erreur');
    }
  }

  async function allerAuRecap() {
    if (enregistrement) return;
    annulerAutoSave();
    setEnregistrement(true);
    try {
      await sauver(sections);
      router.push(`/chantiers/${chantier.id}/devis/recap`);
    } catch (e) {
      show(e instanceof Error ? e.message : 'Erreur', 'error');
      setEnregistrement(false);
    }
  }

  async function genererDevis() {
    setGenerating(true);
    try {
      const res = await fetch('/api/devis/proposer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chantierId: chantier.id }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Échec de la préparation');
      }
      router.refresh();
    } catch (e) {
      show(e instanceof Error ? e.message : 'Erreur', 'error');
      setGenerating(false);
    }
  }

  const enCours = etat === 'enregistre';
  const traitement = etat === 'traitement';

  // ============ RENDER ============
  const header = (
    <header
      className="bg-header border-b border-white/10 px-5 py-4 sticky top-0 z-10 flex items-center gap-3"
      style={{ paddingTop: 'max(16px, env(safe-area-inset-top))' }}
    >
      {phase === 'metres' ? (
        <button
          onClick={() => setPhase('technique')}
          aria-label="Revenir à la proposition technique"
          className="flex h-10 w-10 -ml-2 items-center justify-center rounded-lg text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
      ) : (
        <Link
          href={`/chantiers/${chantier.id}/rapport`}
          aria-label="Retour au rapport"
          className="flex h-10 w-10 -ml-2 items-center justify-center rounded-lg text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
        </Link>
      )}
      <div className="flex-1 min-w-0">
        <LogoLink width={120} height={28} />
        <p className="text-xs text-gray-300 truncate">
          Devis — {chantier.client_prenom} {chantier.client_nom}
          {phase === 'metres' ? ' · Métrés' : ''}
        </p>
      </div>
      <AssistantTicket className="shrink-0" />
    </header>
  );

  // État vide : aucun devis encore préparé
  if (!devis || sections.length === 0) {
    return (
      <div className="h-full flex flex-col bg-background">
        {header}
        <main className="flex-1 overflow-y-auto px-5 py-4">
          <div className="max-w-2xl mx-auto mt-10 rounded-2xl border border-border bg-white p-6 text-center">
            <div className="text-4xl mb-3">📋</div>
            <p className="text-sm font-semibold text-foreground mb-1">Aucun devis pour ce chantier</p>
            <p className="text-xs text-gray-500 mb-5">
              On croise vos observations avec vos devis passés et votre bibliothèque pour proposer un devis structuré.
            </p>
            <button
              onClick={genererDevis}
              disabled={generating}
              className="btn-primary w-full py-3.5 rounded-xl text-base font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {generating ? (<><Spin /> Préparation…</>) : 'Préparer mon devis'}
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background">
      {header}

      {phase === 'technique' ? (
        <>
          {/* Retour au rapport de visite : lien vert pleine largeur en tête, même
              design que les autres liens d'étape (métrés / récap). */}
          <div className="flex-shrink-0 px-5 pt-3">
            <Link
              href={`/chantiers/${chantier.id}/rapport`}
              className="flex items-center gap-1.5 -ml-1 p-1 text-primary hover:text-primary/80 transition-colors"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              <span className="text-sm font-medium">Voir mon rapport de visite</span>
            </Link>
          </div>
          <main className="flex-1 overflow-y-auto px-5 pt-2 pb-6">
            <div className="max-w-2xl mx-auto">
              {sections.map((s, sIdx) => (
                <section
                  key={`${s.nom}-${sIdx}`}
                  data-section-idx={sIdx}
                  className={`mb-5 rounded-2xl border bg-white p-4 transition-shadow ${dragOverIdx === sIdx ? 'border-primary ring-2 ring-primary/40' : 'border-border'}`}
                >
                  {/* En-tête section */}
                  {editSectionIdx === sIdx ? (
                    <div className="mb-3 space-y-2">
                      <input
                        type="text"
                        value={editSectionDraft}
                        onChange={(e) => setEditSectionDraft(e.target.value)}
                        className="input-ionnyx w-full text-sm font-bold uppercase tracking-wide text-primary"
                        placeholder="Nom de la section…"
                        autoFocus
                      />
                      <div className="flex justify-end gap-2">
                        <button onClick={annulerRenommageSection} disabled={savingSection} className="btn-tertiary text-xs px-3 py-1.5 rounded-lg">Annuler</button>
                        <button onClick={() => sauverTitreSection(sIdx)} disabled={savingSection || !editSectionDraft.trim()} className="btn-primary text-xs px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5">{savingSection && <Spin className="h-3 w-3" />}Enregistrer</button>
                      </div>
                    </div>
                  ) : (
                    <div className="mb-3">
                      <div className="flex items-center gap-2">
                        {sections.length > 1 && (
                          <button
                            type="button"
                            aria-label="Glisser pour déplacer"
                            disabled={reordEnCours}
                            onPointerDown={(e) => demarrerGlisser(e, sIdx)}
                            onPointerMove={survolerGlisser}
                            onPointerUp={deposerGlisser}
                            style={{ touchAction: 'none' }}
                            className="hidden sm:flex h-10 w-6 shrink-0 items-center justify-center text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing disabled:opacity-40"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.7" /><circle cx="15" cy="6" r="1.7" /><circle cx="9" cy="12" r="1.7" /><circle cx="15" cy="12" r="1.7" /><circle cx="9" cy="18" r="1.7" /><circle cx="15" cy="18" r="1.7" /></svg>
                          </button>
                        )}
                        <h2 className="flex-1 min-w-0 truncate text-sm font-bold uppercase tracking-wide text-primary">{s.nom}</h2>
                        {sections.length > 1 && (
                          <div className="flex shrink-0 items-center gap-2">
                            <button type="button" aria-label="Monter" disabled={sIdx === 0 || reordEnCours} onClick={() => monterSection(sIdx)} className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-gray-50 text-gray-700 active:bg-gray-200 disabled:opacity-30">
                              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15" /></svg>
                            </button>
                            <button type="button" aria-label="Descendre" disabled={sIdx === sections.length - 1 || reordEnCours} onClick={() => descendreSection(sIdx)} className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-gray-50 text-gray-700 active:bg-gray-200 disabled:opacity-30">
                              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                        <button type="button" onClick={() => ouvrirEditionSection(sIdx, s.nom)} className="action-link">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                          </svg>
                          Renommer la section
                        </button>
                        <button type="button" onClick={() => setSuppressionSectionCible({ sIdx, nom: s.nom })} className="action-link action-link-danger">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                          Supprimer la section
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Articles */}
                  <ul className="space-y-5">
                    {s.articles.map((a, aIdx) => {
                      const key = `${sIdx}::${aIdx}`;
                      const enEdition = editingKey === key;
                      return (
                        <li key={`${a.costructor_article_id}-${aIdx}`} className="border-l-2 border-primary/30 pl-3">
                          <div className="flex items-baseline justify-between gap-2 mb-1">
                            <p className="text-sm font-semibold text-foreground flex-1 min-w-0 break-words">
                              {a.libelle}
                              {a.origine === 'devis_passe' && (
                                <span className="ml-2 text-[10px] font-normal text-primary bg-primary/10 rounded px-1.5 py-0.5 align-middle">déjà chiffré</span>
                              )}
                            </p>
                            <p className="text-xs text-gray-400 whitespace-nowrap shrink-0">{formatEUR(a.prix_vente)} / {a.unite}</p>
                          </div>

                          {enEdition ? (
                            <div className="space-y-2">
                              <textarea value={editDraft} onChange={(e) => setEditDraft(e.target.value)} rows={10} className="input-ionnyx w-full text-xs leading-relaxed resize-y min-h-[140px]" autoFocus />
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[10px] text-gray-400">{editDraft.length} caractères</span>
                                <div className="flex gap-2">
                                  <button onClick={() => setEditingKey(null)} disabled={savingDescription} className="btn-tertiary text-xs px-3 py-1.5 rounded-lg">Annuler</button>
                                  <button onClick={() => sauverDescription(sIdx, aIdx)} disabled={savingDescription} className="btn-primary text-xs px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5">{savingDescription && <Spin className="h-3 w-3" />}Enregistrer</button>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <>
                              <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-line">{a.description_technique}</p>
                              <div className="mt-2 flex flex-wrap items-center gap-4">
                                <button type="button" onClick={() => ouvrirEdition(key, a.description_technique)} className="action-link">
                                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M12 20h9" />
                                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                                  </svg>
                                  Modifier la description
                                </button>
                                <button type="button" onClick={() => ouvrirRecherche(key)} className="action-link">
                                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="17 1 21 5 17 9" />
                                    <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                                    <polyline points="7 23 3 19 7 15" />
                                    <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                                  </svg>
                                  Remplacer l&apos;article
                                </button>
                                <button type="button" onClick={() => setSuppressionCible({ sIdx, aIdx, libelle: a.libelle })} className="action-link action-link-danger">
                                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="3 6 5 6 21 6" />
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                  </svg>
                                  Supprimer l&apos;article
                                </button>
                              </div>
                              {rechercheKey === key && (
                                <RechercheArticle articles={articlesBiblio} chargement={chargementBiblio} onChoisir={(art) => choisirRemplacement(sIdx, aIdx, art)} onFermer={fermerRecherche} />
                              )}
                            </>
                          )}
                        </li>
                      );
                    })}
                  </ul>

                  {/* Ajouter un article */}
                  <div className="mt-4 border-t border-border pt-3">
                    <button onClick={() => ouvrirAjout(sIdx)} className="text-xs text-primary font-medium hover:underline inline-flex items-center gap-1.5">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                      Ajouter un article
                    </button>
                    {rechercheKey === `add::${sIdx}` && (
                      <RechercheArticle articles={articlesBiblio} chargement={chargementBiblio} onChoisir={(art) => ajouterArticle(sIdx, art)} onFermer={fermerRecherche} />
                    )}
                  </div>
                </section>
              ))}

              <button
                type="button"
                onClick={ajouterSection}
                disabled={savingSection}
                className="w-full rounded-2xl border border-dashed border-primary/40 bg-primary/5 py-3 text-sm font-medium text-primary hover:bg-primary/10 transition inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                Ajouter une section
              </button>
            </div>
          </main>

          {/* Barre bas — passer aux métrés */}
          <div className="flex-shrink-0 bg-white border-t border-border px-5 py-4 pb-safe">
            <div className="max-w-2xl mx-auto">
              <button onClick={() => setPhase('metres')} className="btn-primary w-full py-3.5 rounded-xl text-base font-semibold flex items-center justify-center gap-2">
                Valider la technique, passer aux métrés
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Retour à la proposition technique (parité ATG) : lien vert pleine
              largeur en tête, bien plus visible que le chevron du header sur téléphone.
              Action inchangée : revient en Phase A. */}
          <div className="flex-shrink-0 px-5 pt-3">
            <button
              type="button"
              onClick={() => setPhase('technique')}
              className="flex items-center gap-1.5 -ml-1 p-1 text-primary hover:text-primary/80 transition-colors"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              <span className="text-sm font-medium">Revenir à la proposition technique</span>
            </button>
          </div>
          <main className="flex-1 overflow-y-auto px-5 pt-2 pb-6">
            <div className="max-w-2xl mx-auto">
              {/* Bloc vocal */}
              <section className="mb-5 rounded-2xl border border-primary bg-primary/5 p-5">
                <p className="text-xs uppercase tracking-wide text-primary text-center mb-3 font-semibold">Saisie des métrés à la voix</p>
                <div className="flex flex-col items-center gap-2">
                  <button
                    type="button"
                    onClick={enCours ? arreter : demarrer}
                    disabled={traitement}
                    className={`flex h-20 w-20 items-center justify-center rounded-full text-3xl transition active:scale-95 ${enCours ? 'bg-red-500 text-white animate-pulse' : 'bg-primary text-white'} ${traitement ? 'opacity-50' : ''}`}
                    aria-label={enCours ? 'Arrêter' : 'Dicter les métrés'}
                  >
                    {traitement ? <Spin className="h-6 w-6" /> : enCours ? '■' : '🎙'}
                  </button>
                  <p className="text-xs text-gray-500">
                    {etat === 'pret' && 'Touchez pour parler'}
                    {enCours && `Enregistrement… ${duree}s`}
                    {traitement && 'Je calcule…'}
                    {etat === 'erreur' && 'Réessayez'}
                  </p>
                </div>
                <p className="mt-3 text-center text-[10px] text-gray-400">Ex : « La dalle fait 20 m², l&apos;ouverture 2 mètres linéaires… »</p>
              </section>

              {/* Quantités par section */}
              {sections.map((s, sIdx) => (
                <section key={`${s.nom}-${sIdx}`} className="mb-4 rounded-2xl border border-border bg-white p-4">
                  <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-primary">{s.nom}</h2>
                  <ul className="space-y-2.5">
                    {s.articles.map((a, aIdx) => {
                      const enAnim = animKeys[`${sIdx}::${aIdx}`];
                      return (
                        <li key={`${a.costructor_article_id}-${aIdx}`} className="flex items-center gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-foreground leading-snug line-clamp-2">{a.libelle}</p>
                            <p className="text-xs text-gray-400">{formatEUR(a.prix_vente)} / {a.unite}</p>
                          </div>
                          <input
                            type="number"
                            min={0}
                            step="any"
                            inputMode="decimal"
                            value={a.quantite ?? ''}
                            onChange={(e) => modifierQuantite(sIdx, aIdx, e.target.value)}
                            placeholder="0"
                            className={`input-ionnyx w-20 px-2 py-2 text-right text-sm ${enAnim ? 'ring-2 ring-primary' : ''}`}
                          />
                          <span className="w-8 text-xs text-gray-400">{a.unite}</span>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          </main>

          {/* Barre bas — total + récap */}
          <div className="flex-shrink-0 bg-white border-t border-border px-5 py-4 pb-safe">
            <div className="max-w-2xl mx-auto">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="text-gray-500">Total HT</span>
                <span className="text-lg font-bold text-primary">{formatEUR(totalHT)}</span>
              </div>
              <button onClick={allerAuRecap} disabled={enregistrement || totalHT === 0} className="btn-primary w-full py-3.5 rounded-xl text-base font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
                {enregistrement ? (<><Spin /> Sauvegarde…</>) : (<>Voir le récapitulatif<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg></>)}
              </button>
              {totalHT === 0 && <p className="mt-1.5 text-center text-[11px] text-gray-400">Saisissez au moins une quantité pour continuer.</p>}
            </div>
          </div>
        </>
      )}

      {/* Modale suppression article */}
      {suppressionCible && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSuppressionCible(null)} />
          <div className="relative w-full sm:max-w-sm bg-white rounded-t-2xl sm:rounded-2xl p-6 animate-scale-in" style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}>
            <h3 className="text-lg font-bold text-foreground mb-2">Supprimer cet article ?</h3>
            <p className="text-gray-500 text-sm mb-6">« {suppressionCible.libelle} » sera retiré du devis.</p>
            <div className="flex gap-3">
              <button onClick={() => setSuppressionCible(null)} className="btn-tertiary flex-1 py-3 rounded-xl">Annuler</button>
              <button onClick={confirmerSuppression} className="flex-1 rounded-xl px-6 py-3 bg-red-600 text-white font-semibold">Supprimer</button>
            </div>
          </div>
        </div>
      )}

      {/* Modale suppression section */}
      {suppressionSectionCible && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSuppressionSectionCible(null)} />
          <div className="relative w-full sm:max-w-sm bg-white rounded-t-2xl sm:rounded-2xl p-6 animate-scale-in" style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}>
            <h3 className="text-lg font-bold text-foreground mb-2">Supprimer cette section ?</h3>
            <p className="text-gray-500 text-sm mb-6">La section « {suppressionSectionCible.nom} » et tous ses articles seront retirés.</p>
            <div className="flex gap-3">
              <button onClick={() => setSuppressionSectionCible(null)} className="btn-tertiary flex-1 py-3 rounded-xl">Annuler</button>
              <button onClick={confirmerSuppressionSection} className="flex-1 rounded-xl px-6 py-3 bg-red-600 text-white font-semibold">Supprimer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Autocomplétion d'article ----------
function RechercheArticle({
  articles,
  chargement,
  onChoisir,
  onFermer,
}: {
  articles: ArticleBiblio[] | null;
  chargement: boolean;
  onChoisir: (a: ArticleBiblio) => void;
  onFermer: () => void;
}) {
  const [texte, setTexte] = useState('');
  const [terme, setTerme] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setTerme(texte), 150);
    return () => clearTimeout(t);
  }, [texte]);
  const termePret = normaliserRecherche(terme).length >= 2;
  const resultats = useMemo(() => {
    if (!articles || !termePret) return [];
    const q = normaliserRecherche(terme);
    // Toute la bibliothèque concernée par la recherche (plafond haut de sécurité) ;
    // Hendrix affine en tapant plus de lettres. La liste est défilable ci-dessous.
    return articles.filter((a) => normaliserRecherche(a.libelle).includes(q)).slice(0, 100);
  }, [articles, terme, termePret]);

  return (
    <div className="mt-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
      <div className="flex items-center gap-2">
        <input type="text" value={texte} onChange={(e) => setTexte(e.target.value)} placeholder="Rechercher un ouvrage (ex : dalle, ouverture, fondation…)" autoFocus className="input-ionnyx flex-1 text-sm px-3 py-2" />
        <button type="button" onClick={onFermer} className="btn-tertiary text-xs px-3 py-2 rounded-lg">Fermer</button>
      </div>
      <div className="mt-2">
        {chargement && <p className="text-xs text-gray-400 inline-flex items-center gap-1.5"><span className="h-3 w-3 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />Chargement de votre bibliothèque…</p>}
        {!chargement && !termePret && <p className="text-[11px] text-gray-400">Tapez au moins 2 lettres pour chercher dans votre bibliothèque.</p>}
        {!chargement && termePret && resultats.length === 0 && <p className="text-xs text-gray-400">Aucun ouvrage ne correspond.</p>}
        {!chargement && resultats.length > 0 && (
          <>
            <p className="mb-1.5 text-[11px] text-gray-400">
              {resultats.length}{resultats.length >= 100 ? '+' : ''} ouvrage{resultats.length > 1 ? 's' : ''} — faites défiler pour choisir
            </p>
            <ul className="max-h-72 overflow-y-auto divide-y divide-border rounded-lg border border-border bg-white overscroll-contain">
              {resultats.map((a) => (
                <li key={a.costructor_article_id}>
                  <button type="button" onClick={() => onChoisir(a)} className="w-full text-left px-3 py-2 hover:bg-primary/5 transition flex items-baseline justify-between gap-3">
                    <span className="text-xs text-foreground flex-1">{a.libelle}</span>
                    <span className="text-[11px] text-gray-400 whitespace-nowrap">{formatEUR(a.prix_vente)} / {a.unite}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
