'use client';

import { useState } from 'react';

function formatEUR(n: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(
    Number.isFinite(n) ? n : 0,
  );
}
function normaliserTaux(v: number): number {
  if (Number.isNaN(v)) return 0;
  return Math.min(100, Math.max(0, Math.round(v * 10) / 10));
}

export default function BlocTotaux({
  devisId,
  totalHT,
  tvaInitial,
}: {
  devisId: string;
  totalHT: number;
  tvaInitial: number;
}) {
  const [taux, setTaux] = useState(normaliserTaux(tvaInitial));
  const [saisie, setSaisie] = useState(String(normaliserTaux(tvaInitial)));
  const [etat, setEtat] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const tva = Math.round(totalHT * (taux / 100) * 100) / 100;
  const totalTTC = Math.round((totalHT + tva) * 100) / 100;

  async function enregistrer(tauxFinal: number) {
    setEtat('saving');
    try {
      const res = await fetch('/api/devis/tva', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ devisId, tva_taux: tauxFinal }),
      });
      if (!res.ok) throw new Error('echec');
      setEtat('saved');
    } catch {
      setEtat('error');
    }
  }
  function valider() {
    const t = normaliserTaux(parseFloat(saisie.replace(',', '.')));
    setTaux(t);
    setSaisie(String(t));
    void enregistrer(t);
  }

  return (
    <div className="w-full sm:w-80 rounded-xl border border-border bg-white overflow-hidden">
      <div className="flex justify-between px-4 py-3 text-sm border-b border-border">
        <span className="text-gray-500">Total HT</span>
        <span className="font-semibold tabular-nums">{formatEUR(totalHT)}</span>
      </div>
      <div className="px-4 py-3 text-sm border-b border-border">
        <div className="flex items-center justify-between">
          <label htmlFor="tva-taux" className="flex items-center gap-1.5 text-gray-500">
            TVA
            <span className="inline-flex items-center rounded-md border border-border bg-gray-50 focus-within:border-primary">
              <input
                id="tva-taux"
                type="number"
                inputMode="decimal"
                min={0}
                max={100}
                step={0.5}
                value={saisie}
                onChange={(e) => setSaisie(e.target.value)}
                onBlur={valider}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                }}
                aria-label="Taux de TVA en pourcentage"
                className="w-14 bg-transparent px-2 py-1 text-right tabular-nums text-foreground outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
              <span className="text-gray-400 pr-1.5">%</span>
            </span>
          </label>
          <span className="tabular-nums text-gray-700">{formatEUR(tva)}</span>
        </div>
        <p className="mt-1 h-4 text-[11px] text-gray-400">
          {etat === 'saving' && 'Enregistrement du taux…'}
          {etat === 'saved' && 'Taux enregistré.'}
          {etat === 'error' && <span className="text-red-500">Échec, réessayez.</span>}
          {etat === 'idle' && 'Modifiable avant envoi (10 % par défaut).'}
        </p>
      </div>
      <div className="flex justify-between px-4 py-3 text-base bg-primary/5">
        <span className="font-semibold text-foreground">Total TTC</span>
        <span className="font-bold text-primary tabular-nums">{formatEUR(totalTTC)}</span>
      </div>
    </div>
  );
}
