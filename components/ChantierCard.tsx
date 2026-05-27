'use client';

import { Chantier } from '@/lib/types';
import { formatDateShort } from '@/lib/utils';
import StatusBadge from './StatusBadge';
import { useRouter } from 'next/navigation';
import { useRef, useState, useCallback } from 'react';

interface ChantierCardProps {
  chantier: Chantier;
  onDelete: (id: string) => void;
}

export default function ChantierCard({ chantier, onDelete }: ChantierCardProps) {
  const router = useRouter();
  const [pressing, setPressing] = useState(false);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const didLongPress = useRef(false);

  const handlePressStart = useCallback(() => {
    didLongPress.current = false;
    setPressing(true);
    // Préchargement de la route cible dès le touch début : la page est prête
    // avant même que Hendrix relâche son doigt (navigation perçue instantanée).
    router.prefetch(`/chantiers/${chantier.id}`);
    longPressTimer.current = setTimeout(() => {
      didLongPress.current = true;
      setPressing(false);
      // Vibration haptique
      if (navigator.vibrate) navigator.vibrate(50);
      onDelete(chantier.id);
    }, 600);
  }, [chantier.id, onDelete, router]);

  const handlePressEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    setPressing(false);
  }, []);

  function handleClick() {
    // Ne pas naviguer si c'était un long press
    if (didLongPress.current) {
      didLongPress.current = false;
      return;
    }
    router.push(`/chantiers/${chantier.id}`);
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
      className={`relative bg-white rounded-2xl cursor-pointer shadow-sm border border-[#F3F4F6] p-5 hover:shadow-md transition-all duration-150 select-none ${
        pressing ? 'scale-[0.97] shadow-none' : 'hover:-translate-y-0.5'
      }`}
      style={{ WebkitTouchCallout: 'none' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold text-gray-900 truncate">
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
          <p className="text-xs text-gray-400 mt-2">
            {formatDateShort(chantier.date_visite)}
          </p>
        </div>

        <div className="flex items-start gap-1.5 flex-shrink-0">
          <StatusBadge statut={chantier.statut} />
        </div>
      </div>
    </div>
  );
}
