import { NextRequest, NextResponse } from 'next/server';
import { reportError } from '@/lib/monitoring';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get('file');

    if (!audioFile || !(audioFile instanceof Blob)) {
      return NextResponse.json(
        { error: 'Aucun fichier audio fourni' },
        { status: 400 }
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
