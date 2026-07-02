'use client';

import { useRef, useState } from 'react';

interface PhotoCaptureProps {
  onPhotoTaken: (file: File) => void;
  disabled?: boolean;
  compact?: boolean;
}

export default function PhotoCapture({ onPhotoTaken, disabled, compact }: PhotoCaptureProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [showSheet, setShowSheet] = useState(false);

  function handleClick() {
    setShowSheet(true);
  }

  function handleCamera() {
    setShowSheet(false);
    cameraInputRef.current?.click();
  }

  function handleGallery() {
    setShowSheet(false);
    galleryInputRef.current?.click();
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      onPhotoTaken(file);
      e.target.value = '';
    }
  }

  const inputs = (
    <>
      {/* Appareil photo direct */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleChange}
        className="hidden"
      />
      {/* Galerie / pellicule (pas de capture) */}
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        onChange={handleChange}
        className="hidden"
      />
    </>
  );

  const bottomSheet = showSheet && (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setShowSheet(false)}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative bg-white w-full max-w-lg rounded-t-2xl shadow-2xl animate-slide-up"
        style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 pt-4">
          <p className="text-sm text-gray-400 text-center mb-3">Ajouter une photo</p>

          <button
            onClick={handleCamera}
            className="w-full h-14 btn-secondary rounded-xl font-semibold text-base flex items-center justify-center gap-3 active:scale-[0.97] transition-all mb-3"
          >
            <span className="text-xl">📷</span>
            Prendre une photo
          </button>

          <button
            onClick={handleGallery}
            className="w-full h-14 btn-tertiary rounded-xl font-semibold text-base flex items-center justify-center gap-3 transition-all mb-2"
          >
            <span className="text-xl">🖼️</span>
            Choisir depuis la galerie
          </button>

          <button
            onClick={() => setShowSheet(false)}
            className="w-full h-12 text-gray-500 font-medium text-sm rounded-xl active:bg-gray-100 transition-colors"
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
  );

  if (compact) {
    return (
      <>
        {inputs}
        <button
          onClick={handleClick}
          disabled={disabled}
          className="flex-1 h-12 btn-secondary rounded-xl font-medium text-sm flex items-center justify-center gap-2 active:scale-[0.97] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
          </svg>
          Nouvelle photo
        </button>
        {bottomSheet}
      </>
    );
  }

  return (
    <>
      {inputs}
      <button
        onClick={handleClick}
        disabled={disabled}
        className="flex-1 btn-secondary rounded-xl font-semibold flex items-center justify-center gap-2 active:scale-[0.97] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        Photo
      </button>
      {bottomSheet}
    </>
  );
}
