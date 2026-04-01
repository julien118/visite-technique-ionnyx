'use client';

import { useState } from 'react';
import { Chantier } from '@/lib/types';
import ChantierCard from '@/components/ChantierCard';
import { useRouter } from 'next/navigation';
import UserMenu from '@/components/UserMenu';
import DeleteChantierModal from '@/components/DeleteChantierModal';

interface ChantiersListProps {
  chantiers: Chantier[];
  userEmail: string;
  companyName: string;
}

export default function ChantiersList({ chantiers: initialChantiers, userEmail, companyName }: ChantiersListProps) {
  const router = useRouter();
  const [chantiers, setChantiers] = useState(initialChantiers);
  const [deleteTarget, setDeleteTarget] = useState<Chantier | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-[#1E3A5F] text-white px-4 py-4 sticky top-0 z-10">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight">{companyName || userEmail.split('@')[0]}</h1>
            <p className="text-sm text-blue-200">Assistant de Visite</p>
          </div>
          <UserMenu />
        </div>
      </header>

      {/* Contenu */}
      <main className="max-w-lg mx-auto px-4 py-4 pb-28">
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
        ) : (
          <div className="space-y-3">
            {chantiers.map((chantier) => (
              <ChantierCard key={chantier.id} chantier={chantier} onDelete={handleDeleteRequest} />
            ))}
          </div>
        )}
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
