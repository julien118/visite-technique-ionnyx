import { NextRequest, NextResponse } from 'next/server';
import { reportError } from '@/lib/monitoring';

// Reçoit les exceptions survenues côté navigateur (envoyées par les error
// boundaries app/error.tsx et app/global-error.tsx) et déclenche l'alerte
// Telegram côté serveur — le token du bot ne transite jamais par le client.
//
// Endpoint OUVERT (pas de session possible sur un crash client). Le throttle
// par-signature de reportError() ne suffit pas ici : le message est
// attaquant-contrôlé, donc en le variant on le contournerait et on inonderait
// le Telegram. On ajoute un PLAFOND GLOBAL (tous messages confondus) propre à
// cet endpoint : au-delà, on accepte silencieusement sans notifier. État en
// mémoire = best-effort (réinitialisé au cold start), suffisant à ce niveau.
const WINDOW_MS = 5 * 60 * 1000;
const MAX_PAR_FENETRE = 10;
let fenetreDebut = 0;
let compteur = 0;

function tropDAlertes(now: number): boolean {
  if (now - fenetreDebut > WINDOW_MS) {
    fenetreDebut = now;
    compteur = 0;
  }
  compteur += 1;
  return compteur > MAX_PAR_FENETRE;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      message?: string;
      digest?: string;
      url?: string;
    };

    if (tropDAlertes(Date.now())) {
      return NextResponse.json({ ok: true, throttled: true });
    }

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
