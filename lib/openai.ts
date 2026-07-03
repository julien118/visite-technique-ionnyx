// Helper pour l'API Anthropic Claude

import { after } from 'next/server';
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

// Consommation minimale des tokens d'usage renvoyés par le flux Anthropic.
interface UsageStream {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

export async function generateReport(
  chantier: ChantierData,
  items: CaptureData[],
  // Appelé au fil de la génération avec le nombre de caractères déjà produits :
  // permet à la route d'afficher une progression RÉELLE au lieu d'une animation.
  onProgress?: (caracteres: number) => void
): Promise<RapportContenu> {
  const userPrompt = buildUserPrompt(chantier, items);
  let lastModelError: Error | null = null;

  for (let i = 0; i < MODEL_CHAIN.length; i++) {
    const model = MODEL_CHAIN[i];

    // stream: true — le contenu produit est identique à l'appel bloquant, mais
    // les tokens arrivent au fil de l'eau : premier signal en ~1 s au lieu
    // d'un silence de 30-60 s, et la connexion ne reste jamais muette.
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
        stream: true,
        // cache_control : le prompt système (~1,1k tokens, identique à chaque
        // génération) est mis en cache côté Anthropic → TTFT réduit et coût
        // input ÷10 sur la part cachée pour les générations rapprochées.
        // Ignoré silencieusement si le prompt est sous le minimum cacheable.
        // Le texte envoyé au modèle est strictement le même.
        system: [
          {
            type: 'text',
            text: SYSTEM_PROMPT_RAPPORT,
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: [
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    // 404 = modèle retiré / introuvable → on bascule automatiquement sur le
    // suivant (l'erreur arrive AVANT le début du flux, la bascule est intacte).
    if (response.status === 404) {
      const errText = await response.text();
      console.warn(`[generateReport] Modèle "${model}" indisponible (404). Bascule sur le suivant. ${errText}`);
      lastModelError = new Error(`Modèle ${model} indisponible (404)`);
      continue;
    }

    // Autre erreur (rate limit, surcharge, auth…) : ce n'est pas un retrait de
    // modèle, on ne la masque pas en changeant de modèle, on la remonte.
    if (!response.ok || !response.body) {
      const errorText = await response.text();
      console.error('Erreur Anthropic:', response.status, errorText);
      throw new Error(`Erreur Anthropic: ${response.status}`);
    }

    // Lecture du flux SSE Anthropic : on accumule le texte des deltas et on
    // récupère l'usage (message_start = entrée, message_delta = sortie finale).
    let content = '';
    const usage: UsageStream = {};
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        let event: {
          type?: string;
          message?: { usage?: UsageStream };
          delta?: { text?: string };
          usage?: UsageStream;
          error?: { message?: string };
        };
        try {
          event = JSON.parse(line.slice(6));
        } catch {
          continue;
        }
        if (event.type === 'message_start' && event.message?.usage) {
          Object.assign(usage, event.message.usage);
        } else if (event.type === 'content_block_delta' && event.delta?.text) {
          content += event.delta.text;
          onProgress?.(content.length);
        } else if (event.type === 'message_delta' && event.usage) {
          Object.assign(usage, event.usage);
        } else if (event.type === 'error') {
          throw new Error(`Erreur Anthropic en cours de flux: ${event.error?.message || 'inconnue'}`);
        }
      }
    }

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
    // hebdo/mensuels — APRÈS la réponse HTTP (after garantit l'exécution sans
    // retarder l'utilisateur d'un aller-retour DB). logAnthropicUsage n'échoue
    // jamais.
    after(logAnthropicUsage(model, usage, chantier.id));

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
