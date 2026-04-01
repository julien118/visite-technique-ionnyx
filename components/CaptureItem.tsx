'use client';

import { CaptureItem as CaptureItemType } from '@/lib/types';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface CaptureItemProps {
  item: CaptureItemType;
  onDelete: (id: string) => void;
  onTranscriptionUpdate: (id: string, text: string) => void;
}

export default function CaptureItemComponent({ item, onDelete, onTranscriptionUpdate }: CaptureItemProps) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(item.transcription || '');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
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

  // Bloc vocal
  if (item.type === 'vocal') {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4 relative group">
        {/* Header : icône + heure + bouton supprimer */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-[#1E3A5F]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
            {time}
          </div>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="text-gray-300 hover:text-red-500 active:text-red-600 p-1 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>

        {/* Texte transcrit — clic pour éditer */}
        {item.transcription === null ? (
          <div className="flex items-center gap-2 text-gray-400">
            <div className="w-4 h-4 border-2 border-gray-300 border-t-[#1E3A5F] rounded-full animate-spin" />
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
                className="px-4 py-2 bg-[#1E3A5F] text-white text-sm rounded-lg active:bg-[#162d4a]"
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

  // Bloc photo
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 relative">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-[#1E3A5F]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
          </svg>
          {time}
        </div>
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="text-gray-300 hover:text-red-500 active:text-red-600 p-1 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>

      {/* Miniature photo — clic pour plein écran */}
      {item.photo_url && (
        <button onClick={() => setFullscreen(true)} className="w-full">
          <img
            src={item.photo_url}
            alt="Photo chantier"
            className="w-full h-48 object-cover rounded-lg"
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
