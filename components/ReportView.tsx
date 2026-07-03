'use client';

import { RapportContenu, RapportObservation } from '@/lib/types';
import { useState, useRef } from 'react';
import PhotoVignette from '@/components/PhotoVignette';

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

interface ReportViewProps {
  contenu: RapportContenu;
  onUpdate: (contenu: RapportContenu) => void;
}

export default function ReportView({ contenu, onUpdate }: ReportViewProps) {
  const [editingObsIndex, setEditingObsIndex] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const [fullscreenPhoto, setFullscreenPhoto] = useState<string | null>(null);

  const client = contenu.client ?? ({} as RapportContenu['client']);
  const observations = Array.isArray(contenu.observations) ? contenu.observations : [];
  const visitDate = client.date_visite ? new Date(client.date_visite) : null;
  const valide = visitDate && !isNaN(visitDate.getTime());
  const dateFormatted = valide
    ? visitDate!.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
    : '';
  const heure = valide
    ? visitDate!.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }).replace(':', 'h')
    : '';
  const visiteAffichee = dateFormatted ? `${dateFormatted}${heure ? ` à ${heure}` : ''}` : '';
  const nomComplet = `${client.prenom ?? ''} ${client.nom ?? ''}`.trim();

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
    <div className="space-y-6">
      {/* Coordonnées */}
      <section className="bg-white rounded-xl border border-border p-4">
        <h3 className="text-xs font-semibold text-primary uppercase tracking-wider mb-3">Coordonnées</h3>
        <div className="space-y-1.5 text-sm">
          {nomComplet && <Champ label="Nom" value={nomComplet} />}
          {client.adresse && <Champ label="Adresse" value={client.adresse} />}
          {client.telephone && <Champ label="Tél" value={client.telephone} />}
          {client.email && <Champ label="Email" value={client.email} />}
          {visiteAffichee && <Champ label="Visite" value={visiteAffichee} />}
          {client.provenance && <Champ label="Provenance" value={client.provenance} />}
          <Champ label="Type" value={client.type_chantier === 'sous_traitance' ? 'Sous-traitance' : 'Direct client'} />
        </div>
      </section>

      {/* Observations */}
      {observations.map((obs, index) => (
        <ObservationBlock
          key={index}
          obs={obs}
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
        <section className="bg-white rounded-xl border border-border p-4">
          <h3 className="text-xs font-semibold text-primary uppercase tracking-wider mb-2">Accès chantier</h3>
          <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{renderBoldText(contenu.acces_chantier)}</p>
        </section>
      )}

      {/* Durée estimée */}
      {contenu.duree_estimee && (
        <section className="bg-white rounded-xl border border-border p-4">
          <h3 className="text-xs font-semibold text-primary uppercase tracking-wider mb-2">Durée estimée</h3>
          <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{renderBoldText(contenu.duree_estimee)}</p>
        </section>
      )}

      {/* Notes */}
      {contenu.notes && (
        <section className="bg-white rounded-xl border border-border p-4">
          <h3 className="text-xs font-semibold text-primary uppercase tracking-wider mb-2">Notes</h3>
          <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{renderBoldText(contenu.notes)}</p>
        </section>
      )}

      {/* Lightbox */}
      {fullscreenPhoto && (
        <PhotoLightbox url={fullscreenPhoto} onClose={() => setFullscreenPhoto(null)} />
      )}
    </div>
  );
}

function Champ({ label, value }: { label: string; value: string }) {
  return (
    <p>
      <span className="text-gray-400">{label} : </span>
      <span className="text-foreground font-medium">{value}</span>
    </p>
  );
}

function ObservationBlock({
  obs,
  isEditing,
  editText,
  onEditTextChange,
  onStartEdit,
  onSave,
  onCancel,
  onPhotoClick,
}: {
  obs: RapportObservation;
  isEditing: boolean;
  editText: string;
  onEditTextChange: (t: string) => void;
  onStartEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onPhotoClick: (url: string) => void;
}) {
  return (
    <section className="bg-white rounded-xl border border-border overflow-hidden">
      <div className="p-4">
        <h3 className="font-semibold text-foreground mb-2">{obs.titre}</h3>

        {isEditing ? (
          <div>
            <textarea
              value={editText}
              onChange={(e) => onEditTextChange(e.target.value)}
              rows={5}
              className="input-ionnyx w-full text-sm resize-none"
              autoFocus
            />
            <div className="flex gap-2 mt-2">
              <button onClick={onSave} className="px-4 py-2 btn-primary text-sm rounded-lg">Enregistrer</button>
              <button onClick={onCancel} className="px-4 py-2 btn-tertiary text-sm rounded-lg">Annuler</button>
            </div>
          </div>
        ) : (
          <p
            onClick={onStartEdit}
            className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap cursor-pointer hover:bg-input-focus rounded-lg -mx-2 px-2 py-1 transition-colors"
          >
            {renderBoldText(obs.description)}
          </p>
        )}
      </div>

      {/* Photos */}
      {(obs.photos?.length ?? 0) > 0 && (
        <div className="px-4 pb-3 space-y-3">
          {(obs.photos ?? []).map((photo, pIdx) => (
            <div key={pIdx} className="flex flex-col items-center">
              <PhotoVignette
                src={photo.url}
                alt={photo.legende}
                onClick={() => onPhotoClick(photo.url)}
                className="w-auto max-w-full max-h-96 rounded-lg cursor-pointer hover:opacity-95 transition-opacity"
              />
              {photo.legende && (
                <p className="text-xs text-gray-400 italic mt-1.5 text-center leading-relaxed">
                  {renderBoldText(photo.legende)}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Points de vigilance */}
      {(obs.points_vigilance?.length ?? 0) > 0 && (
        <div className="mx-4 mb-4 bg-input-focus border border-primary/10 rounded-xl p-3">
          <p className="text-xs font-semibold text-primary mb-2">Points de vigilance</p>
          <ul className="space-y-1">
            {(obs.points_vigilance ?? []).map((pv, pvIdx) => (
              <li key={pvIdx} className="text-sm text-gray-600 flex gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span>{renderBoldText(pv)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
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
