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

  // Récupérer les chantiers triés par date de visite décroissante
  const { data: chantiers, error } = await supabase
    .from('chantiers')
    .select('*')
    .order('date_visite', { ascending: false });

  if (error) {
    console.error('Erreur chargement chantiers:', error);
  }

  return <ChantiersList chantiers={(chantiers as Chantier[]) || []} userEmail={user.email || ''} />;
}
