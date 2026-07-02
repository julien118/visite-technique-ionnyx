// Helper pour l'API Anthropic Claude

import { RapportContenu } from './types';
import { SYSTEM_PROMPT_RAPPORT, buildUserPrompt } from './prompts';
import { logAnthropicUsage } from './usage';

interface ChantierData {
  id?: string;
  client_prenom: string;
  client_nom: string;
  client_adresse: string;
  client_telephone: string;
  client_email: string;
  date_visite: string;
  objet_travaux: string;
  provenance: string;
  type_chantier: string;
}

interface CaptureData {
  type: string;
  position: number;
  transcription: string | null;
  photo_url: string | null;
}

// Modèle principal surchargeable sans redéploiement via la variable d'env
// ANTHROPIC_MODEL, puis liste de repli TESTÉE. Sonnet d'abord (même gamme de prix
// $3/$15), Opus en dernier recours : un peu plus cher, mais garantit que la
// génération n'échoue JAMAIS pour cause de modèle retiré. Si Anthropic retire le
// modèle préféré (404), on bascule automatiquement sur le suivant de la liste.
export const MODEL_CHAIN: string[] = Array.from(
  new Set([
    process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
    'claude-sonnet-4-6',
    'claude-sonnet-4-5',
    'claude-opus-4-8',
  ])
);

export async function generateReport(
  chantier: ChantierData,
  items: CaptureData[]
): Promise<RapportContenu> {
  const userPrompt = buildUserPrompt(chantier, items);
  let lastModelError: Error | null = null;

  for (let i = 0; i < MODEL_CHAIN.length; i++) {
    const model = MODEL_CHAIN[i];

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 32000,
        system: SYSTEM_PROMPT_RAPPORT,
        messages: [
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    // 404 = modèle retiré / introuvable → on bascule automatiquement sur le suivant.
    if (response.status === 404) {
      const errText = await response.text();
      console.warn(`[generateReport] Modèle "${model}" indisponible (404). Bascule sur le suivant. ${errText}`);
      lastModelError = new Error(`Modèle ${model} indisponible (404)`);
      continue;
    }

    // Autre erreur (rate limit, surcharge, auth…) : ce n'est pas un retrait de
    // modèle, on ne la masque pas en changeant de modèle, on la remonte.
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Erreur Anthropic:', response.status, errorText);
      throw new Error(`Erreur Anthropic: ${response.status}`);
    }

    const result = await response.json();
    const content = result.content?.[0]?.text;

    if (!content) {
      throw new Error('Réponse vide de Anthropic');
    }

    // Extraire le JSON du contenu (au cas où il y aurait du texte autour)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Pas de JSON trouvé dans la réponse');
    }

    const parsed: RapportContenu = JSON.parse(jsonMatch[0]);

    // Journalise la consommation (tokens + coût Anthropic) pour les digests
    // hebdo/mensuels. Non bloquant : logAnthropicUsage n'échoue jamais.
    await logAnthropicUsage(model, result.usage || {}, chantier.id);

    // Si on a dû utiliser un modèle de repli, on le signale clairement dans les
    // logs (le canari /api/model-health alerte aussi) pour mettre à jour
    // ANTHROPIC_MODEL tranquillement, sans urgence.
    if (i > 0) {
      console.warn(`[generateReport] Rapport généré avec le modèle de REPLI "${model}" — le modèle préféré "${MODEL_CHAIN[0]}" est indisponible. Pense à mettre à jour la variable ANTHROPIC_MODEL.`);
    }

    return parsed;
  }

  // Tous les modèles de la liste ont échoué (tous retirés) — cas extrême.
  throw lastModelError ?? new Error('Aucun modèle Anthropic disponible');
}
