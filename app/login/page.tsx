'use client';

import { useState } from 'react';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [montrerMdp, setMontrerMdp] = useState(false);
  const [aideOuverte, setAideOuverte] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError('');
    setLoading(true);
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (authError) {
        setError(
          authError.message === 'Invalid login credentials'
            ? 'Email ou mot de passe incorrect.'
            : 'Erreur de connexion. Réessayez.',
        );
        return;
      }
      router.push('/chantiers');
      router.refresh();
    } catch {
      setError('Connexion impossible. Vérifiez votre réseau.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen-safe bg-background flex flex-col">
      {/* Bandeau noir + logo (parité ATG) */}
      <header className="bg-header px-5 py-4 pt-safe flex items-center justify-center">
        <Image src="/logo-mtc37.png" alt="MTC" width={129} height={50} priority className="h-10 w-auto" />
      </header>

      <div className="flex-1 flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm">
          <div className="text-center mb-6">
            <h1 className="text-xl font-semibold text-foreground">Votre Système 30 Secondes</h1>
            <p className="mt-1 text-sm text-gray-500">par IONNYX</p>
          </div>

          <form onSubmit={handleSubmit} className="bg-white border border-border rounded-2xl p-5 shadow-sm">
            <label htmlFor="email" className="block text-sm font-medium text-foreground mb-2">
              Adresse e-mail
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
              autoFocus
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError('');
              }}
              className="input-ionnyx w-full"
              placeholder="vous@exemple.fr"
              aria-invalid={error ? true : undefined}
            />

            <label htmlFor="password" className="block text-sm font-medium text-foreground mb-2 mt-4">
              Mot de passe d&apos;accès
            </label>
            <div className="relative">
              <input
                id="password"
                name="password"
                type={montrerMdp ? 'text' : 'password'}
                autoComplete="current-password"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="go"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError('');
                }}
                className="input-ionnyx w-full pr-20"
                placeholder="••••••••"
                aria-invalid={error ? true : undefined}
              />
              <button
                type="button"
                onClick={() => setMontrerMdp((v) => !v)}
                aria-label={montrerMdp ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                aria-pressed={montrerMdp}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-sm font-medium text-gray-500 hover:text-foreground"
              >
                {montrerMdp ? 'Masquer' : 'Afficher'}
              </button>
            </div>

            {error && (
              <p className="mt-3 text-sm text-red-600" role="alert">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || email.length === 0 || password.length === 0}
              className="btn-primary w-full mt-4 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Connexion…' : 'Se connecter'}
            </button>

            <button
              type="button"
              onClick={() => setAideOuverte((v) => !v)}
              className="mt-3 w-full text-center text-xs text-gray-500 hover:text-foreground underline"
            >
              Mot de passe oublié ?
            </button>
            {aideOuverte && (
              <div className="mt-3 text-center">
                <p className="text-xs text-gray-500">
                  Vos identifiants vous ont été remis par IONNYX. Contactez-nous :
                </p>
                <div className="mt-2 flex items-center justify-center gap-2">
                  <a
                    href="https://wa.me/33768964531"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-gray-50"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-[#25D366]" aria-hidden="true">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.71.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413" />
                    </svg>
                    WhatsApp
                  </a>
                  <a
                    href="mailto:julien@ionnyx.fr"
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-gray-50"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8" aria-hidden="true">
                      <rect x="3" y="5" width="18" height="14" rx="2" />
                      <path d="m3 7 9 6 9-6" />
                    </svg>
                    E-mail
                  </a>
                </div>
              </div>
            )}
          </form>

          <p className="mt-6 text-center text-xs text-gray-400">Accès réservé</p>
        </div>
      </div>
    </main>
  );
}
