// Client Supabase service-role (serveur uniquement) : IGNORE la RLS.
// Réservé aux opérations SANS session utilisateur — ici le webhook Telegram
// (réponses de Julien, qui n'a pas de cookie de session). NE JAMAIS exposer au
// navigateur : la clé service-role contourne toutes les policies.
import { createClient } from '@supabase/supabase-js';

export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
