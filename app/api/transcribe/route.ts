import { NextRequest, NextResponse } from 'next/server';
import { reportError } from '@/lib/monitoring';
import { createClient } from '@/lib/supabase/server';

// Groq Whisper accepte jusqu'à ~25 Mo ; l'audio est compressé côté client (opus),
// donc ce plafond large suffit à couper tout abus de coût sur cet endpoint.
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    // Auth : le middleware exclut /api, donc la garde se fait ICI. Sans elle,
    // n'importe qui pourrait consommer le quota/facturation Groq (endpoint ouvert).
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const formData = await request.formData();
    const audioFile = formData.get('file');

    if (!audioFile || !(audioFile instanceof Blob)) {
      return NextResponse.json(
        { error: 'Aucun fichier audio fourni' },
        { status: 400 }
      );
    }

    if (audioFile.size > MAX_AUDIO_BYTES) {
      return NextResponse.json(
        { error: 'Fichier audio trop volumineux' },
        { status: 413 }
      );
    }

    // Construire le FormData pour Groq Whisper
    const groqFormData = new FormData();
    groqFormData.append('file', audioFile, 'audio.webm');
    groqFormData.append('model', 'whisper-large-v3-turbo');
    groqFormData.append('language', 'fr');
    groqFormData.append('response_format', 'json');

    const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: groqFormData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Erreur Groq Whisper:', response.status, errorText);
      return NextResponse.json(
        { error: 'Erreur lors de la transcription' },
        { status: response.status }
      );
    }

    const result = await response.json();
    return NextResponse.json({ text: result.text });
  } catch (error) {
    console.error('Erreur transcription:', error);
    await reportError('Transcription audio (Groq)', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de la transcription' },
      { status: 500 }
    );
  }
}
