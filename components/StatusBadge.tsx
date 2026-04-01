import { ChantierStatut, STATUT_LABELS, STATUT_COLORS } from '@/lib/types';

interface StatusBadgeProps {
  statut: ChantierStatut;
}

export default function StatusBadge({ statut }: StatusBadgeProps) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUT_COLORS[statut]}`}>
      {STATUT_LABELS[statut]}
    </span>
  );
}
