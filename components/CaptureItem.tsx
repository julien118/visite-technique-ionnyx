'use client';

import { CaptureItem as CaptureItemType } from '@/lib/types';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface CaptureItemProps {
  item: CaptureItemType;
  linkedVocal?: CaptureItemType | null;
  onDelete: (id: string) => void;
  onDeleteGroup?: (photoId: string, vocalId: string) => void;
  onTranscriptionUpdate: (id: string, text: string) => void;
}

export default function CaptureItemComponent({ item, linkedVocal, onDelete, onDeleteGroup, onTranscriptionUpdate }: CaptureItemProps) {
  // Carte combinée photo + vocal lié
  if (item.type === 'photo' && linkedVocal) {
    return (
      <LinkedCard
        photo={item}
        vocal={linkedVocal}
        onDelete={onDelete}
        onDeleteGroup={onDeleteGroup}
        onTranscriptionUpdate={onTranscriptionUpdate}
      />
    );
  }

  // Carte solo vocal
  if (item.type === 'vocal') {
    return (
      <VocalCard
        item={item}
        onDelete={onDelete}
        onTranscriptionUpdate={onTranscriptionUpdate}
      />
    );
  }

  // Carte solo photo
  return (
    <PhotoCard
      item={item}
      onDelete={onDelete}
    />
  );
}

// ============================================================
// CARTE COMBINÉE — Photo + Description vocale liée
// ============================================================
function LinkedCard({
  photo,
  vocal,
  onDelete,
  onDeleteGroup,
  onTranscriptionUpdate,
}: {
  photo: CaptureItemType;
  vocal: CaptureItemType;
  onDelete: (id: string) => void;
  onDeleteGroup?: (photoId: string, vocalId: string) => void;
  onTranscriptionUpdate: (id: string, text: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(vocal.transcription || '');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const supabase = createClient();

  const time = new Date(photo.created_at).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  async function handleSaveEdit() {
    const { error } = await supabase
      .from('capture_items')
      .update({ transcription: editText })
      .eq('id', vocal.id);

    if (!error) {
      onTranscriptionUpdate(vocal.id, editText);
      setEditing(false);
    }
  }

  function handleCancelEdit() {
    setEditText(vocal.transcription || '');
    setEditing(false);
  }

  function handleDeleteAll() {
    setShowDeleteConfirm(false);
    if (onDeleteGroup) {
      onDeleteGroup(photo.id, vocal.id);
    } else {
      onDelete(photo.id);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-[#F3F4F6] relative overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
          </svg>
          <span>{time}</span>
          <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">Photo + description</span>
        </div>
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="text-gray-300 hover:text-red-500 active:text-red-600 p-2 -m-1 min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>

      {/* Photo */}
      {photo.photo_url && (
        <button onClick={() => setFullscreen(true)} className="w-full px-4 flex justify-center">
          <img
            src={photo.photo_url}
            alt="Photo chantier"
            className="max-w-full max-h-64 w-auto h-auto object-contain rounded-lg"
          />
        </button>
      )}

      {/* Séparateur */}
      <div className="mx-4 my-0">
        <div className="border-t border-gray-100" />
      </div>

      {/* Transcription vocale liée */}
      <div className="px-4 pb-4 pt-2">
        <div className="flex items-center gap-1.5 mb-1.5">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
          <span className="text-xs text-gray-400">Description</span>
        </div>

        {vocal.transcription === null ? (
          <div className="flex items-center gap-2 text-gray-400">
            <div className="w-4 h-4 border-2 border-gray-300 border-t-[#1A1A1A] rounded-full animate-spin" />
            Transcription en cours…
          </div>
        ) : editing ? (
          <div>
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1E3A5F] focus:border-transparent outline-none resize-none text-sm"
              autoFocus
            />
            <div className="flex gap-2 mt-2">
              <button
                onClick={handleSaveEdit}
                className="px-4 py-2 btn-primary text-sm rounded-lg"
              >
                Enregistrer
              </button>
              <button
                onClick={handleCancelEdit}
                className="px-4 py-2 bg-gray-100 text-gray-700 text-sm rounded-lg active:bg-gray-200"
              >
                Annuler
              </button>
            </div>
          </div>
        ) : (
          <p
            onClick={() => {
              setEditText(vocal.transcription || '');
              setEditing(true);
            }}
            className="text-gray-800 text-sm leading-relaxed cursor-pointer hover:bg-gray-50 rounded p-1 -m-1 transition-colors"
          >
            {vocal.transcription}
          </p>
        )}
      </div>

      {/* Vue plein écran */}
      {fullscreen && photo.photo_url && (
        <div
          className="fixed inset-0 bg-black z-50 flex items-center justify-center"
          onClick={() => setFullscreen(false)}
        >
          <button
            onClick={() => setFullscreen(false)}
            className="absolute top-4 right-4 text-white bg-black/50 rounded-full p-2 z-10"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <img
            src={photo.photo_url}
            alt="Photo chantier"
            className="max-w-full max-h-full object-contain"
          />
        </div>
      )}

      {/* Confirmation de suppression */}
      {showDeleteConfirm && (
        <div className="absolute inset-0 bg-white/95 rounded-xl flex items-center justify-center z-10">
          <div className="text-center px-4">
            <p className="text-sm text-gray-700 mb-3">Supprimer cette photo et sa description ?</p>
            <div className="flex gap-2 justify-center">
              <button
                onClick={handleDeleteAll}
                className="px-4 py-2 bg-red-500 text-white text-sm rounded-lg active:bg-red-600"
              >
                Supprimer tout
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 bg-gray-100 text-gray-700 text-sm rounded-lg active:bg-gray-200"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// CARTE VOCALE SOLO
// ============================================================
function VocalCard({
  item,
  onDelete,
  onTranscriptionUpdate,
}: {
  item: CaptureItemType;
  onDelete: (id: string) => void;
  onTranscriptionUpdate: (id: string, text: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(item.transcription || '');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const supabase = createClient();

  const time = new Date(item.created_at).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  async function handleSaveEdit() {
    const { error } = await supabase
      .from('capture_items')
      .update({ transcription: editText })
      .eq('id', item.id);

    if (!error) {
      onTranscriptionUpdate(item.id, editText);
      setEditing(false);
    }
  }

  function handleCancelEdit() {
    setEditText(item.transcription || '');
    setEditing(false);
  }

  function handleDelete() {
    setShowDeleteConfirm(false);
    onDelete(item.id);
  }

  return (
    <div className="bg-white rounded-xl border border-[#F3F4F6] p-4 relative group">
      {/* Header : icône + heure + bouton supprimer */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
          {time}
        </div>
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="text-gray-300 hover:text-red-500 active:text-red-600 p-2 -m-1 min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>

      {/* Texte transcrit — clic pour éditer */}
      {item.transcription === null ? (
        <div className="flex items-center gap-2 text-gray-400">
          <div className="w-4 h-4 border-2 border-gray-300 border-t-[#1A1A1A] rounded-full animate-spin" />
          Transcription en cours…
        </div>
      ) : editing ? (
        <div>
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1E3A5F] focus:border-transparent outline-none resize-none text-sm"
            autoFocus
          />
          <div className="flex gap-2 mt-2">
            <button
              onClick={handleSaveEdit}
              className="px-4 py-2 btn-primary text-sm rounded-lg"
            >
              Enregistrer
            </button>
            <button
              onClick={handleCancelEdit}
              className="px-4 py-2 bg-gray-100 text-gray-700 text-sm rounded-lg active:bg-gray-200"
            >
              Annuler
            </button>
          </div>
        </div>
      ) : (
        <p
          onClick={() => {
            setEditText(item.transcription || '');
            setEditing(true);
          }}
          className="text-gray-800 text-sm leading-relaxed cursor-pointer hover:bg-gray-50 rounded p-1 -m-1 transition-colors"
        >
          {item.transcription}
        </p>
      )}

      {/* Confirmation de suppression */}
      {showDeleteConfirm && (
        <div className="absolute inset-0 bg-white/95 rounded-xl flex items-center justify-center z-10">
          <div className="text-center">
            <p className="text-sm text-gray-700 mb-3">Supprimer cet enregistrement ?</p>
            <div className="flex gap-2 justify-center">
              <button
                onClick={handleDelete}
                className="px-4 py-2 bg-red-500 text-white text-sm rounded-lg active:bg-red-600"
              >
                Supprimer
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 bg-gray-100 text-gray-700 text-sm rounded-lg active:bg-gray-200"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// CARTE PHOTO SOLO
// ============================================================
function PhotoCard({
  item,
  onDelete,
}: {
  item: CaptureItemType;
  onDelete: (id: string) => void;
}) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const time = new Date(item.created_at).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  function handleDelete() {
    setShowDeleteConfirm(false);
    onDelete(item.id);
  }

  return (
    <div className="bg-white rounded-xl border border-[#F3F4F6] p-4 relative">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
          </svg>
          {time}
        </div>
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="text-gray-300 hover:text-red-500 active:text-red-600 p-2 -m-1 min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>

      {/* Miniature photo — clic pour plein écran */}
      {item.photo_url && (
        <button onClick={() => setFullscreen(true)} className="w-full flex justify-center">
          <img
            src={item.photo_url}
            alt="Photo chantier"
            className="max-w-full max-h-64 w-auto h-auto object-contain rounded-lg"
          />
        </button>
      )}

      {/* Vue plein écran */}
      {fullscreen && item.photo_url && (
        <div
          className="fixed inset-0 bg-black z-50 flex items-center justify-center"
          onClick={() => setFullscreen(false)}
        >
          <button
            onClick={() => setFullscreen(false)}
            className="absolute top-4 right-4 text-white bg-black/50 rounded-full p-2 z-10"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <img
            src={item.photo_url}
            alt="Photo chantier"
            className="max-w-full max-h-full object-contain"
          />
        </div>
      )}

      {/* Confirmation de suppression */}
      {showDeleteConfirm && (
        <div className="absolute inset-0 bg-white/95 rounded-xl flex items-center justify-center z-10">
          <div className="text-center">
            <p className="text-sm text-gray-700 mb-3">Supprimer cette photo ?</p>
            <div className="flex gap-2 justify-center">
              <button
                onClick={handleDelete}
                className="px-4 py-2 bg-red-500 text-white text-sm rounded-lg active:bg-red-600"
              >
                Supprimer
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 bg-gray-100 text-gray-700 text-sm rounded-lg active:bg-gray-200"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
