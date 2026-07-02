import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Protéger toutes les routes sauf les fichiers statiques et les API.
    // Le catch-all `.*\.(svg|png|...)$` exclut TOUT asset image de public/
    // (logo, favicons, og-image…) : sans lui, le middleware redirige les images
    // vers /login (307) et next/image échoue (« received null »).
    '/((?!_next/static|_next/image|favicon.ico|icon-.*\\.png|manifest\\.json|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico)$).*)',
  ],
};
