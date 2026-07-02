'use client'

import { usePathname } from 'next/navigation'
import AssistantDevis from './AssistantDevis'

// L'assistant flottant interroge des API protégées : inutile (et trompeur) sur la
// page de connexion. On ne le monte donc pas sur /login.
// `nom` / `entreprise` viennent du serveur (layout) pour personnaliser l'accueil
// (« Bonjour Hendrix ! »).
export default function AssistantGate({
  nom,
  entreprise,
}: {
  nom: string
  entreprise: string
}) {
  const pathname = usePathname()
  if (pathname === '/login') return null
  return <AssistantDevis nom={nom} entreprise={entreprise} />
}
