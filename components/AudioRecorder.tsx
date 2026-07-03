'use client';

import { useRef, useState } from 'react';

interface AudioRecorderProps {
  onRecordingComplete: (audioBlob: Blob) => void;
  disabled?: boolean;
  onRecordingChange?: (recording: boolean) => void;
  variant?: 'default' | 'describe';
  countdown?: number;
}

export default function AudioRecorder({ onRecordingComplete, disabled, onRecordingChange, variant = 'default', countdown }: AudioRecorderProps) {
  const [recording, setRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function toggleRecording() {
    if (recording) {
      mediaRecorderRef.current?.stop();
      return;
    }

    try {
      // Mono + 32 kbps : le seul consommateur est la transcription Whisper, qui
      // resample tout en 16 kHz mono — l'opus voix à 32 kbps est transparent
      // pour elle (vérifié : transcription identique au 128 kbps stéréo) mais
      // pèse ~4× moins sur la 4G de chantier. Les navigateurs qui ignorent ces
      // hints retombent sur leur défaut (comportement d'avant).
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1 },
      });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
        audioBitsPerSecond: 32000,
      });

      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setRecording(false);
        onRecordingChange?.(false);
        onRecordingComplete(audioBlob);
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setRecording(true);
      onRecordingChange?.(true);
    } catch (err) {
      console.error('Erreur accès micro:', err);
      alert('Impossible d\'accéder au microphone. Vérifiez les permissions.');
    }
  }

  // Variante "Décrire cette photo"
  if (variant === 'describe') {
    return (
      <button
        onClick={toggleRecording}
        disabled={disabled}
        className={`w-full h-14 rounded-xl font-semibold text-lg flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
          recording
            ? 'bg-red-500 text-white shadow-lg shadow-red-500/30'
            : 'btn-primary'
        }`}
        style={recording ? { animation: 'pulse-record 1.5s ease-in-out infinite' } : undefined}
      >
        {recording ? (
          <>
            <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
            Arrêter
          </>
        ) : (
          <>
            <span className="text-xl">🎙️</span>
            <span>Décrire cette photo</span>
            {countdown !== undefined && countdown > 0 && (
              <span className="ml-1 bg-white/20 text-white text-sm font-medium px-2 py-0.5 rounded-full">
                {countdown}s
              </span>
            )}
          </>
        )}
      </button>
    );
  }

  // Variante par défaut — bouton "Parler"
  return (
    <button
      onClick={toggleRecording}
      disabled={disabled}
      className={`flex-1 py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
        recording
          ? 'bg-red-500 text-white shadow-lg shadow-red-500/30'
          : 'btn-primary'
      }`}
      style={recording ? { animation: 'pulse-record 1.5s ease-in-out infinite' } : undefined}
    >
      {recording ? (
        <>
          <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
            <rect x="6" y="6" width="12" height="12" rx="2" />
          </svg>
          Arrêter
        </>
      ) : (
        <>
          <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
          Parler
        </>
      )}
    </button>
  );
}
