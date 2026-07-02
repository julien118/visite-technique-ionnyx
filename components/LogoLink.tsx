import Link from 'next/link'
import Image from 'next/image'

/**
 * Logo MTC (Maison Travaux Conception), version blanche, cliquable → dashboard.
 * Signature identique à ATG (props width/height/priority) → drop-in dans les headers.
 * Asset : public/logo-mtc37.png (980×381, fond transparent, blanc — pensé pour la bannière noire).
 * Taille d'affichage figée à h-10 (≈40px de haut) — ne pas changer.
 */
export default function LogoLink({ priority = false }: { width?: number; height?: number; priority?: boolean }) {
  return (
    <Link href="/chantiers" className="inline-flex items-center select-none">
      <Image
        src="/logo-mtc37.png"
        alt="MTC — Maison Travaux Conception"
        width={129}
        height={50}
        priority={priority}
        className="h-10 w-auto"
      />
    </Link>
  )
}
