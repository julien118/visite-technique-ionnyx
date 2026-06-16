import { NextResponse } from 'next/server';
import { reportError } from '@/lib/monitoring';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { pcloudLogout, type PCloudHostname } from '@/lib/pcloud';

export async function POST() {
  try {
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

    const { data: profile } = await supabase
      .from('profiles')
      .select('pcloud_auth_token, pcloud_hostname')
      .eq('id', user.id)
      .single();

    if (profile?.pcloud_auth_token) {
      await pcloudLogout(
        profile.pcloud_auth_token,
        (profile.pcloud_hostname as PCloudHostname) || 'eapi.pcloud.com'
      );
    }

    await supabase.from('profiles').update({
      pcloud_auth_token: null,
      pcloud_email: null,
    }).eq('id', user.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[pCloud disconnect] Erreur:', error);
    await reportError('Déconnexion pCloud', error);
    return NextResponse.json({ error: 'Erreur déconnexion' }, { status: 500 });
  }
}
