'use client';

import Image from 'next/image';

interface PhotoVignetteProps {
  src: string;
  alt: string;
  className?: string;
  onClick?: () => void;
}

// Vignette de photo de chantier optimisée : next/image sert un WebP
// redimensionné (~30-80 Ko) au lieu de l'original 1920px (0,6-2 Mo mesurés en
// prod) — crucial en 4G de chantier. Le zoom plein écran, lui, garde l'URL
// originale pleine résolution (Hendrix doit pouvoir zoomer sur un détail).
// Les aperçus optimistes locaux (blob:) sont affichés tels quels, ils ne
// passent pas par l'optimiseur.
export default function PhotoVignette({ src, alt, className, onClick }: PhotoVignetteProps) {
  return (
    <Image
      src={src}
      alt={alt}
      width={640}
      height={480}
      sizes="(max-width: 640px) 90vw, 512px"
      className={className}
      // width/height ne servent qu'à la réservation initiale : le rendu suit
      // le ratio réel de l'image (identique aux <img> h-auto d'avant).
      style={{ width: 'auto', height: 'auto' }}
      onClick={onClick}
      unoptimized={src.startsWith('blob:')}
    />
  );
}
