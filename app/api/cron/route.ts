import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { buildDigest } from '@/lib/usage';
import { sendTelegram, notify } from '@/lib/notify';

// Dispatcher cron UNIQUE (appelé une fois par jour par Vercel Cron).
// Sur Vercel Hobby, le nombre de crons est limité — on centralise donc tout ici :
//   - tous les jours : keep-alive Supabase + contrôle de santé du modèle Anthropic
//   - le dimanche (UTC) : envoi du digest hebdomadaire sur Telegram
//   - le 1er du mois (UTC) : envoi du digest mensuel (mois précédent complet)
const PREFERRED_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

export async function GET(request: NextRequest) {
  // Protection optionnelle : si CRON_SECRET est défini, on exige le header que
  // Vercel Cron envoie automatiquement.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: 'Non autorisé' }, { status: 401 });
  }

  const now = new Date();
  const ran: string[] = [];

  // 1) Keep-alive Supabase (empêche l'auto-pause de la base en plan gratuit).
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { cookies: { getAll: () => [], setAll: () => {} } }
    );
    await supabase.from('chantiers').select('*', { count: 'exact', head: true });
    ran.push('keep-alive');
  } catch (e) {
    console.error('[cron] keep-alive:', e);
  }

  // 2) Santé du modèle Anthropic : probe minimal, alerte si retiré (404).
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model: PREFERRED_MODEL, max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] }),
    });
    if (res.status === 404) {
      const name = process.env.DEPLOYMENT_NAME || 'IONNYX';
      await notify(
        `⚠️ <b>${name}</b> — le modèle Anthropic « ${PREFERRED_MODEL} » semble RETIRÉ (404). La génération bascule automatiquement en repli (personne n'est bloqué), mais pense à mettre à jour la variable ANTHROPIC_MODEL.`,
        { type: 'model_retired', model: PREFERRED_MODEL }
      );
      ran.push('model-health:ALERTE');
    } else {
      ran.push('model-health:ok');
    }
  } catch (e) {
    console.error('[cron] model-health:', e);
  }

  // 3) Digest hebdomadaire — le dimanche (jour 0 en UTC).
  if (now.getUTCDay() === 0) {
    try {
      await sendTelegram(await buildDigest('week', now));
      ran.push('digest:week');
    } catch (e) {
      console.error('[cron] digest week:', e);
    }
  }

  // 4) Digest mensuel — le 1er du mois (mois précédent complet).
  if (now.getUTCDate() === 1) {
    try {
      await sendTelegram(await buildDigest('month', now));
      ran.push('digest:month');
    } catch (e) {
      console.error('[cron] digest month:', e);
    }
  }

  return NextResponse.json({ ok: true, ran, ts: now.toISOString() });
}
