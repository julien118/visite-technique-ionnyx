'use client';

import { RapportContenu, RapportObservation } from '@/lib/types';
import { useState } from 'react';

interface ReportViewProps {
  contenu: RapportContenu;
  onUpdate: (contenu: RapportContenu) => void;
}

export default function ReportView({ contenu, onUpdate }: ReportViewProps) {
  const [editingObsIndex, setEditingObsIndex] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const [fullscreenPhoto, setFullscreenPhoto] = useState<string | null>(null);

  const client = contenu.client;
  const dateFormatted = new Date(client.date_visite).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  function startEditObs(index: number) {
    setEditingObsIndex(index);
    setEditText(contenu.observations[index].description);
  }

  function saveEditObs() {
    if (editingObsIndex === null) return;
    const updated = { ...contenu };
    updated.observations = [...contenu.observations];
    updated.observations[editingObsIndex] = {
      ...updated.observations[editingObsIndex],
      description: editText,
    };
    onUpdate(updated);
    setEditingObsIndex(null);
  }

  return (
    <div className="space-y-0">
      {/* En-tête rapport */}
      <div className="bg-[#1E3A5F] text-white p-5 rounded-t-xl">
        <h2 className="text-lg font-bold">RAPPORT DE VISITE</h2>
        <p className="text-blue-200 text-sm mt-1">
          {client.prenom} {client.nom} — {dateFormatted}
        </p>
      </div>

      {/* Infos client */}
      <div className="bg-white border border-t-0 border-gray-200 p-5">
        <h3 className="text-sm font-bold text-[#1E3A5F] mb-3">INFORMATIONS CLIENT</h3>
        <div className="space-y-1.5 text-sm">
          <Row label="Nom" value={`${client.prenom} ${client.nom}`} />
          <Row label="Adresse" value={client.adresse} />
          {client.telephone && <Row label="Téléphone" value={client.telephone} />}
          {client.email && <Row label="Email" value={client.email} />}
          <Row label="Date de visite" value={dateFormatted} />
          {client.provenance && <Row label="Provenance" value={client.provenance} />}
          <Row label="Type" value={client.type_chantier === 'sous_traitance' ? 'Sous-traitance' : 'Direct client'} />
        </div>
      </div>

      {/* Observations */}
      {contenu.observations.map((obs, index) => (
        <ObservationBlock
          key={index}
          obs={obs}
          index={index}
          isEditing={editingObsIndex === index}
          editText={editText}
          onEditTextChange={setEditText}
          onStartEdit={() => startEditObs(index)}
          onSave={saveEditObs}
          onCancel={() => setEditingObsIndex(null)}
          onPhotoClick={setFullscreenPhoto}
        />
      ))}

      {/* Accès chantier */}
      {contenu.acces_chantier && (
        <div className="bg-white border border-t-0 border-gray-200 p-5">
          <h3 className="text-sm font-bold text-[#1E3A5F] mb-2">ACCÈS CHANTIER</h3>
          <p className="text-sm text-gray-700">{contenu.acces_chantier}</p>
        </div>
      )}

      {/* Durée estimée */}
      {contenu.duree_estimee && (
        <div className="bg-white border border-t-0 border-gray-200 p-5">
          <h3 className="text-sm font-bold text-[#1E3A5F] mb-2">DURÉE ESTIMÉE</h3>
          <p className="text-sm text-gray-700">{contenu.duree_estimee}</p>
        </div>
      )}

      {/* Notes */}
      {contenu.notes && (
        <div className="bg-white border border-t-0 border-gray-200 p-5 rounded-b-xl">
          <h3 className="text-sm font-bold text-[#1E3A5F] mb-2">NOTES</h3>
          <p className="text-sm text-gray-700">{contenu.notes}</p>
        </div>
      )}

      {/* Vue plein écran photo */}
      {fullscreenPhoto && (
        <div
          className="fixed inset-0 bg-black z-50 flex items-center justify-center"
          onClick={() => setFullscreenPhoto(null)}
        >
          <button
            onClick={() => setFullscreenPhoto(null)}
            className="absolute top-4 right-4 text-white bg-black/50 rounded-full p-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <img src={fullscreenPhoto} alt="Photo" className="max-w-full max-h-full object-contain" />
        </div>
      )}
    </div>
  );
}

// Ligne info client
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex">
      <span className="text-gray-400 w-28 shrink-0">{label}</span>
      <span className="text-gray-800">{value}</span>
    </div>
  );
}

// Bloc observation
function ObservationBlock({
  obs,
  index,
  isEditing,
  editText,
  onEditTextChange,
  onStartEdit,
  onSave,
  onCancel,
  onPhotoClick,
}: {
  obs: RapportObservation;
  index: number;
  isEditing: boolean;
  editText: string;
  onEditTextChange: (t: string) => void;
  onStartEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onPhotoClick: (url: string) => void;
}) {
  return (
    <div className="bg-white border border-t-0 border-gray-200 p-5">
      <h3 className="text-sm font-bold text-[#1E3A5F] mb-2">
        OBSERVATION {index + 1} — {obs.titre}
      </h3>

      {/* Description — clic pour éditer */}
      {isEditing ? (
        <div>
          <textarea
            value={editText}
            onChange={(e) => onEditTextChange(e.target.value)}
            rows={5}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1E3A5F] focus:border-transparent outline-none resize-none text-sm"
            autoFocus
          />
          <div className="flex gap-2 mt-2">
            <button onClick={onSave} className="px-4 py-2 bg-[#1E3A5F] text-white text-sm rounded-lg">
              Enregistrer
            </button>
            <button onClick={onCancel} className="px-4 py-2 bg-gray-100 text-gray-700 text-sm rounded-lg">
              Annuler
            </button>
          </div>
        </div>
      ) : (
        <p
          onClick={onStartEdit}
          className="text-sm text-gray-700 leading-relaxed cursor-pointer hover:bg-gray-50 rounded p-1 -m-1 transition-colors"
        >
          {obs.description}
        </p>
      )}

      {/* Photos */}
      {obs.photos.length > 0 && (
        <div className="flex gap-2 mt-3 overflow-x-auto">
          {obs.photos.map((photo, pIdx) => (
            <button
              key={pIdx}
              onClick={() => onPhotoClick(photo.url)}
              className="shrink-0"
            >
              <img
                src={photo.url}
                alt={photo.legende}
                className="w-32 h-24 object-cover rounded-lg"
              />
              {photo.legende && (
                <p className="text-xs text-gray-400 mt-1 w-32 truncate">{photo.legende}</p>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Points de vigilance */}
      {obs.points_vigilance.length > 0 && (
        <div className="mt-3 p-3 bg-amber-50 rounded-lg">
          <p className="text-xs font-bold text-amber-800 mb-1">Points de vigilance</p>
          <ul className="list-disc list-inside text-xs text-amber-700 space-y-0.5">
            {obs.points_vigilance.map((pv, pvIdx) => (
              <li key={pvIdx}>{pv}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
