// Helper pour l'API Anthropic Claude

import { RapportContenu } from './types';
import { SYSTEM_PROMPT_RAPPORT, buildUserPrompt } from './prompts';

interface ChantierData {
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

export async function generateReport(
  chantier: ChantierData,
  items: CaptureData[]
): Promise<RapportContenu> {
  const userPrompt = buildUserPrompt(chantier, items);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 16000,
      system: SYSTEM_PROMPT_RAPPORT,
      messages: [
        { role: 'user', content: userPrompt },
      ],
    }),
  });

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
  return parsed;
}
