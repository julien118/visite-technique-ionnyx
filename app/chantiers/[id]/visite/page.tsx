import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import { Chantier, CaptureItem } from '@/lib/types';
import VisiteClient from './visite-client';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function VisitePage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Récupérer le chantier
  const { data: chantier, error } = await supabase
    .from('chantiers')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !chantier) {
    notFound();
  }

  // Récupérer les éléments captés existants
  const { data: items } = await supabase
    .from('capture_items')
    .select('*')
    .eq('chantier_id', id)
    .order('position', { ascending: true });

  return (
    <VisiteClient
      chantier={chantier as Chantier}
      initialItems={(items as CaptureItem[]) || []}
      userId={user.id}
    />
  );
}
