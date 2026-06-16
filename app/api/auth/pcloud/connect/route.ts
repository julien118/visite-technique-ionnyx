import { NextRequest, NextResponse } from 'next/server';
import { reportError } from '@/lib/monitoring';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { pcloudLogin, type PCloudHostname } from '@/lib/pcloud';

export async function POST(request: NextRequest) {
  try {
    const { email, password, region } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email et mot de passe requis' }, { status: 400 });
    }

    const hostname: PCloudHostname = region === 'US' ? 'api.pcloud.com' : 'eapi.pcloud.com';

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

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    // Échange login/password → token (le password n'est jamais stocké)
    const loginResult = await pcloudLogin(email, password, hostname);

    if (loginResult.result !== 0 || !loginResult.auth) {
      // Tenter l'autre région si échec
      const otherHostname: PCloudHostname = hostname === 'eapi.pcloud.com' ? 'api.pcloud.com' : 'eapi.pcloud.com';
      const retryResult = await pcloudLogin(email, password, otherHostname);

      if (retryResult.result === 0 && retryResult.auth) {
        await supabase.from('profiles').update({
          pcloud_auth_token: retryResult.auth,
          pcloud_hostname: otherHostname,
          pcloud_email: retryResult.email || email,
        }).eq('id', user.id);

        return NextResponse.json({ success: true, hostname: otherHostname });
      }

      return NextResponse.json(
        { error: loginResult.error || 'Identifiants pCloud invalides' },
        { status: 401 }
      );
    }

    await supabase.from('profiles').update({
      pcloud_auth_token: loginResult.auth,
      pcloud_hostname: hostname,
      pcloud_email: loginResult.email || email,
    }).eq('id', user.id);

    return NextResponse.json({ success: true, hostname });
  } catch (error) {
    console.error('[pCloud connect] Erreur:', error);
    await reportError('Connexion pCloud', error);
    return NextResponse.json({ error: 'Erreur lors de la connexion pCloud' }, { status: 500 });
  }
}
