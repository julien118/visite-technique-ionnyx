import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Protéger toutes les routes sauf les fichiers statiques et les API
    '/((?!_next/static|_next/image|favicon.ico|icon-.*\\.png|manifest\\.json|api/).*)',
  ],
};
