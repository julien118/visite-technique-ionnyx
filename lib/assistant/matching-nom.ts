// =============================================================
// Helpers PARTAGÉS de matching de NOM (assistant)
// =============================================================
// Normalisation + jetons significatifs + matching souple (tolérance aux fautes).
// Logique 100 % pure (aucune dépendance), portée verbatim depuis ATG.

// Normalisation générale d'un texte/nom : retire le HTML, minuscules, accents,
// espaces compressés.
export function normaliser(s: string | null | undefined): string {
  return (s ?? '')
    .replace(/<[^>]+>/g, ' ')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Civilités et particules à ignorer dans le matching de nom : sans elles,
// "M. Dupont" doit retrouver "M. et Mme Dupont".
export const MOTS_VIDES_NOM = new Set([
  'm', 'mr', 'mme', 'mlle', 'monsieur', 'madame', 'mademoiselle',
  'et', 'de', 'du', 'des', 'la', 'le', 'les', 'l', 'aux', 'a',
])

// Jetons significatifs d'un nom : >= 2 lettres, hors civilités/particules.
export function jetonsSignificatifs(nom: string): string[] {
  return normaliser(nom)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2 && !MOTS_VIDES_NOM.has(t))
}

// Noms d'attribut client typiquement précédés d'un possessif dans une question
// de suivi (« son adresse », « ses devis »...).
const NOMS_ATTRIBUT_CLIENT = [
  'adresse', 'adresses',
  'devis',
  'telephone', 'telephones', 'tel', 'numero', 'numeros', 'portable',
  'mail', 'mails', 'email', 'emails', 'courriel', 'courriels',
  'contact', 'contacts', 'coordonnees',
  'compte', 'comptes', 'rapport', 'rapports', 'bilan', 'bilans', 'cr',
  'chantier', 'chantiers', 'dossier', 'dossiers',
  'facture', 'factures', 'projet', 'projets',
  'ville', 'nom', 'prenom', 'societe', 'entreprise', 'visite', 'visites',
]

// Faute courante « sont » au lieu de « son » EN POSITION DE DÉTERMINANT.
const REGEX_SONT_POSSESSIF = new RegExp(
  `\\bsont\\s+(?:${NOMS_ATTRIBUT_CLIENT.join('|')})\\b`,
)

// Détecte une question de SUIVI faisant référence au CLIENT précédent sans le
// nommer (possessif/pronom 3e personne). On EXCLUT « mon / ma / mes » (1re
// personne = l'artisan lui-même : questions générales, pas de reprise).
export function faitReferenceClientPrecedent(question: string): boolean {
  const q = normaliser(question)
  if (/\b(son|sa|ses|leur|leurs|lui|sien|sienne|siens|siennes)\b/.test(q)) {
    return true
  }
  return REGEX_SONT_POSSESSIF.test(q)
}

// =============================================================
// Matching SOUPLE (repli si l'exact ne trouve rien)
// =============================================================

// Distance d'édition (Levenshtein) classique, en programmation dynamique.
function distanceEdition(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  const ligne = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let diagonale = ligne[0]
    ligne[0] = i
    for (let j = 1; j <= b.length; j++) {
      const provisoire = ligne[j]
      const cout = a[i - 1] === b[j - 1] ? 0 : 1
      ligne[j] = Math.min(ligne[j] + 1, ligne[j - 1] + 1, diagonale + cout)
      diagonale = provisoire
    }
  }
  return ligne[b.length]
}

// Écart de lettres toléré selon la longueur du plus long jeton.
function toleranceJeton(t: string, u: string): number {
  const maxLen = Math.max(t.length, u.length)
  if (maxLen <= 3) return 0
  if (maxLen <= 6) return 1
  return 2
}

// Deux jetons concordent souplement si : égaux, OU l'un est sous-chaîne de l'autre,
// OU leur distance d'édition tient dans la tolérance liée à la longueur.
function concordeJeton(t: string, u: string): boolean {
  if (t === u) return true
  if (u.includes(t) || t.includes(u)) return true
  return distanceEdition(t, u) <= toleranceJeton(t, u)
}

// Nombre minimal de jetons concordants exigé : TOUS si N <= 2, sinon ceil(2N/3).
function seuilMajorite(n: number): number {
  if (n <= 2) return n
  return Math.ceil((n * 2) / 3)
}

// Correspondance souple entre un nom RECHERCHÉ et un nom CIBLE. À n'appeler qu'en
// secours (après l'exact). Partagé par les domaines comptes rendus et clients.
export function correspondNomSouple(recherche: string, nomCible: string): boolean {
  const jetons = jetonsSignificatifs(recherche)
  if (jetons.length === 0) return false
  const jetonsCible = jetonsSignificatifs(nomCible)
  if (jetonsCible.length === 0) return false
  const concordants = jetons.filter((t) => jetonsCible.some((u) => concordeJeton(t, u))).length
  return concordants >= seuilMajorite(jetons.length)
}
