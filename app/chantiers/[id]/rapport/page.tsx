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

  // Récupérer le chantier
  const { data: chantier, error: chantierError } = await supabase
    .from('chantiers')
    .select('*')
    .eq('id', id)
    .single();

  if (chantierError || !chantier) {
    notFound();
  }

  // Récupérer le rapport s'il existe
  const { data: rapport } = await supabase
    .from('rapports')
    .select('*')
    .eq('chantier_id', id)
    .single();

  return (
    <RapportClient
      chantier={chantier as Chantier}
      rapport={(rapport as Rapport) || null}
    />
  );
}
