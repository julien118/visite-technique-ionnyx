// Envoi de notifications (alertes + digests) vers Telegram et/ou un webhook
// générique. Centralisé ici pour être réutilisé par le canari de santé du
// modèle, le digest d'usage et le dispatcher cron.
//
// Variables d'env :
//   TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID  → message Telegram direct (recommandé)
//   ALERT_WEBHOOK_URL                      → webhook générique (n8n/Slack/Discord), optionnel

export async function sendTelegram(text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // parse_mode HTML : permet le gras <b>…</b> dans les digests.
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
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
