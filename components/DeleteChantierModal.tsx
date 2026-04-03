'use client';

interface DeleteChantierModalProps {
  clientName: string;
  deleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function DeleteChantierModal({ clientName, deleting, onConfirm, onCancel }: DeleteChantierModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 backdrop-blur-sm">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} />

      {/* Modale */}
      <div className="relative bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl animate-scale-in">
        <h2 className="text-xl font-bold text-gray-900">
          Supprimer le chantier {clientName} ?
        </h2>
        <p className="text-sm text-gray-600 mt-2">
          Cette action est irréversible. Le rapport et toutes les données associées seront supprimés.
        </p>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onCancel}
            disabled={deleting}
            className="flex-1 h-12 rounded-xl btn-tertiary font-medium transition-all"
          >
            Annuler
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="flex-1 h-12 rounded-xl bg-red-500 text-white font-bold active:bg-red-600 active:scale-[0.97] disabled:opacity-50 transition-all"
          >
            {deleting ? 'Suppression…' : 'Supprimer'}
          </button>
        </div>
      </div>
    </div>
  );
}
