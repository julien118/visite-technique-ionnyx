'use client';

import { useRef, useState } from 'react';

interface AudioRecorderProps {
  onRecordingComplete: (audioBlob: Blob) => void;
  disabled?: boolean;
}

export default function AudioRecorder({ onRecordingComplete, disabled }: AudioRecorderProps) {
  const [recording, setRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function toggleRecording() {
    if (recording) {
      // Arrêter l'enregistrement
      mediaRecorderRef.current?.stop();
      return;
    }

    // Démarrer l'enregistrement
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
      });

      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        // Libérer le micro
        stream.getTracks().forEach((track) => track.stop());

        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setRecording(false);
        onRecordingComplete(audioBlob);
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setRecording(true);
    } catch (err) {
      console.error('Erreur accès micro:', err);
      alert('Impossible d\'accéder au microphone. Vérifiez les permissions.');
    }
  }

  return (
    <button
      onClick={toggleRecording}
      disabled={disabled}
      className={`flex-1 h-16 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
        recording
          ? 'bg-red-500 text-white animate-pulse shadow-lg shadow-red-500/30'
          : 'bg-[#1E3A5F] text-white active:bg-[#162d4a]'
      }`}
    >
      {recording ? (
        <>
          {/* Icône stop */}
          <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
            <rect x="6" y="6" width="12" height="12" rx="2" />
          </svg>
          Stop
        </>
      ) : (
        <>
          {/* Icône micro */}
          <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
          Parler
        </>
      )}
    </button>
  );
}
