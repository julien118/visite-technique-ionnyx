import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import { Chantier } from '@/lib/types';
import ChantierForm from '@/components/ChantierForm';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ChantierDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: chantier, error } = await supabase
    .from('chantiers')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !chantier) {
    notFound();
  }

  return <ChantierForm chantier={chantier as Chantier} userId={user.id} />;
}
