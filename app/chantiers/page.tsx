import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Chantier } from '@/lib/types';
import { nomContact } from '@/lib/notify';
import ChantiersList from './chantiers-list';

export default async function ChantiersPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Profil + chantiers + statut du devis lié à chaque chantier (parité ATG : le
  // statut affiché dérive AUSSI du devis, pour basculer en section « Devis »).
  const [{ data: profile }, { data: chantiers, error }, { data: devisRows }] = await Promise.all([
    supabase.from('profiles').select('company_name').eq('id', user.id).single(),
    supabase.from('chantiers').select('*').order('date_visite', { ascending: false }),
    supabase.from('devis').select('chantier_id, statut'),
  ]);

  if (error) {
    console.error('Erreur chargement chantiers:', error);
  }

  // Map chantier_id → statut du devis (1 devis max par chantier).
  const devisStatuts: Record<string, string> = {};
  for (const d of (devisRows as { chantier_id: string; statut: string }[] | null) ?? []) {
    if (d.chantier_id && d.statut) devisStatuts[d.chantier_id] = d.statut;
  }

  return (
    <ChantiersList
      chantiers={(chantiers as Chantier[]) || []}
      devisStatuts={devisStatuts}
      userEmail={user.email || ''}
      companyName={profile?.company_name || ''}
      greetingName={nomContact()}
    />
  );
}
