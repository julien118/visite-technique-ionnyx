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

export default function VisiteClient({ chantier, initialItems, userId }: VisiteClientProps) {
  const router = useRouter();
  const supabase = createClient();
  const [items, setItems] = useState<CaptureItemType[]>(initialItems);
  const [processing, setProcessing] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

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

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }, []);

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
    setDescribeCountdown(8);

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
    }, 8000);
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
      const { error: uploadError } = await supabase.storage
        .from('audio')
        .upload(fileName, audioBlob, { contentType: 'audio/webm' });

      if (uploadError) throw uploadError;

      const { data: urlData } = await supabase.storage
        .from('audio')
        .createSignedUrl(fileName, 60 * 60 * 24 * 365);

      const audioUrl = urlData?.signedUrl || '';

      const insertData: Record<string, unknown> = {
        chantier_id: chantier.id,
        type: 'vocal',
        position: nextPosition,
        audio_url: audioUrl,
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

      const formData = new FormData();
      formData.append('file', audioBlob, 'audio.webm');

      const transcribeResponse = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      });

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
      const { error: uploadError } = await supabase.storage
        .from('photos')
        .upload(fileName, compressedBlob, { contentType: 'image/jpeg' });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('photos')
        .getPublicUrl(fileName);

      const photoUrl = urlData.publicUrl;

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

      const photoItem = newItem as CaptureItemType;
      setItems((prev) => [...prev, photoItem]);

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
    <div className="min-h-screen flex flex-col" style={{ background: 'linear-gradient(180deg, #F8FAFC 0%, #F0FDF4 100%)' }}>
      {/* Header */}
      <header className="bg-[#1A1A1A] text-white px-4 py-3 sticky top-0 z-20">
        <div className="max-w-lg mx-auto">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h1 className="font-bold truncate">
                {chantier.client_prenom} {chantier.client_nom}
              </h1>
              {chantier.client_adresse && (
                <p className="text-sm text-gray-400 truncate">{chantier.client_adresse}</p>
              )}
            </div>
            <button
              onClick={() => setShowEndConfirm(true)}
              className="text-sm bg-white text-[#1A1A1A] px-3 py-1.5 rounded-xl font-medium border border-[#E5E7EB] active:bg-gray-100 transition-colors whitespace-nowrap"
            >
              Terminer
            </button>
          </div>
          {isRecording ? (
            <div className="flex items-center gap-2 mt-1">
              <span className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
              <span className="text-sm text-red-400 font-medium">Enregistrement en cours…</span>
            </div>
          ) : (
            <p className="text-xs text-emerald-400 mt-1">
              {items.length} élément{items.length !== 1 ? 's' : ''} — {photoCount} photo{photoCount !== 1 ? 's' : ''}, {vocalCount} {vocalCount <= 1 ? 'vocal' : 'vocaux'}
            </p>
          )}
        </div>
      </header>

      {/* Timeline */}
      <main className="flex-1 max-w-lg mx-auto w-full px-4 py-4 pb-28 overflow-y-auto">
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

        <div ref={bottomRef} />
      </main>

      {/* Barre d'action */}
      <div
        className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-md px-4 py-4 z-20"
        style={{
          boxShadow: '0 -4px 20px rgba(0,0,0,0.06)',
          paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
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
            <h2 className="text-xl font-bold text-gray-900 mb-2">Terminer la visite ?</h2>
            <p className="text-sm text-gray-600 mb-1">
              Vous avez capté <span className="font-semibold text-gray-900">{photoCount} photo{photoCount !== 1 ? 's' : ''}</span> et <span className="font-semibold text-gray-900">{vocalCount} observation{vocalCount !== 1 ? 's' : ''} vocale{vocalCount !== 1 ? 's' : ''}</span>.
            </p>
            <p className="text-xs text-gray-400 mb-6">
              Vous pourrez revenir ajouter des éléments si besoin.
            </p>
            <div className="space-y-3">
              <button
                onClick={handleEndVisit}
                className="w-full h-14 btn-primary font-bold text-lg rounded-xl transition-transform"
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
