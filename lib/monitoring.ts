// Surveillance d'erreurs : capteur central appelé partout (routes API + crashs
// client). Envoie une alerte Telegram immédiate avec la RAISON et COMMENT la
// résoudre, pour qu'on voie le problème avant l'utilisateur.
// Réutilise le bot Telegram déjà configuré — aucune nouvelle variable ni table.

import { notify } from './notify';

// Anti-spam : on ne réémet pas la même alerte plus d'une fois par fenêtre, tant
// que l'instance de fonction reste chaude (suffisant pour le cas "l'utilisateur
// réessaie 5 fois d'affilée").
const lastSent = new Map<string, number>();
const THROTTLE_MS = 5 * 60 * 1000;

export async function reportError(context: string, error: unknown, extra?: string): Promise<void> {
  try {
    const reason =
      error instanceof Error
        ? error.message
        : error && typeof error === 'object' && 'message' in error
          ? String((error as { message: unknown }).message)
          : String(error);
    const sig = `${context}|${reason}`.slice(0, 200);
    const now = Date.now();
    const last = lastSent.get(sig);
    if (last && now - last < THROTTLE_MS) return;
    lastSent.set(sig, now);

    const name = process.env.DEPLOYMENT_NAME || 'IONNYX';
    const ts = new Date().toLocaleString('fr-FR', {
      timeZone: 'Europe/Paris',
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    });

    const msg =
      `🚨 <b>${esc(name)}</b> — erreur détectée\n` +
      `📍 Où : ${esc(context)}\n` +
      `💬 Raison : ${esc(reason).slice(0, 350)}\n` +
      (extra ? `📋 Détail : ${esc(extra).slice(0, 200)}\n` : '') +
      `🔧 Solution : ${esc(diagnose(reason))}\n` +
      `🕐 ${ts}`;

    await notify(msg, { type: 'error', context, reason });
  } catch {
    // Le reporting ne doit JAMAIS casser le flux applicatif.
  }
}

// Heuristique "comment résoudre" à partir du message d'erreur.
function diagnose(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('404') || m.includes('not_found') || m.includes('indisponible'))
    return "Modèle Anthropic retiré — le repli a déjà pris le relais ; mets à jour ANTHROPIC_MODEL dans Vercel quand tu peux.";
  if (m.includes('429') || m.includes('rate_limit'))
    return "Limite de débit Anthropic atteinte — temporaire, réessayer dans quelques minutes.";
  if (m.includes('529') || m.includes('overload'))
    return "API Anthropic surchargée — temporaire, réessayer un peu plus tard.";
  if (m.includes('401') || m.includes('authentication') || m.includes('api key') || m.includes('unauthorized'))
    return "Clé API invalide/expirée — vérifier ANTHROPIC_API_KEY (ou GROQ_API_KEY) dans Vercel.";
  if (m.includes('transcri') || m.includes('groq') || m.includes('whisper'))
    return "Échec de transcription (Groq) — vérifier GROQ_API_KEY et le format audio ; le reste de la visite n'est pas affecté.";
  if (m.includes('json'))
    return "Réponse IA non conforme (JSON) — généralement transitoire, relancer la génération.";
  if (m.includes('storage') || m.includes('upload') || m.includes('bucket'))
    return "Échec d'upload Supabase Storage — vérifier les buckets 'audio'/'photos' et la connexion réseau du terrain.";
  if (m.includes('pcloud'))
    return "Échec pCloud — le jeton a probablement expiré ; reconnecter le compte pCloud.";
  if (m.includes('pdf') || m.includes('canvas'))
    return "Échec de génération PDF — réessayer ; si ça persiste, vérifier le contenu du rapport.";
  if (m.includes('pgrst') || m.includes('supabase') || m.includes('database') || m.includes('relation') || m.includes('column'))
    return "Problème base de données — vérifier l'état du projet Supabase (en pause ? table/colonne manquante ?).";
  if (m.includes('timeout') || m.includes('etimedout') || m.includes('fetch failed') || m.includes('network'))
    return "Souci réseau temporaire (timeout) — réessayer ; vérifier la connexion ou l'état des services.";
  return "Erreur inattendue — consulter les logs Vercel (projet → Logs) pour le détail complet.";
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
