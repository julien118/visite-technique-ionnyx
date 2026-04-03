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

  // Récupérer le chantier + profil en parallèle
  const [{ data: chantier, error: chantierError }, { data: rapport }, { data: profile }] = await Promise.all([
    supabase.from('chantiers').select('*').eq('id', id).single(),
    supabase.from('rapports').select('*').eq('chantier_id', id).single(),
    supabase.from('profiles').select('google_refresh_token').eq('id', user.id).single(),
  ]);

  if (chantierError || !chantier) {
    notFound();
  }

  return (
    <RapportClient
      chantier={chantier as Chantier}
      rapport={(rapport as Rapport) || null}
      hasDriveConnected={!!profile?.google_refresh_token}
    />
  );
}
