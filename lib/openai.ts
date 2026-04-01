// Helper pour l'API OpenAI GPT-4.1

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

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4.1',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT_RAPPORT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Erreur OpenAI:', response.status, errorText);
    throw new Error(`Erreur OpenAI: ${response.status}`);
  }

  const result = await response.json();
  const content = result.choices[0]?.message?.content;

  if (!content) {
    throw new Error('Réponse vide de OpenAI');
  }

  const parsed: RapportContenu = JSON.parse(content);
  return parsed;
}
