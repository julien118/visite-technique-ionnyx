import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Chantier } from '@/lib/types';
import ChantiersList from './chantiers-list';

export default async function ChantiersPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Récupérer le profil utilisateur et les chantiers en parallèle
  const [{ data: profile }, { data: chantiers, error }] = await Promise.all([
    supabase.from('profiles').select('company_name').eq('id', user.id).single(),
    supabase.from('chantiers').select('*').order('date_visite', { ascending: false }),
  ]);

  if (error) {
    console.error('Erreur chargement chantiers:', error);
  }

  return (
    <ChantiersList
      chantiers={(chantiers as Chantier[]) || []}
      userEmail={user.email || ''}
      companyName={profile?.company_name || ''}
    />
  );
}
