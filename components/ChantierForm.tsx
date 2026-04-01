'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Chantier, ChantierStatut } from '@/lib/types';
import AddressAutocomplete from './AddressAutocomplete';
import DeleteChantierModal from './DeleteChantierModal';

interface ChantierFormProps {
  chantier?: Chantier;
  userId: string;
}

// Champs du formulaire (sans id, user_id, timestamps, statut)
interface FormData {
  client_prenom: string;
  client_nom: string;
  client_adresse: string;
  client_telephone: string;
  client_email: string;
  date_visite: string;
  objet_travaux: string;
  provenance: string;
  type_chantier: 'direct' | 'sous_traitance';
}

function toLocalDatetimeValue(isoString: string): string {
  const date = new Date(isoString);
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

function getDatePart(datetimeValue: string): string {
  return datetimeValue.slice(0, 10);
}

function getTimePart(datetimeValue: string): string {
  return datetimeValue.slice(11, 16);
}

export default function ChantierForm({ chantier, userId }: ChantierFormProps) {
  const router = useRouter();
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [chantierId, setChantierId] = useState<string | null>(chantier?.id || null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const isNew = !chantier;

  const [form, setForm] = useState<FormData>({
    client_prenom: chantier?.client_prenom || '',
    client_nom: chantier?.client_nom || '',
    client_adresse: chantier?.client_adresse || '',
    client_telephone: chantier?.client_telephone || '',
    client_email: chantier?.client_email || '',
    date_visite: chantier?.date_visite
      ? toLocalDatetimeValue(chantier.date_visite)
      : toLocalDatetimeValue(new Date().toISOString()),
    objet_travaux: chantier?.objet_travaux || '',
    provenance: chantier?.provenance || '',
    type_chantier: chantier?.type_chantier || 'direct',
  });

  // Le nom du client est le minimum requis
  const canStartVisit = form.client_nom.trim().length > 0;
  const statut: ChantierStatut | undefined = chantier?.statut;

  // Sauvegarde automatique (debounce 1s)
  const saveToDb = useCallback(async (data: FormData, id: string | null) => {
    setSaving(true);
    setSaved(false);
    setError('');

    try {
      if (id) {
        // Mise à jour
        const { error: updateError } = await supabase
          .from('chantiers')
          .update({
            ...data,
            date_visite: new Date(data.date_visite).toISOString(),
          })
          .eq('id', id);

        if (updateError) throw updateError;
      } else {
        // Création
        const { data: newChantier, error: insertError } = await supabase
          .from('chantiers')
          .insert({
            ...data,
            date_visite: new Date(data.date_visite).toISOString(),
            user_id: userId,
            statut: 'planifie',
          })
          .select()
          .single();

        if (insertError) throw insertError;
        if (newChantier) {
          setChantierId(newChantier.id);
          // Remplacer l'URL sans recharger pour passer de /nouveau à /[id]
          window.history.replaceState(null, '', `/chantiers/${newChantier.id}`);
        }
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('Erreur sauvegarde:', err);
      setError('Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  }, [supabase, userId]);

  // Debounce : sauvegarde 1s après la dernière modification
  useEffect(() => {
    // Ne pas sauvegarder au premier rendu si c'est un chantier existant
    if (isNew && !chantierId && !form.client_nom.trim()) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      // Au minimum le nom doit être rempli pour sauvegarder
      if (form.client_nom.trim()) {
        saveToDb(form, chantierId);
      }
    }, 1000);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [form, chantierId, isNew, saveToDb]);

  function updateField(field: keyof FormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleStartVisit() {
    if (!chantierId) return;

    // Mettre le statut en "en_cours" puis naviguer
    try {
      await supabase
        .from('chantiers')
        .update({ statut: 'en_cours' })
        .eq('id', chantierId);
    } catch (err) {
      console.error('Erreur mise à jour statut:', err);
    }

    // Naviguer même si la mise à jour échoue
    router.push(`/chantiers/${chantierId}/visite`);
  }

  function handleResumeVisit() {
    if (!chantierId) return;
    router.push(`/chantiers/${chantierId}/visite`);
  }

  function handleViewReport() {
    if (!chantierId) return;
    router.push(`/chantiers/${chantierId}/rapport`);
  }

  async function handleDelete() {
    if (!chantierId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/chantiers/${chantierId}`, { method: 'DELETE' });
      if (res.ok) {
        router.push('/chantiers');
      }
    } catch (err) {
      console.error('Erreur suppression:', err);
    } finally {
      setDeleting(false);
    }
  }

  // Bouton d'action principal selon le statut
  function renderActionButton() {
    if (statut === 'rapport_genere') {
      return (
        <button
          onClick={handleViewReport}
          className="w-full h-14 bg-green-600 text-white font-bold text-lg rounded-xl active:bg-green-700 transition-colors flex items-center justify-center gap-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Voir le rapport
        </button>
      );
    }

    if (statut === 'en_cours' || statut === 'termine') {
      return (
        <button
          onClick={handleResumeVisit}
          className="w-full h-14 bg-[#1E3A5F] text-white font-bold text-lg rounded-xl active:bg-[#162d4a] transition-colors flex items-center justify-center gap-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Reprendre la visite
        </button>
      );
    }

    // Statut planifie ou nouveau chantier
    return (
      <button
        onClick={handleStartVisit}
        disabled={!canStartVisit || !chantierId}
        className="w-full h-14 bg-[#F97316] text-white font-bold text-lg rounded-xl active:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
        Démarrer la visite
      </button>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-[#1E3A5F] text-white px-4 py-4 sticky top-0 z-10">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <button
            onClick={() => router.push('/chantiers')}
            className="flex items-center justify-center w-10 h-10 -ml-2 rounded-lg active:bg-white/10 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold truncate">
              {isNew && !chantierId ? 'Nouvelle visite' : `${form.client_prenom} ${form.client_nom}`.trim() || 'Fiche chantier'}
            </h1>
          </div>
          {/* Indicateur de sauvegarde */}
          <div className="text-sm text-blue-200">
            {saving && 'Sauvegarde…'}
            {saved && '✓ Sauvegardé'}
            {error && <span className="text-red-300">Erreur</span>}
          </div>
        </div>
      </header>

      {/* Formulaire */}
      <main className="max-w-lg mx-auto px-4 py-6 pb-28">
        <div className="space-y-6">
          {/* Prénom + Nom sur la même ligne */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Prénom client *
              </label>
              <input
                type="text"
                value={form.client_prenom}
                onChange={(e) => updateField('client_prenom', e.target.value)}
                placeholder="Jean"
                autoComplete="given-name"
                className="w-full min-h-[48px] h-12 px-4 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1E3A5F] focus:border-transparent outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Nom client *
              </label>
              <input
                type="text"
                value={form.client_nom}
                onChange={(e) => updateField('client_nom', e.target.value)}
                placeholder="Dupont"
                autoComplete="family-name"
                className="w-full min-h-[48px] h-12 px-4 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1E3A5F] focus:border-transparent outline-none"
              />
            </div>
          </div>

          {/* Adresse avec autocomplétion */}
          <AddressAutocomplete
            value={form.client_adresse}
            onChange={(value) => updateField('client_adresse', value)}
          />

          {/* Objet des travaux */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Objet des travaux
            </label>
            <textarea
              value={form.objet_travaux}
              onChange={(e) => updateField('objet_travaux', e.target.value)}
              placeholder="Ex: Ouverture mur porteur + fenêtre à boucher"
              rows={3}
              className="w-full min-h-[48px] px-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1E3A5F] focus:border-transparent outline-none resize-none"
            />
          </div>

          {/* Téléphone */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Téléphone client
            </label>
            <input
              type="tel"
              inputMode="tel"
              value={form.client_telephone}
              onChange={(e) => updateField('client_telephone', e.target.value)}
              placeholder="06 12 34 56 78"
              autoComplete="tel"
              className="w-full min-h-[48px] h-12 px-4 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1E3A5F] focus:border-transparent outline-none"
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Email client
            </label>
            <input
              type="email"
              inputMode="email"
              value={form.client_email}
              onChange={(e) => updateField('client_email', e.target.value)}
              placeholder="client@email.fr"
              autoComplete="email"
              className="w-full min-h-[48px] h-12 px-4 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1E3A5F] focus:border-transparent outline-none"
            />
          </div>

          {/* Date + Heure de visite */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Date et heure de la visite
            </label>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="date"
                value={getDatePart(form.date_visite)}
                onChange={(e) => {
                  const time = getTimePart(form.date_visite);
                  updateField('date_visite', `${e.target.value}T${time}`);
                }}
                className="w-full min-h-[48px] h-12 px-4 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1E3A5F] focus:border-transparent outline-none"
              />
              <input
                type="time"
                value={getTimePart(form.date_visite)}
                onChange={(e) => {
                  const date = getDatePart(form.date_visite);
                  updateField('date_visite', `${date}T${e.target.value}`);
                }}
                className="w-full min-h-[48px] h-12 px-4 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1E3A5F] focus:border-transparent outline-none"
              />
            </div>
          </div>

          {/* Provenance */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Provenance
            </label>
            <input
              type="text"
              value={form.provenance}
              onChange={(e) => updateField('provenance', e.target.value)}
              placeholder="Ex: BNI, Direct client, Recommandation"
              className="w-full min-h-[48px] h-12 px-4 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1E3A5F] focus:border-transparent outline-none"
            />
          </div>

          {/* Type de chantier */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Type de chantier
            </label>
            <select
              value={form.type_chantier}
              onChange={(e) => updateField('type_chantier', e.target.value)}
              className="w-full min-h-[48px] h-12 px-4 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1E3A5F] focus:border-transparent outline-none bg-white"
            >
              <option value="direct">Direct client</option>
              <option value="sous_traitance">Sous-traitance</option>
            </select>
          </div>

          {/* Bouton supprimer (uniquement pour les chantiers existants) */}
          {chantierId && (
            <button
              onClick={() => setShowDeleteModal(true)}
              className="w-full text-red-500 text-sm font-medium py-3 mt-4 active:text-red-700 transition-colors"
            >
              Supprimer ce chantier
            </button>
          )}
        </div>
      </main>

      {/* Bouton d'action fixe en bas */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-gray-50 via-gray-50 to-transparent">
        <div className="max-w-lg mx-auto">
          {renderActionButton()}
        </div>
      </div>

      {/* Modale de confirmation de suppression */}
      {showDeleteModal && (
        <DeleteChantierModal
          clientName={`${form.client_prenom} ${form.client_nom}`.trim()}
          deleting={deleting}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteModal(false)}
        />
      )}
    </div>
  );
}
