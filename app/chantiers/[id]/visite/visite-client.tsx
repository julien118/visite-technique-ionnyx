'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Chantier, CaptureItem as CaptureItemType } from '@/lib/types';
import { compressImage } from '@/lib/utils';
import AudioRecorder from '@/components/AudioRecorder';
import PhotoCapture from '@/components/PhotoCapture';
import CaptureItemComponent from '@/components/CaptureItem';
import AssistantTicket from '@/components/AssistantTicket';

interface VisiteClientProps {
  chantier: Chantier;
  initialItems: CaptureItemType[];
  userId: string;
}

interface DisplayGroup {
  photo: CaptureItemType;
  linkedVocal: CaptureItemType | null;
}

function buildDisplayGroups(items: CaptureItemType[]): (CaptureItemType | DisplayGroup)[] {
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
    if (linkedVocalIds.has(item.id)) continue;

    if (item.type === 'photo' && photoToVocal.has(item.id)) {
      result.push({ photo: item, linkedVocal: photoToVocal.get(item.id)! });
    } else {
      result.push(item);
    }
  }

  return result;
}

function isDisplayGroup(item: CaptureItemType | DisplayGroup): item is DisplayGroup {
  return 'photo' in item && 'linkedVocal' in item;
}

// Upload avec retry (3 tentatives, backoff exponentiel)
async function uploadWithRetry(
  supabase: ReturnType<typeof createClient>,
  bucket: string,
  fileName: string,
  blob: Blob,
  contentType: string,
  maxRetries = 3
): Promise<void> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const { error } = await supabase.storage
      .from(bucket)
      .upload(fileName, blob, { contentType });

    if (!error) return;

    console.warn(`Upload ${bucket}/${fileName} — tentative ${attempt + 1}/${maxRetries} échouée:`, error.message);

    if (attempt < maxRetries - 1) {
      const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
      await new Promise((r) => setTimeout(r, delay));
    } else {
      throw error;
    }
  }
}

export default function VisiteClient({ chantier, initialItems, userId }: VisiteClientProps) {
  const router = useRouter();
  const supabase = createClient();
  const [items, setItems] = useState<CaptureItemType[]>(initialItems);
  const [processing, setProcessing] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);

  const [lastPhotoItem, setLastPhotoItem] = useState<CaptureItemType | null>(null);
  const [lastPhotoTimestamp, setLastPhotoTimestamp] = useState<number>(0);
  const [describeCountdown, setDescribeCountdown] = useState(0);
  const describeTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const showDescribeButton = describeCountdown > 0 && !isRecording && !processing;

  const photoCount = items.filter((i) => i.type === 'photo').length;
  const vocalCount = items.filter((i) => i.type === 'vocal').length;
  const nextPosition = items.length > 0 ? Math.max(...items.map((i) => i.position)) + 1 : 1;
  const displayGroups = buildDisplayGroups(items);

  // Scroll vers le bas — cible directement scrollTop du conteneur (fiable iOS Safari)
  const scrollToBottom = useCallback((force = false) => {
    if (!force && !isNearBottomRef.current) return;
    setTimeout(() => {
      const el = mainRef.current;
      if (el) {
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      }
    }, 120);
  }, []);

  // Détecter si l'utilisateur est près du bas
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;

    function handleScroll() {
      if (!el) return;
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      isNearBottomRef.current = distanceFromBottom < 150;
    }

    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, []);

  // Auto-scroll quand un nouvel item est ajouté
  useEffect(() => {
    scrollToBottom();
  }, [items.length, scrollToBottom]);

  useEffect(() => {
    return () => {
      if (describeTimerRef.current) clearTimeout(describeTimerRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, []);

  function startDescribeCountdown(photoItem: CaptureItemType) {
    if (describeTimerRef.current) clearTimeout(describeTimerRef.current);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);

    setLastPhotoItem(photoItem);
    setLastPhotoTimestamp(Date.now());
    setDescribeCountdown(10);

    countdownIntervalRef.current = setInterval(() => {
      setDescribeCountdown((prev) => {
        if (prev <= 1) {
          if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    describeTimerRef.current = setTimeout(() => {
      setDescribeCountdown(0);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    }, 10000);
  }

  function cancelDescribeMode() {
    if (describeTimerRef.current) clearTimeout(describeTimerRef.current);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    setDescribeCountdown(0);
    setLastPhotoItem(null);
    setLastPhotoTimestamp(0);
  }

  function shouldLinkToPhoto(): CaptureItemType | null {
    if (!lastPhotoItem) return null;
    const elapsed = Date.now() - lastPhotoTimestamp;
    if (elapsed <= 30000 || describeCountdown > 0) {
      return lastPhotoItem;
    }
    return null;
  }

  async function handleRecordingComplete(audioBlob: Blob) {
    setProcessing(true);
    const linkedPhoto = shouldLinkToPhoto();
    cancelDescribeMode();

    try {
      const fileName = `${userId}/${chantier.id}/${Date.now()}.webm`;
      // Le blob ne monte QU'UNE FOIS sur la 4G (vers Storage). La transcription
      // relit ensuite le fichier côté serveur ({ path }) au lieu de faire
      // re-payer l'uplink au client une seconde fois.
      await uploadWithRetry(supabase, 'audio', fileName, audioBlob, 'audio/webm');

      // Transcription lancée SANS attendre l'insert : les deux tournent en
      // parallèle — l'item s'affiche dès l'insert, le texte arrive ensuite.
      const transcribePromise = fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: fileName }),
      });
      // Évite une unhandled rejection si l'insert échoue avant l'await.
      transcribePromise.catch(() => {});

      // L'audio n'est jamais rejoué dans l'app (seule la transcription sert) : on
      // stocke le CHEMIN storage plutôt qu'un lien signé 1 an. Plus aucun lien
      // longue durée à fuiter. Le bucket 'audio' reste privé ; si un jour on rejoue
      // l'audio, on générera un lien signé court à la volée côté serveur (RLS).
      const insertData: Record<string, unknown> = {
        chantier_id: chantier.id,
        type: 'vocal',
        position: nextPosition,
        audio_url: fileName,
        transcription: null,
      };

      if (linkedPhoto) {
        insertData.linked_photo_id = linkedPhoto.id;
      }

      const { data: newItem, error: insertError } = await supabase
        .from('capture_items')
        .insert(insertData)
        .select()
        .single();

      if (insertError) throw insertError;

      const captureItem = newItem as CaptureItemType;
      setItems((prev) => [...prev, captureItem]);
      scrollToBottom(true);

      const transcribeResponse = await transcribePromise;

      if (!transcribeResponse.ok) throw new Error('Erreur transcription');

      const { text } = await transcribeResponse.json();

      await supabase
        .from('capture_items')
        .update({ transcription: text })
        .eq('id', captureItem.id);

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

  async function handlePhotoTaken(file: File) {
    setProcessing(true);
    cancelDescribeMode();

    try {
      const compressedBlob = await compressImage(file);

      const fileName = `${userId}/${chantier.id}/${Date.now()}.jpg`;

      // L'URL publique est déterministe (dérivée du chemin, aucun aller-retour
      // réseau) : l'insert DB peut donc partir EN MÊME TEMPS que l'upload du
      // fichier au lieu d'attendre sa fin.
      const { data: urlData } = supabase.storage
        .from('photos')
        .getPublicUrl(fileName);

      const photoUrl = urlData.publicUrl;

      const [uploadRes, insertRes] = await Promise.allSettled([
        uploadWithRetry(supabase, 'photos', fileName, compressedBlob, 'image/jpeg'),
        supabase
          .from('capture_items')
          .insert({
            chantier_id: chantier.id,
            type: 'photo',
            position: nextPosition,
            photo_url: photoUrl,
          })
          .select()
          .single(),
      ]);

      const insertOk = insertRes.status === 'fulfilled' && !insertRes.value.error;
      const newItem = insertOk ? insertRes.value.data : null;

      if (uploadRes.status === 'rejected') {
        // L'upload a définitivement échoué (3 tentatives) : on retire l'item
        // éventuellement inséré pour ne pas laisser une photo sans fichier.
        if (newItem) {
          await supabase.from('capture_items').delete().eq('id', newItem.id);
        }
        throw uploadRes.reason;
      }

      if (!insertOk) {
        throw insertRes.status === 'fulfilled' ? insertRes.value.error : insertRes.reason;
      }

      const photoItem = newItem as CaptureItemType;
      setItems((prev) => [...prev, photoItem]);
      scrollToBottom(true);

      startDescribeCountdown(photoItem);
    } catch (err) {
      console.error('Erreur photo:', err);
      alert('Erreur lors de la prise de photo. Réessayez.');
    } finally {
      setProcessing(false);
    }
  }

  async function handleDelete(itemId: string) {
    const item = items.find((i) => i.id === itemId);
    if (!item) return;

    try {
      const { error } = await supabase
        .from('capture_items')
        .delete()
        .eq('id', itemId);

      if (error) throw error;

      setItems((prev) =>
        prev
          .filter((i) => i.id !== itemId)
          .map((i) =>
            i.linked_photo_id === itemId ? { ...i, linked_photo_id: null } : i
          )
      );

      if (lastPhotoItem?.id === itemId) {
        cancelDescribeMode();
      }
    } catch (err) {
      console.error('Erreur suppression:', err);
      alert('Erreur lors de la suppression.');
    }
  }

  async function handleDeleteGroup(photoId: string, vocalId: string) {
    try {
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

  function handleTranscriptionUpdate(itemId: string, text: string) {
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, transcription: text } : item
      )
    );
  }

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
    <div
      className="fixed inset-0 flex flex-col overflow-hidden"
      style={{ background: 'linear-gradient(180deg, #F8FAFC 0%, #F0FDF4 100%)' }}
    >
      {/* HEADER — ne scrolle jamais. Bannière noire (parité ATG) : retour →
          fiche chantier, nom client + compteurs, « Terminer », « ? ». */}
      <header className="shrink-0 bg-header border-b border-white/10 px-5 py-4 pt-safe z-50">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <button
            onClick={() => router.push(`/chantiers/${chantier.id}`)}
            aria-label="Retour"
            className="flex h-10 w-10 -ml-2 items-center justify-center rounded-lg text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-semibold text-white truncate">{chantier.client_prenom} {chantier.client_nom}</h1>
            {isRecording ? (
              <div className="flex items-center gap-2 mt-0.5">
                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                <span className="text-xs text-red-400 font-medium">Enregistrement en cours…</span>
              </div>
            ) : (
              <p className="text-xs text-gray-300 mt-0.5">
                {items.length} élément{items.length !== 1 ? 's' : ''} — {photoCount} photo{photoCount !== 1 ? 's' : ''}, {vocalCount} {vocalCount <= 1 ? 'vocal' : 'vocaux'}
              </p>
            )}
          </div>
          <button
            onClick={() => setShowEndConfirm(true)}
            className="inline-flex items-center justify-center rounded-xl text-sm px-4 py-2 border border-white/30 text-white hover:bg-white/10 transition-colors whitespace-nowrap"
          >
            Terminer
          </button>
          <AssistantTicket className="shrink-0" />
        </div>
      </header>

      {/* Timeline */}
      {/* FEED — seule zone scrollable */}
      <div
        ref={mainRef}
        className="flex-1 overflow-y-auto overflow-x-hidden"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        <div className="max-w-lg mx-auto w-full px-5 py-4 pb-4">
        {items.length === 0 && !processing ? (
          <div className="text-center py-16">
            <div className="inline-flex items-center justify-center gap-3 mb-6">
              <div className="w-14 h-14 bg-emerald-50 rounded-full flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </div>
              <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
            </div>
            <p className="text-gray-900 text-lg font-medium">Commencez par prendre une photo ou faire une observation vocale</p>
            <p className="text-gray-400 text-sm mt-2 max-w-xs mx-auto">
              Alternez librement entre photos et vocaux, le rapport sera structuré automatiquement
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {displayGroups.map((group, i) => {
              if (isDisplayGroup(group)) {
                return (
                  <div key={group.photo.id} className="animate-card-appear" style={{ animationDelay: `${i * 60}ms` }}>
                    <CaptureItemComponent
                      item={group.photo}
                      linkedVocal={group.linkedVocal}
                      onDelete={handleDelete}
                      onDeleteGroup={handleDeleteGroup}
                      onTranscriptionUpdate={handleTranscriptionUpdate}
                    />
                  </div>
                );
              } else {
                return (
                  <div key={group.id} className="animate-card-appear" style={{ animationDelay: `${i * 60}ms` }}>
                    <CaptureItemComponent
                      item={group}
                      onDelete={handleDelete}
                      onTranscriptionUpdate={handleTranscriptionUpdate}
                    />
                  </div>
                );
              }
            })}
          </div>
        )}

        {processing && (
          <div className="flex items-center gap-2 text-gray-400 mt-3 px-2">
            <div className="w-4 h-4 border-2 border-gray-300 border-t-[#1A1A1A] rounded-full animate-spin" />
            Traitement en cours…
          </div>
        )}

        </div>
      </div>

      {/* BARRE ACTIONS — ne scrolle jamais */}
      <div
        className="shrink-0 bg-white px-5 py-4 z-50"
        style={{
          boxShadow: '0 -4px 20px rgba(0,0,0,0.06)',
          paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
        }}
      >
        <div className="max-w-lg mx-auto">
          {showDescribeButton ? (
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
                  className="flex-1 h-12 btn-tertiary rounded-xl font-medium text-sm transition-all"
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
            <div className="flex gap-3">
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

      {/* Modal "Terminer la visite" */}
      {showEndConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center">
          <div className="bg-white w-full max-w-lg rounded-t-2xl sm:rounded-2xl p-6 shadow-2xl animate-scale-in">
            <h2 className="text-lg font-bold text-gray-900 mb-2">Terminer la visite ?</h2>
            <p className="text-sm text-gray-600 mb-1">
              Vous avez capté <span className="font-semibold text-gray-900">{photoCount} photo{photoCount !== 1 ? 's' : ''}</span> et <span className="font-semibold text-gray-900">{vocalCount} observation{vocalCount !== 1 ? 's' : ''} vocale{vocalCount !== 1 ? 's' : ''}</span>.
            </p>
            <p className="text-xs text-gray-400 mb-6">
              Vous pourrez revenir ajouter des éléments si besoin.
            </p>
            <div className="space-y-3">
              <button
                onClick={handleEndVisit}
                className="w-full btn-primary text-lg py-4"
              >
                Générer le rapport
              </button>
              <button
                onClick={() => setShowEndConfirm(false)}
                className="w-full h-12 bg-[#F3F4F6] text-gray-500 font-medium rounded-xl active:bg-gray-200 transition-colors"
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
