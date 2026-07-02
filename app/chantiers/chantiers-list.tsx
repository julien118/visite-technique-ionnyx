'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Chantier, DevisStatut } from '@/lib/types';
import ChantierCard from '@/components/ChantierCard';
import { useRouter } from 'next/navigation';
import UserMenu from '@/components/UserMenu';
import LogoLink from '@/components/LogoLink';
import AssistantTicket from '@/components/AssistantTicket';
import DeleteChantierModal from '@/components/DeleteChantierModal';
import { deriverStatutAffiche, sectionDe, type StatutAffiche } from '@/lib/statut-affaire';

interface ChantiersListProps {
  chantiers: Chantier[];
  // Statut du devis lié par chantier (chantier_id → statut), pour dériver la section.
  devisStatuts: Record<string, string>;
  userEmail: string;
  companyName: string;
  // Prénom de l'artisan (CONTACT_NOM, défaut « Hendrix ») pour la salutation
  // personnalisée. Discret, adapté à l'heure — calculé côté client (voir plus bas).
  greetingName: string;
}

// Les 3 sections d'accueil (parité ATG) : Tous, Visite technique, Devis.
type Tab = 'tous' | 'visite_technique' | 'devis';

// Tri intelligent : ce qui nécessite une action (en cours, planifié) remonte en
// haut, puis terminés/rapports, par date de visite décroissante.
const STATUT_PRIORITY: Record<string, number> = {
  en_cours: 0,
  planifie: 1,
  termine: 2,
  rapport_genere: 3,
};

function smartSort<T extends Chantier>(chantiers: T[]): T[] {
  return [...chantiers].sort((a, b) => {
    const pa = STATUT_PRIORITY[a.statut] ?? 9;
    const pb = STATUT_PRIORITY[b.statut] ?? 9;
    if (pa !== pb) return pa - pb;
    return new Date(b.date_visite).getTime() - new Date(a.date_visite).getTime();
  });
}

type ChantierAvecStatut = Chantier & { statutAffiche: StatutAffiche };

export default function ChantiersList({ chantiers: initialChantiers, devisStatuts, userEmail, companyName, greetingName }: ChantiersListProps) {
  const router = useRouter();
  const [chantiers, setChantiers] = useState(initialChantiers);

  // Salutation contextuelle « Bonjour Hendrix » — calculée côté client (heure de
  // l'appareil, pas celle du serveur Vercel en UTC) pour être juste et éviter
  // toute désynchro d'hydratation : le serveur et le premier rendu client
  // n'affichent rien, puis l'effet remplit la salutation après le montage.
  const [greeting, setGreeting] = useState('');
  useEffect(() => {
    const h = new Date().getHours();
    setGreeting(h < 5 ? 'Bonsoir' : h < 12 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir');
  }, []);
  const [deleteTarget, setDeleteTarget] = useState<Chantier | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('tous');
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Préchargement des routes les plus tapées : nouvelle visite + détail des chantiers.
  useEffect(() => {
    router.prefetch('/chantiers/nouveau');
    initialChantiers.slice(0, 12).forEach((c) => router.prefetch(`/chantiers/${c.id}`));
  }, [router, initialChantiers]);

  // Statut affiché dérivé pour chaque chantier (source de vérité unique).
  // Le statut du devis lié (Phase 3) est injecté depuis `devisStatuts` → un chantier
  // avec devis bascule en section « Devis » (Devis en cours / Devis envoyé).
  const chantiersAvecStatut = useMemo<ChantierAvecStatut[]>(
    () =>
      chantiers.map((c) => ({
        ...c,
        statutAffiche: deriverStatutAffiche({
          chantierStatut: c.statut,
          aCompteRendu: c.statut === 'rapport_genere',
          devisStatut: (devisStatuts[c.id] as DevisStatut | undefined) ?? null,
        }),
      })),
    [chantiers, devisStatuts],
  );

  const counts = useMemo(() => {
    let visite = 0;
    let devis = 0;
    for (const c of chantiersAvecStatut) {
      if (sectionDe(c.statutAffiche) === 'devis') devis += 1;
      else visite += 1;
    }
    return { tous: chantiersAvecStatut.length, visite_technique: visite, devis };
  }, [chantiersAvecStatut]);

  const tabs: { key: Tab; label: string; court?: string; count: number }[] = [
    { key: 'tous', label: 'Tous', count: counts.tous },
    { key: 'visite_technique', label: 'Visite technique', court: 'Visite', count: counts.visite_technique },
    { key: 'devis', label: 'Devis', count: counts.devis },
  ];

  const filtered = useMemo(() => {
    let result = chantiersAvecStatut;

    if (activeTab !== 'tous') {
      result = result.filter((c) => sectionDe(c.statutAffiche) === activeTab);
    }

    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter((c) =>
        `${c.client_prenom} ${c.client_nom}`.toLowerCase().includes(q) ||
        c.client_adresse.toLowerCase().includes(q) ||
        c.objet_travaux.toLowerCase().includes(q)
      );
    }

    return smartSort(result);
  }, [chantiersAvecStatut, activeTab, search]);

  function handleDeleteRequest(id: string) {
    const chantier = chantiers.find((c) => c.id === id);
    if (chantier) setDeleteTarget(chantier);
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/chantiers/${deleteTarget.id}`, { method: 'DELETE' });
      if (res.ok) {
        setChantiers((prev) => prev.filter((c) => c.id !== deleteTarget.id));
        setDeleteTarget(null);
      }
    } catch (err) {
      console.error('Erreur suppression:', err);
    } finally {
      setDeleting(false);
    }
  }

  function handleListScroll() {
    if (document.activeElement === searchRef.current) {
      searchRef.current?.blur();
    }
  }

  return (
    <div className="h-full bg-[#F8FAFC] flex flex-col">
      {/* Header — bannière noire (parité ATG) : logo à gauche, actions à droite */}
      <header className="flex-shrink-0 bg-header border-b border-white/10 px-5 py-4 pt-safe flex items-center justify-between">
        <LogoLink priority />
        <div className="flex items-center gap-3">
          <AssistantTicket />
          {/* Auth multi-user MTC37 : nom du compte + UserMenu conservés. Masqués
              sur téléphone (gain de place), visibles sur ordinateur. Le « ? »
              reste visible partout. */}
          <div className="hidden sm:flex items-center gap-3">
            <span className="text-sm text-gray-200">{companyName || userEmail.split('@')[0]}</span>
            <UserMenu />
          </div>
        </div>
      </header>

      {/* Onglets + recherche — figés sous l'en-tête (app-shell : ne défilent pas) */}
      <div className="flex-shrink-0 z-10 bg-[#F8FAFC] border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-5 pt-3 pb-4 space-y-3">
          {/* Onglets — 3 sections (parité ATG) */}
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
            {tabs.map(({ key, label, court, count }) => {
              const isActive = activeTab === key;
              return (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={`flex-1 py-2 px-2 sm:px-3 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap transition-all flex items-center justify-center gap-1.5 ${
                    isActive ? 'bg-white text-foreground shadow-sm' : 'text-gray-400 hover:text-gray-600'
                  }`}
                >
                  {/* Libellé court sur mobile, complet à partir de sm. */}
                  <span className="sm:hidden">{court ?? label}</span>
                  <span className="hidden sm:inline">{label}</span>
                  {count > 0 && (
                    <span className={`text-xs min-w-[18px] h-[18px] flex items-center justify-center rounded-full ${
                      isActive ? 'bg-primary/10 text-primary' : 'bg-gray-200/80 text-gray-400'
                    }`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Recherche */}
          <div className="relative">
            <svg
              className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher par nom, adresse, objet..."
              className="input-ionnyx pl-10 pr-10"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                aria-label="Effacer la recherche"
                className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-full text-gray-400 active:bg-gray-200"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Liste scrollable */}
      <main ref={listRef} onScroll={handleListScroll} className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-5 pt-4 pb-28">
          {/* Salutation discrète, personnalisée + adaptée à l'heure (partie 1). */}
          {greeting && greetingName && (
            <p className="text-[15px] text-gray-400 mb-3">
              {greeting} <span className="font-semibold text-gray-600">{greetingName}</span>
            </p>
          )}
          {chantiers.length === 0 ? (
            <EmptyState onCreate={() => router.push('/chantiers/nouveau')} />
          ) : filtered.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-gray-400 text-base">Aucun résultat</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((chantier) => (
                <ChantierCard
                  key={chantier.id}
                  chantier={chantier}
                  statutAffiche={chantier.statutAffiche}
                  onDelete={handleDeleteRequest}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {/* FAB + (création) — parité ATG : rond, vert, bas-droite */}
      <button
        onClick={() => router.push('/chantiers/nouveau')}
        aria-label="Nouvelle visite"
        className="fixed bottom-8 right-5 mb-safe w-14 h-14 btn-primary rounded-full flex items-center justify-center shadow-lg z-40 p-0"
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      {/* Modale de confirmation */}
      {deleteTarget && (
        <DeleteChantierModal
          clientName={`${deleteTarget.client_prenom} ${deleteTarget.client_nom}`.trim()}
          clientAddress={deleteTarget.client_adresse}
          deleting={deleting}
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
        <svg className="w-8 h-8 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      </div>
      <p className="text-gray-500 text-lg">Aucun chantier pour le moment</p>
      <p className="text-gray-400 text-sm mt-1 mb-6">Commencez par créer votre première visite</p>
      <button onClick={onCreate} className="btn-primary text-base px-8 py-3">
        Créer ma première visite
      </button>
    </div>
  );
}
