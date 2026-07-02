// =============================================================
// Rédacteur générique partagé par les domaines de l'assistant
// =============================================================
// Étape 3 de la chaîne anti-hallucination : Claude rédige une réponse en français
// UNIQUEMENT à partir d'un objet de FAITS déjà récupérés, filtrés et calculés par
// le code du domaine. Il ne calcule rien, n'invente rien.

import { anthropic, MODELE_CLAUDE } from '../anthropic'
import { blocContexteArtisan } from './profil-artisan'
import { memoireApprentissage } from './apprentissage'
import { blocReglesSortiePropre } from './format-sortie'

// Rédige à partir des FAITS. `sujet` rappelle la nature des données (ex : « comptes
// rendus de visite ») ; `faits` est l'objet borné construit par le domaine.
// Anti-hallucination : tout ce que le modèle cite doit venir des FAITS.
//
// PERSONNALISATION + APPRENTISSAGE : on préfixe le prompt par le contexte artisan
// (nom/entreprise/métier) et, si `userId` est fourni, par la MÉMOIRE (👍/👎 +
// sujets consultés) → réponses adressées par prénom et de plus en plus pertinentes.
export async function redigerDepuisFaits(args: {
  question: string
  sujet: string
  faits: unknown
  userId?: string
}): Promise<string> {
  const contexte = blocContexteArtisan()
  const memoire = args.userId ? await memoireApprentissage(args.userId) : ''

  const prompt = `${contexte}

Tu réponds en français, de manière claire et concise, UNIQUEMENT à partir des FAITS fournis ci-dessous, qui proviennent de ses vraies données (${args.sujet}).
${memoire ? `\n${memoire}\n` : ''}
QUESTION DE L'ARTISAN :
${args.question}

FAITS (déjà récupérés, filtrés et calculés par le code à partir des vraies données) :
${JSON.stringify(args.faits, null, 2)}

RÈGLES STRICTES :
- N'invente RIEN. Chaque observation, mesure, nom de client, date ou chiffre que tu cites doit apparaître EXACTEMENT dans les FAITS ci-dessus. Ne déduis pas, ne complète pas, ne recalcule rien toi-même.
- Si les FAITS indiquent qu'aucun élément ne correspond à la demande, dis-le clairement, sans inventer.
- Si les FAITS signalent plusieurs correspondances pour un même nom, restitue-les et invite l'artisan à préciser (le client, la date) plutôt que d'en choisir une au hasard.
- Si les FAITS indiquent "correspondance_approchante": true, c'est que le nom demandé ne correspond pas exactement à celui retrouvé (faute de frappe ou variante). Réponds en citant le nom EXACT présent dans les FAITS et invite l'artisan à confirmer que c'est bien le bon chantier. N'invente aucun nom.
- Si les FAITS signalent que la liste est tronquée, précise que tu ne montres que les premiers éléments.
- Reste factuel et bref. Pas de relance commerciale, pas de conseil non demandé.
${blocReglesSortiePropre()}
- Tu es en LECTURE SEULE : tu ne peux rien créer ni modifier, seulement consulter et restituer.`

  const rep = await anthropic.messages.create({
    model: MODELE_CLAUDE,
    max_tokens: 700,
    temperature: 0,
    messages: [{ role: 'user', content: prompt }],
  })
  return rep.content[0]?.type === 'text' ? (rep.content[0].text ?? '').trim() : ''
}
