'use client';

interface DeleteChantierModalProps {
  clientName: string;
  clientAddress?: string;
  deleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function DeleteChantierModal({ clientName, clientAddress, deleting, onConfirm, onCancel }: DeleteChantierModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 backdrop-blur-sm">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} />

      {/* Modale */}
      <div className="relative bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl animate-scale-in">
        <h2 className="text-xl font-bold text-gray-900 mb-3">
          Supprimer ce chantier ?
        </h2>
        <div className="mb-4">
          <p className="text-sm text-gray-500 font-medium">{clientName}</p>
          {clientAddress && (
            <p className="text-sm text-gray-400 truncate">{clientAddress}</p>
          )}
        </div>
        <p className="text-xs text-gray-400 mb-6">
          Cette action est irréversible. Le rapport et toutes les données associées seront supprimés.
        </p>

        <div className="flex flex-col gap-2">
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="w-full h-12 rounded-xl bg-red-500 text-white font-bold active:bg-red-600 active:scale-[0.97] disabled:opacity-50 transition-all"
          >
            {deleting ? 'Suppression…' : 'Oui, supprimer'}
          </button>
          <button
            onClick={onCancel}
            disabled={deleting}
            className="w-full h-12 rounded-xl bg-[#F3F4F6] text-gray-500 font-medium active:bg-gray-200 transition-all"
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}
