'use client';

import { useMemo, useRef, useState } from 'react';
import { Chantier, ChantierStatut } from '@/lib/types';
import ChantierCard from '@/components/ChantierCard';
import { useRouter } from 'next/navigation';
import UserMenu from '@/components/UserMenu';
import DeleteChantierModal from '@/components/DeleteChantierModal';

interface ChantiersListProps {
  chantiers: Chantier[];
  userEmail: string;
  companyName: string;
}

type FilterTab = 'tous' | ChantierStatut;

const TABS: { key: FilterTab; label: string; statuts: ChantierStatut[] }[] = [
  { key: 'tous', label: 'Tous', statuts: [] },
  { key: 'planifie', label: 'Planifiés', statuts: ['planifie'] },
  { key: 'en_cours', label: 'En cours', statuts: ['en_cours'] },
  { key: 'termine', label: 'Terminés', statuts: ['termine'] },
  { key: 'rapport_genere', label: 'Rapports', statuts: ['rapport_genere'] },
];

// Priorité de tri : en_cours et planifie en premier
const STATUT_PRIORITY: Record<ChantierStatut, number> = {
  en_cours: 0,
  planifie: 1,
  termine: 2,
  rapport_genere: 3,
};

function smartSort(chantiers: Chantier[]): Chantier[] {
  return [...chantiers].sort((a, b) => {
    const pa = STATUT_PRIORITY[a.statut];
    const pb = STATUT_PRIORITY[b.statut];
    if (pa !== pb) return pa - pb;
    return new Date(b.date_visite).getTime() - new Date(a.date_visite).getTime();
  });
}

export default function ChantiersList({ chantiers: initialChantiers, userEmail, companyName }: ChantiersListProps) {
  const router = useRouter();
  const [chantiers, setChantiers] = useState(initialChantiers);
  const [deleteTarget, setDeleteTarget] = useState<Chantier | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [activeTab, setActiveTab] = useState<FilterTab>('tous');
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Compteurs par statut
  const counts = useMemo(() => {
    const c: Record<string, number> = { tous: chantiers.length };
    for (const ch of chantiers) {
      c[ch.statut] = (c[ch.statut] || 0) + 1;
    }
    return c;
  }, [chantiers]);

  // Filtrage par onglet + recherche
  const filtered = useMemo(() => {
    let result = chantiers;

    // Filtre par statut
    if (activeTab !== 'tous') {
      result = result.filter((c) => c.statut === activeTab);
    }

    // Filtre par recherche
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter((c) =>
        `${c.client_prenom} ${c.client_nom}`.toLowerCase().includes(q) ||
        c.client_adresse.toLowerCase().includes(q) ||
        c.objet_travaux.toLowerCase().includes(q)
      );
    }

    return smartSort(result);
  }, [chantiers, activeTab, search]);

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

  // Fermer le clavier quand on scrolle la liste
  function handleListScroll() {
    if (document.activeElement === searchRef.current) {
      searchRef.current?.blur();
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-[#1E3A5F] text-white px-4 py-4">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight">{companyName || userEmail.split('@')[0]}</h1>
            <p className="text-sm text-blue-200">Assistant de Visite</p>
          </div>
          <UserMenu />
        </div>
      </header>

      {/* Onglets + Recherche (sticky) */}
      <div className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200">
        {/* Onglets */}
        <div className="max-w-lg mx-auto">
          <div
            className="flex gap-2 px-4 py-3 overflow-x-auto scrollbar-hide"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            {TABS.map((tab) => {
              const isActive = activeTab === tab.key;
              const count = counts[tab.key] || 0;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex-shrink-0 min-h-[44px] px-4 rounded-full text-sm font-semibold transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-[#1E3A5F] text-white'
                      : 'bg-white text-gray-600 border border-gray-200 active:bg-gray-100'
                  }`}
                >
                  {tab.label} ({count})
                </button>
              );
            })}
          </div>
        </div>

        {/* Barre de recherche */}
        <div className="max-w-lg mx-auto px-4 pb-3">
          <div className="relative">
            {/* Icône loupe */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un client, une adresse..."
              className="w-full min-h-[48px] h-12 pl-11 pr-10 text-base bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#1E3A5F] focus:border-transparent outline-none"
            />
            {/* Bouton X pour effacer */}
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-full text-gray-400 active:bg-gray-100"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Liste scrollable */}
      <main
        ref={listRef}
        onScroll={handleListScroll}
        className="flex-1 overflow-y-auto"
      >
        <div className="max-w-lg mx-auto px-4 py-4 pb-28">
          {chantiers.length === 0 ? (
            <div className="text-center py-16">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-200 rounded-full mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <p className="text-gray-500 text-lg">Aucun chantier pour le moment</p>
              <p className="text-gray-400 text-sm mt-1">Commencez par créer votre première visite</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-gray-400 text-base">Aucun résultat</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((chantier) => (
                <ChantierCard key={chantier.id} chantier={chantier} onDelete={handleDeleteRequest} />
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Bouton flottant "Nouvelle visite" */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-gray-50 via-gray-50 to-transparent">
        <div className="max-w-lg mx-auto">
          <button
            onClick={() => router.push('/chantiers/nouveau')}
            className="w-full h-14 bg-[#F97316] text-white font-bold text-lg rounded-xl shadow-lg active:bg-orange-600 transition-colors flex items-center justify-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Nouvelle visite
          </button>
        </div>
      </div>

      {/* Modale de confirmation */}
      {deleteTarget && (
        <DeleteChantierModal
          clientName={`${deleteTarget.client_prenom} ${deleteTarget.client_nom}`.trim()}
          deleting={deleting}
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
