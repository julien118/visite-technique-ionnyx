import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();

  const url = request.nextUrl.clone();
  url.pathname = '/login';
  // 303 (et non le 307 par défaut de NextResponse.redirect) : la déconnexion
  // arrive en POST (form). Un 307 préserve la méthode → le navigateur re-POST
  // sur /login (page GET only) → HTTP 405. Le 303 force le suivi en GET.
  return NextResponse.redirect(url, 303);
}
