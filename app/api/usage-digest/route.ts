import { NextRequest, NextResponse } from 'next/server';
import { buildDigest, Period } from '@/lib/usage';
import { sendTelegram } from '@/lib/notify';

// Construit et envoie un digest d'usage sur Telegram.
// Appelé par le dispatcher cron, mais aussi utilisable à la main pour tester :
//   GET /api/usage-digest?period=week   (ou month)
//   -> renvoie l'aperçu du message ET l'envoie sur Telegram.
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: 'Non autorisé' }, { status: 401 });
  }

  const periodParam = request.nextUrl.searchParams.get('period');
  const period: Period = periodParam === 'month' ? 'month' : 'week';

  const text = await buildDigest(period);
  const sent = await sendTelegram(text);

  return NextResponse.json({ ok: true, period, sent, preview: text });
}
