import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// Endpoint appelé quotidiennement par Vercel Cron pour empêcher l'auto-pause
// de la base Supabase en plan gratuit (pause après 7 jours d'inactivité DB).
// Lecture-seule, ne touche à aucune donnée utilisateur.
export async function GET() {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  );

  const { count, error } = await supabase
    .from('chantiers')
    .select('*', { count: 'exact', head: true });

  if (error) {
    console.error('[keep-alive] Erreur Supabase:', error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    ts: new Date().toISOString(),
    chantiers_count: count,
  });
}
