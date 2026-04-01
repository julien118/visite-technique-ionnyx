import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import ChantierForm from '@/components/ChantierForm';

export default async function NouveauChantierPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return <ChantierForm userId={user.id} />;
}
