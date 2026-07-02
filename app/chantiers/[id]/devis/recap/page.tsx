import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import LogoLink from '@/components/LogoLink';
import AssistantTicket from '@/components/AssistantTicket';
import BlocTotaux from './bloc-totaux';
import BoutonPousser from './bouton-pousser';
import ChampNomDevis from './champ-nom';
import type { Chantier, Devis, SectionDevis } from '@/lib/types';

export const dynamic = 'force-dynamic';

function formatEUR(n: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(
    Number.isFinite(n) ? n : 0,
  );
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function RecapPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [{ data: chantierRow, error: errCh }, { data: devisRow }] = await Promise.all([
    supabase.from('chantiers').select('*').eq('id', id).single(),
    supabase.from('devis').select('*').eq('chantier_id', id).maybeSingle(),
  ]);
  if (errCh || !chantierRow) notFound();
  if (!devisRow) redirect(`/chantiers/${id}/devis`);

  const chantier = chantierRow as Chantier;
  const devis = devisRow as Devis;
  const sections: SectionDevis[] =
    devis.sections_finales && devis.sections_finales.length > 0
      ? devis.sections_finales
      : devis.sections_proposees ?? [];

  const totalHT =
    Math.round(
      sections.reduce(
        (acc, s) => acc + s.articles.reduce((sa, a) => sa + (a.quantite != null ? a.quantite * a.prix_vente : 0), 0),
        0,
      ) * 100,
    ) / 100;

  // Nom auto par défaut (repris du client + adresse) ; écrasé par le nom saisi par Hendrix.
  const nomAuto =
    `Devis maçonnerie — ${chantier.client_prenom} ${chantier.client_nom}`.replace(/\s+/g, ' ').trim() +
    (chantier.client_adresse ? `, ${chantier.client_adresse}` : '');
  const nomActuel = devis.nom && devis.nom.trim() ? devis.nom.trim() : nomAuto;
  const dejaEnvoye = devis.statut === 'pousse_costructor';

  return (
    <div className="h-full flex flex-col bg-background">
      <header
        className="bg-header border-b border-white/10 px-5 py-4 sticky top-0 z-10 flex items-center gap-3"
        style={{ paddingTop: 'max(16px, env(safe-area-inset-top))' }}
      >
        <Link
          href={`/chantiers/${chantier.id}/devis?etape=metres`}
          aria-label="Saisir les métrés"
          className="flex h-10 w-10 -ml-2 items-center justify-center rounded-lg text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
        </Link>
        <div className="flex-1 min-w-0">
          <LogoLink width={120} height={28} />
          <p className="text-xs text-gray-300 truncate">Récapitulatif — {chantier.client_prenom} {chantier.client_nom}</p>
        </div>
        <AssistantTicket className="shrink-0" />
      </header>

      {/* Retour aux métrés : lien vert pleine largeur SOUS la bannière, même
          disposition que les liens d'étape (proposition technique / métrés). */}
      <div className="flex-shrink-0 px-5 pt-3">
        <Link
          href={`/chantiers/${chantier.id}/devis?etape=metres`}
          className="flex items-center gap-1.5 -ml-1 p-1 text-primary hover:text-primary/80 transition-colors"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          <span className="text-sm font-medium">Saisir les métrés</span>
        </Link>
      </div>

      <main className="flex-1 overflow-y-auto px-5 pt-2 pb-10">
        <div className="max-w-4xl mx-auto space-y-5">
          {/* État « Brouillon créé » */}
          {dejaEnvoye && (
            <div className="rounded-2xl border border-primary bg-primary/5 p-5 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-white">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              </div>
              <p className="text-base font-semibold text-foreground">Brouillon créé dans Costructor</p>
              <p className="text-sm text-gray-600 mt-1">{nomActuel}</p>
              {devis.costructor_devis_url && (
                <a
                  href={devis.costructor_devis_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex items-center gap-2 btn-primary px-5 py-2.5 rounded-xl text-sm font-semibold"
                >
                  Ouvrir dans Costructor
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
                </a>
              )}
            </div>
          )}

          {/* Nom du devis (modifiable) */}
          <ChampNomDevis devisId={devis.id} nomInitial={nomActuel} />

          {/* Tableau façon Costructor */}
          <div className="rounded-xl border border-border bg-white overflow-hidden">
            <div className="hidden sm:grid sm:grid-cols-[minmax(0,1fr)_80px_80px_110px_120px] gap-2 bg-primary text-white text-xs font-semibold uppercase tracking-wider px-3 py-2.5">
              <div>Désignation</div>
              <div className="text-right">Qté</div>
              <div className="text-center">Unité</div>
              <div className="text-right">PU HT</div>
              <div className="text-right">Total HT</div>
            </div>
            {sections.map((s, sIdx) => {
              const lignes = s.articles.filter((a) => a.quantite != null && a.quantite > 0);
              return (
                <div key={`${s.nom}-${sIdx}`}>
                  <div className="bg-gray-50 px-3 py-2 text-sm font-bold uppercase tracking-wide text-foreground border-t border-border">{s.nom}</div>
                  {lignes.length === 0 ? (
                    <div className="px-3 py-3 text-xs text-gray-400 italic border-t border-border">Aucun métré saisi sur cette section.</div>
                  ) : (
                    lignes.map((a, aIdx) => {
                      const total = (a.quantite ?? 0) * a.prix_vente;
                      const desc = a.description_technique?.trim();
                      const montreDesc = desc && desc !== a.libelle;
                      return (
                        <div key={`${a.costructor_article_id}-${aIdx}`} className="border-t border-border">
                          {/* Mobile */}
                          <div className="sm:hidden px-3 pt-2.5 pb-2.5">
                            <p className="text-sm text-foreground font-medium break-words">{a.libelle}</p>
                            {montreDesc && <p className="mt-1 text-[11px] text-gray-500 leading-relaxed whitespace-pre-line">{desc}</p>}
                            <div className="mt-1 flex items-baseline justify-between gap-2 text-xs tabular-nums">
                              <span className="text-gray-600">{a.quantite} {a.unite} · {formatEUR(a.prix_vente)}</span>
                              <span className="font-semibold text-foreground">{formatEUR(total)}</span>
                            </div>
                          </div>
                          {/* Desktop */}
                          <div className="hidden sm:grid sm:grid-cols-[minmax(0,1fr)_80px_80px_110px_120px] gap-2 px-3 pt-2.5 pb-2.5 text-sm items-start">
                            <div className="min-w-0 break-words">
                              <div className="text-foreground font-medium">{a.libelle}</div>
                              {montreDesc && <div className="mt-1 text-xs text-gray-500 leading-relaxed whitespace-pre-line">{desc}</div>}
                            </div>
                            <div className="text-right tabular-nums text-foreground">{a.quantite}</div>
                            <div className="text-center text-gray-500">{a.unite}</div>
                            <div className="text-right tabular-nums text-gray-700">{formatEUR(a.prix_vente)}</div>
                            <div className="text-right tabular-nums font-medium text-foreground">{formatEUR(total)}</div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              );
            })}
          </div>

          {/* Totaux */}
          <div className="sm:flex sm:justify-end">
            <BlocTotaux devisId={devis.id} totalHT={totalHT} tvaInitial={devis.tva_taux ?? 10} />
          </div>

          {/* Envoi */}
          <BoutonPousser devisId={devis.id} dejaEnvoye={dejaEnvoye} totalHT={totalHT} />
        </div>
      </main>
    </div>
  );
}
