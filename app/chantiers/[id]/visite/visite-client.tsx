'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Chantier, CaptureItem as CaptureItemType } from '@/lib/types';
import { compressImage } from '@/lib/utils';
import AudioRecorder from '@/components/AudioRecorder';
import PhotoCapture from '@/components/PhotoCapture';
import CaptureItemComponent from '@/components/CaptureItem';

interface VisiteClientProps {
  chantier: Chantier;
  initialItems: CaptureItemType[];
  userId: string;
}

// Grouper les items : photo + vocal lié = un seul groupe
interface DisplayGroup {
  photo: CaptureItemType;
  linkedVocal: CaptureItemType | null;
}

function buildDisplayGroups(items: CaptureItemType[]): (CaptureItemType | DisplayGroup)[] {
  // Trouver les IDs des vocaux liés à une photo
  const linkedVocalIds = new Set<string>();
  const photoToVocal = new Map<string, CaptureItemType>();

  for (const item of items) {
    if (item.type === 'vocal' && item.linked_photo_id) {
      linkedVocalIds.add(item.id);
      photoToVocal.set(item.linked_photo_id, item);
    }
  }

  const result: (CaptureItemType | DisplayGroup)[] = [];

  for (const item of items) {
    // Skip les vocaux liés (ils seront affichés dans la carte photo)
    if (linkedVocalIds.has(item.id)) continue;

    if (item.type === 'photo' && photoToVocal.has(item.id)) {
      // Photo avec vocal lié → carte combinée
      result.push({
        photo: item,
        linkedVocal: photoToVocal.get(item.id)!,
      });
    } else {
      // Item solo (photo sans description ou vocal indépendant)
      result.push(item);
    }
  }

  return result;
}

function isDisplayGroup(item: CaptureItemType | DisplayGroup): item is DisplayGroup {
  return 'photo' in item && 'linkedVocal' in item;
}

export default function VisiteClient({ chantier, initialItems, userId }: VisiteClientProps) {
  const router = useRouter();
  const supabase = createClient();
  const [items, setItems] = useState<CaptureItemType[]>(initialItems);
  const [processing, setProcessing] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // État pour la liaison photo/vocal
  const [lastPhotoItem, setLastPhotoItem] = useState<CaptureItemType | null>(null);
  const [lastPhotoTimestamp, setLastPhotoTimestamp] = useState<number>(0);
  const [describeCountdown, setDescribeCountdown] = useState(0);
  const describeTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Le bouton "Décrire cette photo" est visible si countdown > 0
  const showDescribeButton = describeCountdown > 0 && !isRecording && !processing;

  // Compteurs
  const photoCount = items.filter((i) => i.type === 'photo').length;
  const vocalCount = items.filter((i) => i.type === 'vocal').length;

  // Prochaine position dans le fil
  const nextPosition = items.length > 0 ? Math.max(...items.map((i) => i.position)) + 1 : 1;

  // Groupes pour l'affichage
  const displayGroups = buildDisplayGroups(items);

  // Scroll vers le bas quand un nouvel élément est ajouté
  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [items.length, scrollToBottom]);

  // Cleanup timers au démontage
  useEffect(() => {
    return () => {
      if (describeTimerRef.current) clearTimeout(describeTimerRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, []);

  // Démarrer le compte à rebours de 8s après une photo
  function startDescribeCountdown(photoItem: CaptureItemType) {
    // Nettoyer les timers précédents
    if (describeTimerRef.current) clearTimeout(describeTimerRef.current);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);

    setLastPhotoItem(photoItem);
    setLastPhotoTimestamp(Date.now());
    setDescribeCountdown(8);

    // Décompte chaque seconde
    countdownIntervalRef.current = setInterval(() => {
      setDescribeCountdown((prev) => {
        if (prev <= 1) {
          if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // Arrêter après 8s
    describeTimerRef.current = setTimeout(() => {
      setDescribeCountdown(0);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    }, 8000);
  }

  // Annuler le mode description (quand l'artisan prend une nouvelle photo)
  function cancelDescribeMode() {
    if (describeTimerRef.current) clearTimeout(describeTimerRef.current);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    setDescribeCountdown(0);
    setLastPhotoItem(null);
    setLastPhotoTimestamp(0);
  }

  // Vérifier si le vocal doit être lié à la dernière photo
  function shouldLinkToPhoto(): CaptureItemType | null {
    if (!lastPhotoItem) return null;
    const elapsed = Date.now() - lastPhotoTimestamp;
    // Lier si dans les 30 secondes ou si le bouton "Décrire" est encore visible
    if (elapsed <= 30000 || describeCountdown > 0) {
      return lastPhotoItem;
    }
    return null;
  }

  // === GESTION VOCAL ===
  async function handleRecordingComplete(audioBlob: Blob) {
    setProcessing(true);

    // Déterminer si ce vocal est lié à une photo
    const linkedPhoto = shouldLinkToPhoto();

    // Annuler le mode description
    cancelDescribeMode();

    try {
      // 1. Upload audio vers Supabase Storage
      const fileName = `${userId}/${chantier.id}/${Date.now()}.webm`;
      const { error: uploadError } = await supabase.storage
        .from('audio')
        .upload(fileName, audioBlob, { contentType: 'audio/webm' });

      if (uploadError) throw uploadError;

      // Récupérer l'URL signée (fichier privé)
      const { data: urlData } = await supabase.storage
        .from('audio')
        .createSignedUrl(fileName, 60 * 60 * 24 * 365); // 1 an

      const audioUrl = urlData?.signedUrl || '';

      // 2. Créer le capture_item avec transcription null (en attente)
      const insertData: Record<string, unknown> = {
        chantier_id: chantier.id,
        type: 'vocal',
        position: nextPosition,
        audio_url: audioUrl,
        transcription: null,
      };

      // Lier à la photo si applicable
      if (linkedPhoto) {
        insertData.linked_photo_id = linkedPhoto.id;
      }

      const { data: newItem, error: insertError } = await supabase
        .from('capture_items')
        .insert(insertData)
        .select()
        .single();

      if (insertError) throw insertError;

      // Ajouter au fil immédiatement (avec transcription null = loader)
      const captureItem = newItem as CaptureItemType;
      setItems((prev) => [...prev, captureItem]);

      // 3. Appeler l'API de transcription
      const formData = new FormData();
      formData.append('file', audioBlob, 'audio.webm');

      const transcribeResponse = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      });

      if (!transcribeResponse.ok) throw new Error('Erreur transcription');

      const { text } = await transcribeResponse.json();

      // 4. Mettre à jour la transcription en BDD
      await supabase
        .from('capture_items')
        .update({ transcription: text })
        .eq('id', captureItem.id);

      // 5. Mettre à jour le fil
      setItems((prev) =>
        prev.map((item) =>
          item.id === captureItem.id ? { ...item, transcription: text } : item
        )
      );
    } catch (err) {
      console.error('Erreur vocal:', err);
      alert('Erreur lors de l\'enregistrement vocal. Réessayez.');
    } finally {
      setProcessing(false);
    }
  }

  // === GESTION PHOTO ===
  async function handlePhotoTaken(file: File) {
    setProcessing(true);

    // Si une photo précédente était en attente de description, elle reste seule
    cancelDescribeMode();

    try {
      // 1. Compresser la photo côté client
      const compressedBlob = await compressImage(file);

      // 2. Upload vers Supabase Storage (bucket public "photos")
      const fileName = `${userId}/${chantier.id}/${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('photos')
        .upload(fileName, compressedBlob, { contentType: 'image/jpeg' });

      if (uploadError) throw uploadError;

      // Récupérer l'URL publique
      const { data: urlData } = supabase.storage
        .from('photos')
        .getPublicUrl(fileName);

      const photoUrl = urlData.publicUrl;

      // 3. Créer le capture_item
      const { data: newItem, error: insertError } = await supabase
        .from('capture_items')
        .insert({
          chantier_id: chantier.id,
          type: 'photo',
          position: nextPosition,
          photo_url: photoUrl,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // 4. Ajouter au fil
      const photoItem = newItem as CaptureItemType;
      setItems((prev) => [...prev, photoItem]);

      // 5. Démarrer le compte à rebours pour "Décrire cette photo"
      startDescribeCountdown(photoItem);
    } catch (err) {
      console.error('Erreur photo:', err);
      alert('Erreur lors de la prise de photo. Réessayez.');
    } finally {
      setProcessing(false);
    }
  }

  // === SUPPRESSION ===
  async function handleDelete(itemId: string) {
    const item = items.find((i) => i.id === itemId);
    if (!item) return;

    try {
      // Supprimer de la BDD
      const { error } = await supabase
        .from('capture_items')
        .delete()
        .eq('id', itemId);

      if (error) throw error;

      // Si c'est une photo qui est supprimée, les vocaux liés deviennent indépendants
      // grâce à ON DELETE SET NULL en base. On met à jour le state local aussi.
      setItems((prev) =>
        prev
          .filter((i) => i.id !== itemId)
          .map((i) =>
            i.linked_photo_id === itemId ? { ...i, linked_photo_id: null } : i
          )
      );

      // Si on supprime la photo en attente de description, annuler le mode
      if (lastPhotoItem?.id === itemId) {
        cancelDescribeMode();
      }
    } catch (err) {
      console.error('Erreur suppression:', err);
      alert('Erreur lors de la suppression.');
    }
  }

  // === SUPPRESSION D'UN GROUPE (photo + vocal lié) ===
  async function handleDeleteGroup(photoId: string, vocalId: string) {
    try {
      // Supprimer les deux items
      const { error: err1 } = await supabase
        .from('capture_items')
        .delete()
        .eq('id', vocalId);

      if (err1) throw err1;

      const { error: err2 } = await supabase
        .from('capture_items')
        .delete()
        .eq('id', photoId);

      if (err2) throw err2;

      setItems((prev) => prev.filter((i) => i.id !== photoId && i.id !== vocalId));
    } catch (err) {
      console.error('Erreur suppression groupe:', err);
      alert('Erreur lors de la suppression.');
    }
  }

  // === MISE À JOUR TRANSCRIPTION ===
  function handleTranscriptionUpdate(itemId: string, text: string) {
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, transcription: text } : item
      )
    );
  }

  // === TERMINER LA VISITE ===
  async function handleEndVisit() {
    try {
      await supabase
        .from('chantiers')
        .update({ statut: 'termine' })
        .eq('id', chantier.id);

      router.push(`/chantiers/${chantier.id}/rapport`);
    } catch (err) {
      console.error('Erreur fin visite:', err);
      alert('Erreur. Réessayez.');
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header fixe */}
      <header className="bg-[#1E3A5F] text-white px-4 py-3 sticky top-0 z-20">
        <div className="max-w-lg mx-auto">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h1 className="font-bold truncate">
                {chantier.client_prenom} {chantier.client_nom}
              </h1>
              {chantier.client_adresse && (
                <p className="text-sm text-blue-200 truncate">{chantier.client_adresse}</p>
              )}
            </div>
            <button
              onClick={() => setShowEndConfirm(true)}
              className="text-sm bg-white/10 px-3 py-1.5 rounded-lg active:bg-white/20 transition-colors whitespace-nowrap"
            >
              Terminer
            </button>
          </div>
          {/* Compteur + indicateur enregistrement */}
          {isRecording ? (
            <div className="flex items-center gap-2 mt-1">
              <span className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
              <span className="text-xs text-red-300 font-medium">Enregistrement en cours…</span>
            </div>
          ) : (
            <p className="text-xs text-blue-200 mt-1">
              {items.length} élément{items.length !== 1 ? 's' : ''} — {photoCount} photo{photoCount !== 1 ? 's' : ''}, {vocalCount} vocal{vocalCount !== 1 ? 'aux' : ''}
            </p>
          )}
        </div>
      </header>

      {/* Fil de captation (timeline) */}
      <main className="flex-1 max-w-lg mx-auto w-full px-4 py-4 pb-28 overflow-y-auto">
        {items.length === 0 && !processing ? (
          <div className="text-center py-16">
            <div className="inline-flex items-center justify-center gap-3 mb-6">
              <div className="w-14 h-14 bg-orange-100 rounded-full flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7 text-[#F97316]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </div>
              <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7 text-[#1E3A5F]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
            </div>
            <p className="text-gray-700 text-lg font-medium">Commencez par prendre une photo ou faire une observation vocale</p>
            <p className="text-gray-400 text-sm mt-2 max-w-xs mx-auto">
              Alternez librement entre photos et vocaux, le rapport sera structuré automatiquement
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {displayGroups.map((group) => {
              if (isDisplayGroup(group)) {
                // Carte combinée photo + vocal
                return (
                  <CaptureItemComponent
                    key={group.photo.id}
                    item={group.photo}
                    linkedVocal={group.linkedVocal}
                    onDelete={handleDelete}
                    onDeleteGroup={handleDeleteGroup}
                    onTranscriptionUpdate={handleTranscriptionUpdate}
                  />
                );
              } else {
                // Carte solo
                return (
                  <CaptureItemComponent
                    key={group.id}
                    item={group}
                    onDelete={handleDelete}
                    onTranscriptionUpdate={handleTranscriptionUpdate}
                  />
                );
              }
            })}
          </div>
        )}

        {/* Indicateur de traitement */}
        {processing && (
          <div className="flex items-center gap-2 text-gray-400 mt-3 px-2">
            <div className="w-4 h-4 border-2 border-gray-300 border-t-[#1E3A5F] rounded-full animate-spin" />
            Traitement en cours…
          </div>
        )}

        <div ref={bottomRef} />
      </main>

      {/* Barre d'action fixe en bas */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3 z-20">
        <div className="max-w-lg mx-auto">
          {showDescribeButton ? (
            // Mode "Décrire cette photo" — bouton vert pleine largeur
            <div className="space-y-2">
              <AudioRecorder
                onRecordingComplete={handleRecordingComplete}
                disabled={processing}
                onRecordingChange={setIsRecording}
                variant="describe"
                countdown={describeCountdown}
              />
              <div className="flex gap-3">
                <button
                  onClick={cancelDescribeMode}
                  className="flex-1 h-12 bg-gray-100 text-gray-600 rounded-xl font-medium text-sm active:bg-gray-200 transition-colors"
                >
                  Passer
                </button>
                <PhotoCapture
                  onPhotoTaken={handlePhotoTaken}
                  disabled={processing}
                  compact
                />
              </div>
            </div>
          ) : (
            // Mode normal — Parler + Photo
            <div className="flex gap-4">
              <AudioRecorder
                onRecordingComplete={handleRecordingComplete}
                disabled={processing}
                onRecordingChange={setIsRecording}
              />
              <PhotoCapture
                onPhotoTaken={handlePhotoTaken}
                disabled={processing}
              />
            </div>
          )}
        </div>
      </div>

      {/* Modal de confirmation "Terminer la visite" */}
      {showEndConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center">
          <div className="bg-white w-full max-w-lg rounded-t-2xl sm:rounded-2xl p-6 animate-slide-up">
            <h2 className="text-lg font-bold text-gray-900 mb-2">Terminer la visite ?</h2>
            <p className="text-gray-500 mb-1">
              Vous avez capté <strong>{photoCount} photo{photoCount !== 1 ? 's' : ''}</strong> et <strong>{vocalCount} observation{vocalCount !== 1 ? 's' : ''} vocale{vocalCount !== 1 ? 's' : ''}</strong>.
            </p>
            <p className="text-sm text-gray-400 mb-6">
              Vous pourrez revenir ajouter des éléments si besoin.
            </p>
            <div className="space-y-3">
              <button
                onClick={handleEndVisit}
                className="w-full h-14 bg-[#F97316] text-white font-bold text-lg rounded-xl active:bg-orange-600 transition-colors"
              >
                Générer le rapport
              </button>
              <button
                onClick={() => setShowEndConfirm(false)}
                className="w-full h-12 bg-gray-100 text-gray-700 font-medium rounded-xl active:bg-gray-200 transition-colors"
              >
                Revenir à la visite
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
