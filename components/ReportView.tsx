'use client';

import { RapportContenu, RapportObservation } from '@/lib/types';
import { useState, useRef } from 'react';

interface ReportViewProps {
  contenu: RapportContenu;
  onUpdate: (contenu: RapportContenu) => void;
}

function renderBoldText(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="font-bold text-gray-900">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}

export default function ReportView({ contenu, onUpdate }: ReportViewProps) {
  const [editingObsIndex, setEditingObsIndex] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const [fullscreenPhoto, setFullscreenPhoto] = useState<string | null>(null);

  const client = contenu.client ?? ({} as RapportContenu['client']);
  const observations = Array.isArray(contenu.observations) ? contenu.observations : [];
  const visitDate = client.date_visite ? new Date(client.date_visite) : null;
  const dateFormatted = visitDate && !isNaN(visitDate.getTime())
    ? visitDate.toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : '';

  function startEditObs(index: number) {
    setEditingObsIndex(index);
    setEditText(observations[index]?.description ?? '');
  }

  function saveEditObs() {
    if (editingObsIndex === null) return;
    const updated = { ...contenu };
    updated.observations = [...observations];
    updated.observations[editingObsIndex] = {
      ...updated.observations[editingObsIndex],
      description: editText,
    };
    onUpdate(updated);
    setEditingObsIndex(null);
  }

  return (
    <div className="space-y-0" style={{ boxShadow: '0 8px 60px rgba(0,0,0,0.08)' }}>
      {/* En-tête rapport */}
      <div className="bg-[#1A1A1A] text-white p-5 rounded-t-2xl">
        <h2 className="text-xl font-bold tracking-wide">RAPPORT DE VISITE</h2>
        <p className="text-gray-400 text-sm mt-1">
          {client.prenom} {client.nom} — {dateFormatted}
        </p>
      </div>

      {/* Infos client */}
      <div className="bg-white border border-t-0 border-[#F3F4F6] p-5">
        <h3 className="text-xs font-bold text-gray-400 mb-3 tracking-wide">INFORMATIONS CLIENT</h3>
        <div className="space-y-2 text-sm">
          <Row label="Nom" value={`${client.prenom} ${client.nom}`} />
          {client.adresse && <Row label="Adresse" value={client.adresse} />}
          {client.telephone && <Row label="Téléphone" value={client.telephone} />}
          {client.email && <Row label="Email" value={client.email} />}
          <Row label="Date" value={dateFormatted} />
          {client.provenance && <Row label="Provenance" value={client.provenance} />}
          <Row label="Type" value={client.type_chantier === 'sous_traitance' ? 'Sous-traitance' : 'Direct client'} />
        </div>
      </div>

      {/* Observations */}
      {observations.map((obs, index) => (
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
        <div className="bg-white border border-t-0 border-[#F3F4F6] p-5">
          <h3 className="text-xs font-bold text-gray-400 mb-2 tracking-wide">ACCÈS CHANTIER</h3>
          <p className="text-sm text-gray-700">{renderBoldText(contenu.acces_chantier)}</p>
        </div>
      )}

      {/* Durée estimée */}
      {contenu.duree_estimee && (
        <div className="bg-white border border-t-0 border-[#F3F4F6] p-5">
          <h3 className="text-xs font-bold text-gray-400 mb-2 tracking-wide">DURÉE ESTIMÉE</h3>
          <p className="text-sm text-gray-700">{renderBoldText(contenu.duree_estimee)}</p>
        </div>
      )}

      {/* Notes */}
      {contenu.notes && (
        <div className="bg-white border border-t-0 border-[#F3F4F6] p-5 rounded-b-2xl">
          <h3 className="text-xs font-bold text-gray-400 mb-2 tracking-wide">NOTES</h3>
          <p className="text-sm text-gray-700">{renderBoldText(contenu.notes)}</p>
        </div>
      )}

      {/* Footer */}
      <div className="text-center py-4">
        <p className="text-xs text-gray-400">Rapport généré par IONNYX — Assistant de Visite IA</p>
      </div>

      {/* Lightbox */}
      {fullscreenPhoto && (
        <PhotoLightbox url={fullscreenPhoto} onClose={() => setFullscreenPhoto(null)} />
      )}
    </div>
  );
}

function PhotoLightbox({ url, onClose }: { url: string; onClose: () => void }) {
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const lastDistRef = useRef(0);
  const lastPanRef = useRef({ x: 0, y: 0 });
  const imgRef = useRef<HTMLDivElement>(null);

  function handleTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastDistRef.current = Math.sqrt(dx * dx + dy * dy);
    } else if (e.touches.length === 1 && scale > 1) {
      lastPanRef.current = { x: e.touches[0].clientX - translate.x, y: e.touches[0].clientY - translate.y };
    }
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (lastDistRef.current > 0) {
        const newScale = Math.min(Math.max(scale * (dist / lastDistRef.current), 1), 5);
        setScale(newScale);
        if (newScale === 1) setTranslate({ x: 0, y: 0 });
      }
      lastDistRef.current = dist;
    } else if (e.touches.length === 1 && scale > 1) {
      setTranslate({
        x: e.touches[0].clientX - lastPanRef.current.x,
        y: e.touches[0].clientY - lastPanRef.current.y,
      });
    }
  }

  function handleTouchEnd() {
    lastDistRef.current = 0;
  }

  function handleDoubleClick() {
    if (scale > 1) {
      setScale(1);
      setTranslate({ x: 0, y: 0 });
    } else {
      setScale(2.5);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black z-50 flex items-center justify-center"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-white bg-black/50 rounded-full p-3 z-10"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
      {scale > 1 && (
        <button
          onClick={() => { setScale(1); setTranslate({ x: 0, y: 0 }); }}
          className="absolute top-4 left-4 text-white bg-black/50 rounded-full px-3 py-2 text-xs z-10"
        >
          Réinitialiser
        </button>
      )}
      <div
        ref={imgRef}
        onDoubleClick={handleDoubleClick}
        style={{
          transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
          transition: scale === 1 ? 'transform 0.2s ease' : 'none',
        }}
        className="w-full h-full flex items-center justify-center"
      >
        <img
          src={url}
          alt="Photo"
          className="max-w-full max-h-full object-contain"
          draggable={false}
        />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex border-b border-[#F3F4F6] pb-2 last:border-b-0 last:pb-0">
      <span className="text-xs text-gray-400 w-24 shrink-0 pt-0.5">{label}</span>
      <span className="text-sm text-gray-900 font-medium">{value}</span>
    </div>
  );
}

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
    <div className="bg-white border border-t-0 border-[#F3F4F6] p-5">
      {/* Titre observation — vert IONNYX */}
      <h3 className="text-base font-bold text-emerald-600 mb-1">
        OBSERVATION {index + 1} — {obs.titre}
      </h3>
      <div className="h-0.5 w-12 bg-emerald-500 rounded-full mb-3" />

      {/* Description */}
      {isEditing ? (
        <div>
          <textarea
            value={editText}
            onChange={(e) => onEditTextChange(e.target.value)}
            rows={5}
            className="w-full px-3 py-2 rounded-xl input-ionnyx resize-none text-sm"
            autoFocus
          />
          <div className="flex gap-2 mt-2">
            <button onClick={onSave} className="px-4 py-2 btn-primary text-sm rounded-lg">
              Enregistrer
            </button>
            <button onClick={onCancel} className="px-4 py-2 btn-tertiary text-sm rounded-lg">
              Annuler
            </button>
          </div>
        </div>
      ) : (
        <p
          onClick={onStartEdit}
          className="text-sm text-gray-700 leading-relaxed cursor-pointer hover:bg-gray-50 rounded p-1 -m-1 transition-colors"
        >
          {renderBoldText(obs.description)}
        </p>
      )}

      {/* Photos */}
      {(obs.photos?.length ?? 0) > 0 && (
        <div className="space-y-3 mt-4">
          {(obs.photos ?? []).map((photo, pIdx) => (
            <button
              key={pIdx}
              onClick={() => onPhotoClick(photo.url)}
              className="w-full text-left"
            >
              <img
                src={photo.url}
                alt={photo.legende}
                className="max-w-full max-h-[420px] w-auto h-auto object-contain block mx-auto rounded-lg"
              />
              {photo.legende && (
                <p className="text-xs text-gray-400 mt-2 leading-relaxed text-center italic">
                  {renderBoldText(photo.legende)}
                </p>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Points de vigilance — vert IONNYX */}
      {(obs.points_vigilance?.length ?? 0) > 0 && (
        <div className="mt-4 p-3 bg-emerald-50 rounded-lg border-l-[3px] border-emerald-500">
          <p className="text-sm font-semibold text-emerald-700 mb-1">Points de vigilance</p>
          <ul className="space-y-0.5">
            {(obs.points_vigilance ?? []).map((pv, pvIdx) => (
              <li key={pvIdx} className="text-sm text-gray-700 flex items-start gap-2">
                <span className="text-emerald-500 mt-1.5 text-xs">●</span>
                <span>{renderBoldText(pv)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
