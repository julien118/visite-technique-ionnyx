import { NextRequest, NextResponse } from 'next/server';
import { reportError } from '@/lib/monitoring';
import { createClient } from '@/lib/supabase/server';

// Groq Whisper accepte jusqu'à ~25 Mo ; l'audio est compressé côté client (opus),
// donc ce plafond large suffit à couper tout abus de coût sur cet endpoint.
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

// Le relais vers Groq (et le téléchargement Storage en mode { path }) peut
// dépasser le timeout par défaut sur un gros fichier — même valeur que
// generate-report.
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    // Auth : le middleware exclut /api, donc la garde se fait ICI. Sans elle,
    // n'importe qui pourrait consommer le quota/facturation Groq (endpoint ouvert).
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    // Deux modes d'entrée :
    // - JSON { path } : l'audio de la visite est DÉJÀ dans le bucket `audio`
    //   (uploadé une seule fois par le client) — on le relit ici côté serveur
    //   au lieu de faire repayer l'uplink 4G au client une seconde fois.
    // - multipart file : blob direct (assistants ticket/devis, compat).
    let audioFile: Blob;

    if (request.headers.get('content-type')?.includes('application/json')) {
      const { path } = await request.json();

      // Le chemin est de la forme {userId}/{chantierId}/{timestamp}.webm : on
      // n'accepte que les fichiers de l'utilisateur connecté (en plus de la RLS
      // Storage qui s'applique via le client session).
      if (typeof path !== 'string' || !path.startsWith(`${user.id}/`)) {
        return NextResponse.json({ error: 'Chemin audio invalide' }, { status: 403 });
      }

      const { data: blob, error: downloadError } = await supabase.storage
        .from('audio')
        .download(path);

      if (downloadError || !blob) {
        return NextResponse.json({ error: 'Audio introuvable' }, { status: 404 });
      }
      audioFile = blob;
    } else {
      const formData = await request.formData();
      const file = formData.get('file');

      if (!file || !(file instanceof Blob)) {
        return NextResponse.json(
          { error: 'Aucun fichier audio fourni' },
          { status: 400 }
        );
      }
      audioFile = file;
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
