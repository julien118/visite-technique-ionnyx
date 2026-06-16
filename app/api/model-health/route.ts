import { NextRequest, NextResponse } from 'next/server';

// Canari quotidien (Vercel Cron) : vérifie que le modèle Anthropic préféré
// (ANTHROPIC_MODEL, défaut claude-sonnet-4-6) est toujours actif.
// S'il a été retiré (404), la génération de rapport bascule automatiquement sur
// un modèle de repli (voir lib/openai.ts) — l'utilisateur n'est jamais coupé —
// et cet endpoint envoie une alerte directe sur Telegram (TELEGRAM_BOT_TOKEN +
// TELEGRAM_CHAT_ID) et/ou sur un webhook générique (ALERT_WEBHOOK_URL : n8n /
// Slack / Discord), pour qu'on mette à jour ANTHROPIC_MODEL tranquillement.
const PREFERRED_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

export async function GET(request: NextRequest) {
  // Protection optionnelle : si CRON_SECRET est défini, on exige le header que
  // Vercel Cron envoie automatiquement. Sinon, endpoint ouvert (probe inoffensif).
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: 'Non autorisé' }, { status: 401 });
  }

  let httpStatus = 0;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      // Probe minimal (1 token) : coût négligeable, on ne regarde que le code HTTP.
      body: JSON.stringify({
        model: PREFERRED_MODEL,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ping' }],
      }),
    });
    httpStatus = res.status;
  } catch (e) {
    console.error('[model-health] Erreur réseau:', e);
  }

  // On n'alerte QUE sur un retrait de modèle (404), pas sur les erreurs
  // transitoires (429/529), pour éviter les fausses alertes.
  const retired = httpStatus === 404;

  if (retired) {
    const msg = `⚠️ IONNYX — le modèle Anthropic préféré "${PREFERRED_MODEL}" semble RETIRÉ (404). La génération de rapport bascule automatiquement en repli (l'utilisateur n'est pas bloqué), mais pense à mettre à jour la variable d'env ANTHROPIC_MODEL vers un modèle actif.`;
    console.warn('[model-health]', msg);

    // Alerte Telegram directe (bot créé via @BotFather) si configurée.
    const tgToken = process.env.TELEGRAM_BOT_TOKEN;
    const tgChat = process.env.TELEGRAM_CHAT_ID;
    if (tgToken && tgChat) {
      try {
        await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: tgChat, text: msg }),
        });
      } catch (e) {
        console.error('[model-health] Échec envoi Telegram:', e);
      }
    }

    // Webhook générique (n8n / Slack / Discord) si configuré — optionnel, en plus.
    const webhook = process.env.ALERT_WEBHOOK_URL;
    if (webhook) {
      try {
        await fetch(webhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // text → Slack, content → Discord, le reste pour n8n / usage générique.
          body: JSON.stringify({ text: msg, content: msg, model: PREFERRED_MODEL, type: 'model_retired' }),
        });
      } catch (e) {
        console.error('[model-health] Échec envoi alerte webhook:', e);
      }
    }
  }

  return NextResponse.json({
    ok: !retired,
    model: PREFERRED_MODEL,
    httpStatus,
    healthy: !retired,
    alertSent: retired && (!!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) || !!process.env.ALERT_WEBHOOK_URL),
    ts: new Date().toISOString(),
  });
}
