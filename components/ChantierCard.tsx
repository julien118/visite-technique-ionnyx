'use client';

import { Chantier } from '@/lib/types';
import { formatDateShort } from '@/lib/utils';
import StatusBadge from './StatusBadge';
import { useRouter } from 'next/navigation';

interface ChantierCardProps {
  chantier: Chantier;
}

export default function ChantierCard({ chantier }: ChantierCardProps) {
  const router = useRouter();

  return (
    <button
      onClick={() => router.push(`/chantiers/${chantier.id}`)}
      className="w-full bg-white rounded-xl border border-gray-200 p-4 text-left active:bg-gray-50 transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {/* Nom du client */}
          <p className="font-semibold text-gray-900 truncate">
            {chantier.client_prenom} {chantier.client_nom}
          </p>

          {/* Adresse */}
          {chantier.client_adresse && (
            <p className="text-sm text-gray-500 truncate mt-0.5">
              {chantier.client_adresse}
            </p>
          )}

          {/* Objet des travaux — toujours visible */}
          <p className="text-sm text-gray-600 font-medium mt-1 line-clamp-2">
            {chantier.objet_travaux || <span className="text-gray-300 font-normal italic">Objet non renseigné</span>}
          </p>

          {/* Date */}
          <p className="text-sm text-gray-400 mt-1">
            {formatDateShort(chantier.date_visite)}
          </p>
        </div>

        {/* Statut */}
        <StatusBadge statut={chantier.statut} />
      </div>

    </button>
  );
}
