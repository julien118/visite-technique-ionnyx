import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const stateParam = request.nextUrl.searchParams.get('state');

  if (!code || !stateParam) {
    return NextResponse.redirect(new URL('/chantiers', request.url));
  }

  let state: { userId: string; chantierId: string };
  try {
    state = JSON.parse(stateParam);
  } catch {
    return NextResponse.redirect(new URL('/chantiers', request.url));
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  try {
    const { tokens } = await oauth2Client.getToken(code);

    // Stocker les tokens dans Supabase
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll() {},
        },
      }
    );

    await supabase
      .from('profiles')
      .update({
        google_access_token: tokens.access_token,
        google_refresh_token: tokens.refresh_token,
        google_token_expiry: tokens.expiry_date
          ? new Date(tokens.expiry_date).toISOString()
          : null,
      })
      .eq('id', state.userId);

    // Rediriger vers le rapport du chantier
    const redirectUrl = state.chantierId
      ? `/chantiers/${state.chantierId}/rapport?drive=connected`
      : '/chantiers';

    return NextResponse.redirect(new URL(redirectUrl, request.url));
  } catch (err) {
    console.error('Erreur OAuth Google callback:', err);
    return NextResponse.redirect(new URL('/chantiers', request.url));
  }
}
