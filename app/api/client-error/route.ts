import { NextRequest, NextResponse } from 'next/server';
import { reportError } from '@/lib/monitoring';

// Reçoit les exceptions survenues côté navigateur (envoyées par les error
// boundaries app/error.tsx et app/global-error.tsx) et déclenche l'alerte
// Telegram côté serveur — le token du bot ne transite jamais par le client.
// L'anti-spam de reportError() limite les abus éventuels sur cet endpoint ouvert.
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      message?: string;
      digest?: string;
      url?: string;
    };
    const message = (body.message || 'Exception client inconnue').toString().slice(0, 500);
    const url = (body.url || '').toString().slice(0, 200);
    const digest = body.digest ? ` (digest ${body.digest})` : '';
    await reportError(
      'Interface (écran utilisateur)',
      new Error(message + digest),
      url ? `Page : ${url}` : undefined
    );
  } catch {
    /* on ignore : ne jamais faire échouer le report d'erreur */
  }
  return NextResponse.json({ ok: true });
}
