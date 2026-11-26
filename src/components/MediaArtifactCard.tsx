import React, { useState } from 'react';
import {
  Download,
  FileAudio,
  FileImage,
  FileVideo,
  Trash2,
  Volume2,
  Square,
} from 'lucide-react';
import { MediaArtifact } from '../types/workspace';
import { formatBytes, formatDuration, formatTimestamp } from '../utils/formatters';

interface MediaArtifactCardProps {
  artifact: MediaArtifact;
  onDelete?: (id: string) => void;
  compact?: boolean;
}

export const MediaArtifactCard: React.FC<MediaArtifactCardProps> = ({
  artifact,
  onDelete,
  compact = false,
}) => {
  const [isSpeaking, setIsSpeaking] = useState(false);

  const handleDownload = () => {
    const ext =
      artifact.kind === 'image'
        ? 'png'
        : artifact.kind === 'audio'
        ? artifact.mimeType.includes('wav')
          ? 'wav'
          : 'audio'
        : artifact.mimeType.includes('webm')
        ? 'webm'
        : 'mp4';

    const safeName = artifact.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    const link = document.createElement('a');
    link.href = artifact.dataUrl;
    link.download = `${safeName || artifact.kind}.${ext}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleToggleSpeech = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }
    const text = artifact.scriptText || artifact.prompt || artifact.title;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.cancel();
    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  const KindIcon =
    artifact.kind === 'image'
      ? FileImage
      : artifact.kind === 'audio'
      ? FileAudio
      : FileVideo;

  const speechSupported =
    typeof window !== 'undefined' && 'speechSynthesis' in window;

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-800">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <KindIcon className="w-4 h-4 text-teal-700 dark:text-teal-400 shrink-0" aria-hidden="true" />
            <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
              {artifact.title}
            </h4>
          </div>
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
            <span className="capitalize whitespace-nowrap">{artifact.kind}</span>
            <span aria-hidden="true">·</span>
            <span className="whitespace-nowrap">{formatBytes(artifact.sizeBytes)}</span>
            {artifact.durationSec ? (
              <>
                <span aria-hidden="true">·</span>
                <span className="whitespace-nowrap">{formatDuration(artifact.durationSec)}</span>
              </>
            ) : null}
            {artifact.width && artifact.height ? (
              <>
                <span aria-hidden="true">·</span>
                <span className="whitespace-nowrap">
                  {artifact.width}×{artifact.height}
                </span>
              </>
            ) : null}
            <span aria-hidden="true">·</span>
            <span className="whitespace-nowrap">{formatTimestamp(artifact.createdAt)}</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleDownload}
            aria-label={`Download ${artifact.title}`}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Export</span>
          </button>
          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(artifact.id)}
              aria-label={`Delete ${artifact.title}`}
              className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-md transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      <div className={compact ? 'p-3' : 'p-4'}>
        {artifact.kind === 'image' && (
          <div className="rounded-md overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
            <img
              src={artifact.dataUrl}
              alt={artifact.title}
              referrerPolicy="no-referrer"
              className="w-full h-auto block object-contain max-h-96"
            />
          </div>
        )}

        {artifact.kind === 'audio' && (
          <div className="space-y-3">
            {artifact.waveformPeaks && artifact.waveformPeaks.length > 0 && (
              <div
                data-testid="waveform-bars"
                aria-label="Audio waveform visualization"
                className="flex items-end gap-0.5 h-12 px-2 py-1.5 rounded-md bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
              >
                {artifact.waveformPeaks.map((peak, idx) => (
                  <div
                    key={idx}
                    className="flex-1 bg-teal-700/80 dark:bg-teal-500/80 rounded-xs"
                    style={{ height: `${Math.max(12, Math.round(peak * 100))}%` }}
                  />
                ))}
              </div>
            )}

            <audio
              controls
              src={artifact.dataUrl}
              className="w-full h-9"
              aria-label={`Audio player for ${artifact.title}`}
            />

            {artifact.scriptText && (
              <div className="flex items-start justify-between gap-3 pt-1">
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed line-clamp-3">
                  {artifact.scriptText}
                </p>
                {speechSupported && (
                  <button
                    type="button"
                    onClick={handleToggleSpeech}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-teal-800 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/60 hover:bg-teal-100 dark:hover:bg-teal-900/60 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {isSpeaking ? (
                      <>
                        <Square className="w-3 h-3" aria-hidden="true" />
                        <span>Stop Voice</span>
                      </>
                    ) : (
                      <>
                        <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Narrate</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {artifact.kind === 'video' && (
          <div className="space-y-3">
            {artifact.mimeType.startsWith('video/') ? (
              <div className="rounded-md overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-950">
                <video
                  controls
                  playsInline
                  src={artifact.dataUrl}
                  poster={artifact.keyframes?.[0]}
                  className="w-full max-h-80 block"
                  aria-label={`Video player for ${artifact.title}`}
                />
              </div>
            ) : (
              <div className="rounded-md overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-950">
                <img
                  src={artifact.dataUrl}
                  alt={artifact.title}
                  referrerPolicy="no-referrer"
                  className="w-full h-auto block object-contain max-h-72"
                />
              </div>
            )}

            {artifact.keyframes && artifact.keyframes.length > 1 && (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {artifact.keyframes.slice(0, 4).map((kf, idx) => (
                  <div
                    key={idx}
                    className="rounded border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-900"
                  >
                    <img
                      src={kf}
                      alt={`${artifact.title} frame ${idx + 1}`}
                      referrerPolicy="no-referrer"
                      className="w-full h-14 object-cover block"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
