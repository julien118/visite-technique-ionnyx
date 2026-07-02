'use client';

import { Chantier } from '@/lib/types';
import { formatDateShort } from '@/lib/utils';
import StatusBadge from './StatusBadge';
import { sectionDe, type StatutAffiche } from '@/lib/statut-affaire';
import { useRouter } from 'next/navigation';
import { useRef, useState, useCallback } from 'react';

interface ChantierCardProps {
  chantier: Chantier;
  // Statut affiché dérivé (source de vérité unique) : pilote À LA FOIS le badge ET
  // le routing (les statuts de la section Devis mènent à l'écran du devis).
  statutAffiche: StatutAffiche;
  // Demande de suppression : OUVRE la modale de confirmation (ne supprime jamais
  // directement). Déclenchée par l'icône corbeille OU par l'appui long.
  onDelete: (id: string) => void;
}

function getChantierHref(chantier: Chantier, statutAffiche: StatutAffiche) {
  // Section Devis (Phase 3) → écran du devis (le continuer, sans régénérer).
  if (sectionDe(statutAffiche) === 'devis') return `/chantiers/${chantier.id}/devis`;
  // Rapport généré ou visite terminée → on ouvre le compte rendu directement.
  if (chantier.statut === 'rapport_genere' || chantier.statut === 'termine') {
    return `/chantiers/${chantier.id}/rapport`;
  }
  // Planifié ou en cours → écran fiche/contact (d'où part « Commencer »/« Continuer »).
  return `/chantiers/${chantier.id}`;
}

export default function ChantierCard({ chantier, statutAffiche, onDelete }: ChantierCardProps) {
  const router = useRouter();
  const [pressing, setPressing] = useState(false);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const didLongPress = useRef(false);
  const href = getChantierHref(chantier, statutAffiche);

  const handlePressStart = useCallback(() => {
    didLongPress.current = false;
    setPressing(true);
    // Préchargement de la route cible dès le touch début : navigation perçue instantanée.
    router.prefetch(href);
    longPressTimer.current = setTimeout(() => {
      didLongPress.current = true;
      setPressing(false);
      if (navigator.vibrate) navigator.vibrate(50);
      onDelete(chantier.id);
    }, 600);
  }, [href, chantier.id, onDelete, router]);

  const handlePressEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    setPressing(false);
  }, []);

  function handleClick() {
    // Ne pas naviguer si c'était un appui long (suppression).
    if (didLongPress.current) {
      didLongPress.current = false;
      return;
    }
    router.push(href);
  }

  // Icône corbeille : OUVRE la modale (ne supprime jamais directement).
  // stopPropagation pour ne pas déclencher la navigation ni l'appui long de la carte.
  function handleTrashClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    setPressing(false);
    onDelete(chantier.id);
  }

  return (
    <div
      onMouseDown={handlePressStart}
      onMouseUp={handlePressEnd}
      onMouseLeave={handlePressEnd}
      onTouchStart={handlePressStart}
      onTouchEnd={handlePressEnd}
      onTouchCancel={handlePressEnd}
      onClick={handleClick}
      className={`relative bg-white rounded-xl cursor-pointer border border-border p-4 transition-all duration-150 select-none animate-card-appear ${
        pressing ? 'scale-[0.98] shadow-none' : 'hover:border-primary/30 hover:shadow-md'
      }`}
      style={{ WebkitTouchCallout: 'none' }}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="font-semibold text-foreground text-base truncate pr-3">
          {chantier.client_prenom} {chantier.client_nom}
        </h3>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <StatusBadge statut={statutAffiche} />
          <button
            type="button"
            onClick={handleTrashClick}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            aria-label="Supprimer cette fiche"
            className="flex h-9 w-9 -mr-1.5 items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        </div>
      </div>

      {chantier.client_adresse && (
        <p className="text-gray-400 text-sm truncate mb-1">{chantier.client_adresse}</p>
      )}

      {chantier.objet_travaux && (
        <p className="text-gray-500 text-sm truncate mb-2">{chantier.objet_travaux}</p>
      )}

      <p className="text-xs text-gray-400 mt-2">{formatDateShort(chantier.date_visite)}</p>
    </div>
  );
}
