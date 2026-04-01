'use client';

import { Chantier, STATUT_BORDER_COLORS } from '@/lib/types';
import { formatDateShort } from '@/lib/utils';
import StatusBadge from './StatusBadge';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

interface ChantierCardProps {
  chantier: Chantier;
  onDelete: (id: string) => void;
}

export default function ChantierCard({ chantier, onDelete }: ChantierCardProps) {
  const router = useRouter();
  const [offsetX, setOffsetX] = useState(0);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const isSwiping = useRef(false);

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    isSwiping.current = false;
  }

  function handleTouchMove(e: React.TouchEvent) {
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = e.touches[0].clientY - touchStartY.current;

    if (!isSwiping.current && Math.abs(dy) > Math.abs(dx)) return;

    if (dx < -10) {
      isSwiping.current = true;
      setOffsetX(Math.max(dx, -80));
    }
  }

  function handleTouchEnd() {
    if (offsetX < -40) {
      setOffsetX(-80);
    } else {
      setOffsetX(0);
    }
  }

  function handleClick() {
    if (isSwiping.current) return;
    router.push(`/chantiers/${chantier.id}`);
  }

  const borderColor = STATUT_BORDER_COLORS[chantier.statut];

  return (
    <div className="relative overflow-hidden rounded-xl">
      {/* Zone rouge derrière (révélée par le swipe) */}
      <div className="absolute inset-y-0 right-0 w-20 bg-red-500 flex items-center justify-center rounded-r-xl">
        <button
          onClick={() => onDelete(chantier.id)}
          className="w-full h-full flex items-center justify-center"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>

      {/* Carte principale */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleClick}
        style={{ transform: `translateX(${offsetX}px)`, transition: isSwiping.current ? 'none' : 'transform 0.2s ease-out' }}
        className="relative bg-white border border-gray-100 rounded-xl cursor-pointer active:bg-gray-50/50 transition-colors shadow-sm overflow-hidden flex"
      >
        {/* Bande de couleur à gauche */}
        <div className={`w-1 flex-shrink-0 ${borderColor}`} />

        {/* Contenu */}
        <div className="flex-1 p-4 pl-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-gray-900 truncate">
                {chantier.client_prenom} {chantier.client_nom}
              </p>
              {chantier.client_adresse && (
                <p className="text-sm text-gray-500 truncate mt-0.5">
                  {chantier.client_adresse}
                </p>
              )}
              {chantier.objet_travaux && (
                <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                  {chantier.objet_travaux}
                </p>
              )}
              <p className="text-xs text-gray-400 mt-1.5">
                {formatDateShort(chantier.date_visite)}
              </p>
            </div>

            <div className="flex items-start gap-1.5 flex-shrink-0">
              <StatusBadge statut={chantier.statut} />
              {/* Bouton poubelle desktop */}
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(chantier.id); }}
                className="hidden md:flex items-center justify-center w-8 h-8 rounded-lg text-gray-200 hover:text-red-500 hover:bg-red-50 transition-colors"
                title="Supprimer"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
