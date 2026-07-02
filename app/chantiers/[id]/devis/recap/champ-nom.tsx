'use client';

import { useState } from 'react';

export default function ChampNomDevis({ devisId, nomInitial }: { devisId: string; nomInitial: string }) {
  const [nom, setNom] = useState(nomInitial);
  const [etat, setEtat] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  async function enregistrer() {
    const v = nom.trim();
    if (!v) {
      setNom(nomInitial);
      return;
    }
    if (v === nomInitial && etat === 'idle') return;
    setEtat('saving');
    try {
      const res = await fetch('/api/devis/nom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ devisId, nom: v }),
      });
      if (!res.ok) throw new Error();
      setEtat('saved');
    } catch {
      setEtat('error');
    }
  }

  return (
    <div className="rounded-xl border border-border bg-white p-4">
      <label htmlFor="nom-devis" className="block text-[11px] font-semibold text-primary uppercase tracking-wide mb-1.5">
        Nom du devis
      </label>
      <input
        id="nom-devis"
        type="text"
        value={nom}
        onChange={(e) => {
          setNom(e.target.value);
          setEtat('idle');
        }}
        onBlur={enregistrer}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        placeholder="Nom du devis…"
        className="input-ionnyx w-full text-sm"
      />
      <p className="mt-1 h-4 text-[11px] text-gray-400">
        {etat === 'saving' && 'Enregistrement…'}
        {etat === 'saved' && 'Nom enregistré.'}
        {etat === 'error' && <span className="text-red-500">Échec, réessayez.</span>}
        {etat === 'idle' && 'Modifiable — ce sera le titre du brouillon dans Costructor.'}
      </p>
    </div>
  );
}
