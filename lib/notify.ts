// Envoi de notifications (alertes + digests) vers Telegram et/ou un webhook
// générique. Centralisé ici pour être réutilisé par le canari de santé du
// modèle, le digest d'usage et le dispatcher cron.
//
// Variables d'env :
//   TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID  → message Telegram direct (recommandé)
//   TELEGRAM_TOPIC_ID                      → fil « Topic » d'un groupe forum (optionnel) :
//       quand le bot poste dans un GROUPE en mode Topics partagé entre clients, ce fil
//       est dédié à CE déploiement (ex. « MTC37 ») → tout (tickets + alertes) y atterrit.
//   ALERT_WEBHOOK_URL                      → webhook générique (n8n/Slack/Discord), optionnel

import { fetchRetry } from './fetch-retry';

// Identifiant du « topic » (fil) Telegram où poster, ou undefined si non configuré.
// Permet de partager UN groupe entre plusieurs clients, chacun dans son fil dédié.
function topicId(): number | undefined {
  const t = process.env.TELEGRAM_TOPIC_ID?.trim();
  const n = t ? Number(t) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

export async function sendTelegram(text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return false;
  try {
    const tid = topicId();
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // parse_mode HTML : permet le gras <b>…</b> dans les digests.
      body: JSON.stringify({ chat_id: chatId, ...(tid ? { message_thread_id: tid } : {}), text, parse_mode: 'HTML', disable_web_page_preview: true }),
    });
    return res.ok;
  } catch (e) {
    console.error('[notify] Échec Telegram:', e);
    return false;
  }
}

export async function sendWebhook(payload: Record<string, unknown>): Promise<boolean> {
  const webhook = process.env.ALERT_WEBHOOK_URL;
  if (!webhook) return false;
  try {
    const res = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch (e) {
    console.error('[notify] Échec webhook:', e);
    return false;
  }
}

// Notifie sur tous les canaux configurés. `text` est en HTML léger (<b>).
export async function notify(text: string, meta: Record<string, unknown> = {}): Promise<void> {
  await Promise.allSettled([
    sendTelegram(text),
    // Pour le webhook on envoie une version texte brut + les métadonnées.
    sendWebhook({ text: stripHtml(text), content: stripHtml(text), ...meta }),
  ]);
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, '');
}

// =============================================================
// Helpers tickets « Demander à Julien » (canal Telegram)
// =============================================================

/** Nom affiché en tête des messages Telegram (ex. « MTC37 — … »). */
export function nomDeploiement(): string {
  return process.env.DEPLOYMENT_NAME?.trim() || 'MTC37';
}

/** Prénom du contact côté client — ce que Julien voit dans les messages Telegram
 *  (au lieu de « le client »). Surchargeable par CONTACT_NOM ; MTC37 = « Hendrix ». */
export function nomContact(): string {
  return process.env.CONTACT_NOM?.trim() || 'Hendrix';
}

/** Échappe le texte dynamique pour parse_mode HTML de Telegram (& < >). */
export function echapperHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Variante de sendTelegram qui RENVOIE le message_id du message posté (pour
 * matcher ensuite les réponses de Julien via reply_to_message). Renvoie null si
 * non configuré, si l'envoi échoue, ou si la réponse n'a pas la forme attendue.
 * Best-effort : ne throw JAMAIS (la création de ticket tient compte du null).
 */
// Un clavier inline Telegram = lignes de boutons. Chaque bouton porte un `callback_data`
// (≤ 64 octets) renvoyé tel quel au webhook quand on tape dessus.
export type ClavierInline = { inline_keyboard: { text: string; callback_data: string }[][] };

export async function sendTelegramAvecId(
  text: string,
  replyToMessageId?: number,
  clavier?: ClavierInline,
): Promise<number | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return null;
  try {
    const res = await fetchRetry(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        ...(topicId() ? { message_thread_id: topicId() } : {}),
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        ...(replyToMessageId ? { reply_to_message_id: replyToMessageId } : {}),
        ...(clavier ? { reply_markup: clavier } : {}),
      }),
      cache: 'no-store',
    }, { timeoutMs: 8000 });
    const data = await res.json().catch(() => null);
    const id = data?.result?.message_id;
    return typeof id === 'number' ? id : null;
  } catch {
    return null;
  }
}

/**
 * Livraison d'une notif de TICKET à Julien, avec la résilience MAXIMALE possible.
 * On tente d'abord dans le fil dédié (topic) ; si ça échoue (fil supprimé, mauvais
 * TELEGRAM_TOPIC_ID — le cas typique d'une demande « qui n'arrive pas »), on RETENTE
 * dans le groupe SANS le fil : Julien voit quand même la demande, et le threading des
 * réponses (par message_id) continue de fonctionner.
 * Renvoie le message_id, ou null UNIQUEMENT si aucune tentative n'a abouti (canal HS ou
 * mal configuré). Dans ce cas l'appelant garde la demande en file (outbox) pour la
 * re-livrer plus tard → aucune demande n'est jamais perdue. Ne throw JAMAIS.
 */
export async function livrerTicketTelegram(
  text: string,
  opts: { replyToMessageId?: number; clavier?: ClavierInline } = {},
): Promise<number | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return null;
  const tid = topicId();
  // 1) essai dans le fil dédié ; 2) repli dans le groupe sans fil si le fil pose problème.
  const essais = tid ? [tid, undefined] : [undefined];
  for (const fil of essais) {
    try {
      const res = await fetchRetry(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          ...(fil ? { message_thread_id: fil } : {}),
          text,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          ...(opts.replyToMessageId ? { reply_to_message_id: opts.replyToMessageId } : {}),
          ...(opts.clavier ? { reply_markup: opts.clavier } : {}),
        }),
        cache: 'no-store',
      }, { timeoutMs: 8000 });
      const data = await res.json().catch(() => null);
      const id = data?.result?.message_id;
      if (typeof id === 'number') return id;
      // ok=false (ex. « message thread not found ») → on tente le repli sans fil.
    } catch {
      // réseau : on tente le repli, sinon on rendra null (→ file d'attente).
    }
  }
  return null;
}

// Répond à un clic de bouton (callback_query) : fait disparaître le « spinner » sur
// le bouton + affiche un petit toast au cliqueur. À appeler TOUJOURS, sinon Telegram
// laisse le bouton en chargement ~30 s. Best-effort.
export async function answerCallback(callbackQueryId: string, texte?: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  try {
    await fetchRetry(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackQueryId, ...(texte ? { text: texte } : {}) }),
    }, { timeoutMs: 8000 });
  } catch {
    // best-effort
  }
}

// Remplace les boutons d'un message déjà posté (ex. après « Je prends » ou « Résolu »).
// Passer un clavier vide retire tous les boutons. Best-effort.
export async function editClavier(messageId: number, clavier: ClavierInline): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  try {
    await fetchRetry(`https://api.telegram.org/bot${token}/editMessageReplyMarkup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId, reply_markup: clavier }),
    }, { timeoutMs: 8000 });
  } catch {
    // best-effort
  }
}

// État de santé du webhook côté Telegram (sonde du watchdog). Renvoie le nombre de
// updates en attente + la dernière erreur de livraison rencontrée par Telegram.
// null si non configuré / appel échoué.
export async function getWebhookInfo(): Promise<{
  pending_update_count: number;
  last_error_date?: number;
  last_error_message?: string;
  url?: string;
} | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  try {
    const res = await fetchRetry(`https://api.telegram.org/bot${token}/getWebhookInfo`, {}, { timeoutMs: 8000 });
    const data = await res.json().catch(() => null);
    const r = data?.result;
    if (!r) return null;
    return {
      pending_update_count: Number(r.pending_update_count) || 0,
      last_error_date: r.last_error_date,
      last_error_message: r.last_error_message,
      url: r.url,
    };
  } catch {
    return null;
  }
}

/**
 * Envoie un fichier audio (le vocal du client) sur Telegram, en réponse au message
 * du ticket. OGG/OPUS → message vocal natif (sendVoice) ; tout autre format → document
 * audio jouable (sendDocument). Best-effort : ne throw JAMAIS.
 */
export async function sendTelegramFichierAudio(file: Blob, filename: string, replyToMessageId?: number): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  try {
    const isOgg = /ogg/i.test(file.type || '');
    const method = isOgg ? 'sendVoice' : 'sendDocument';
    const field = isOgg ? 'voice' : 'document';
    const form = new FormData();
    form.append('chat_id', chatId);
    const tid = topicId();
    if (tid) form.append('message_thread_id', String(tid));
    if (replyToMessageId) form.append('reply_to_message_id', String(replyToMessageId));
    if (!isOgg) form.append('caption', '🎤 Message vocal');
    form.append(field, file, filename);
    await fetchRetry(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      body: form,
    }, { timeoutMs: 25000 });
  } catch {
    // best-effort : on n'alerte pas sur un échec d'envoi de vocal.
  }
}

/**
 * Envoie une PHOTO sur Telegram à partir de son URL publique (bucket `photos`).
 * Telegram va chercher l'URL lui-même (d'où le besoin d'un bucket public). Renvoie
 * le message_id (pour matcher d'éventuelles réponses), ou null. Ne throw JAMAIS.
 */
export async function sendTelegramPhoto(
  photoUrl: string,
  caption?: string,
  replyToMessageId?: number,
): Promise<number | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return null;
  const tid = topicId();
  try {
    const res = await fetchRetry(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        ...(tid ? { message_thread_id: tid } : {}),
        photo: photoUrl,
        ...(caption ? { caption, parse_mode: 'HTML' } : {}),
        ...(replyToMessageId ? { reply_to_message_id: replyToMessageId } : {}),
      }),
    }, { timeoutMs: 15000 });
    const data = await res.json().catch(() => null);
    const id = data?.result?.message_id;
    return typeof id === 'number' ? id : null;
  } catch {
    return null;
  }
}
