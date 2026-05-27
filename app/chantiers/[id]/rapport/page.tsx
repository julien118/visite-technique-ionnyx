import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import { Chantier, Rapport } from '@/lib/types';
import RapportClient from './rapport-client';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function RapportPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const [{ data: chantier, error: chantierError }, { data: rapport }, { data: profile }, { data: photoCaptures }] = await Promise.all([
    supabase.from('chantiers').select('*').eq('id', id).single(),
    supabase.from('rapports').select('*').eq('chantier_id', id).single(),
    supabase.from('profiles').select('pcloud_auth_token, pcloud_email').eq('id', user.id).single(),
    supabase.from('capture_items').select('photo_url').eq('chantier_id', id).eq('type', 'photo').not('photo_url', 'is', null),
  ]);

  if (chantierError || !chantier) {
    notFound();
  }

  const capturePhotoUrls = (photoCaptures || [])
    .map((c) => c.photo_url as string | null)
    .filter((u): u is string => !!u);

  return (
    <RapportClient
      chantier={chantier as Chantier}
      rapport={(rapport as Rapport) || null}
      hasPCloudConnected={!!profile?.pcloud_auth_token}
      pcloudEmail={profile?.pcloud_email || null}
      capturePhotoUrls={capturePhotoUrls}
    />
  );
}
