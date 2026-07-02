import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import type { Chantier, Devis } from '@/lib/types';
import DevisEditeur from './devis-editeur';

interface PageProps {
  params: Promise<{ id: string }>;
  // Phase d'ouverture : « metres » quand on revient du récap via le lien
  // « Saisir les métrés » (?etape=metres). Défaut : proposition technique.
  searchParams: Promise<{ etape?: string }>;
}

export default async function DevisPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { etape } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [{ data: chantier, error: chantierError }, { data: devis }] = await Promise.all([
    supabase.from('chantiers').select('*').eq('id', id).single(),
    supabase.from('devis').select('*').eq('chantier_id', id).maybeSingle(),
  ]);

  if (chantierError || !chantier) notFound();

  return (
    <DevisEditeur
      chantier={chantier as Chantier}
      devis={(devis as Devis) ?? null}
      phaseInitiale={etape === 'metres' ? 'metres' : 'technique'}
    />
  );
}
