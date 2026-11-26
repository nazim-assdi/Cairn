import React, { useRef, useState } from 'react';
import { FileAudio, FileImage, FileVideo, Sparkles, Upload } from 'lucide-react';
import {
  ImageStylePreset,
  MediaArtifact,
  MediaKind,
  VaultDocument,
  VideoStylePreset,
} from '../types/workspace';
import { MediaArtifactCard } from './MediaArtifactCard';

interface MediaStudioProps {
  media: MediaArtifact[];
  selectedDocs: VaultDocument[];
  isGenerating: boolean;
  generationLabel: string;
  livePreviewFrame: string | null;
  onGenerateMedia: (
    kind: MediaKind,
    prompt: string,
    options?: {
      stylePreset?: ImageStylePreset;
      videoStyle?: VideoStylePreset;
      aspectRatio?: '16:9' | '1:1';
      durationSec?: number;
    }
  ) => void;
  onUploadLocalMedia: (file: File) => void;
  onDeleteMedia: (id: string) => void;
}

const STUDIO_IDEAS: Array<{
  label: string;
  prompt: string;
  imageStyle: ImageStylePreset;
  videoStyle: VideoStylePreset;
}> = [
  {
    label: 'Red Car at Sunset',
    prompt: 'A red sports car driving by the ocean at sunset',
    imageStyle: 'artwork',
    videoStyle: 'scene',
  },
  {
    label: 'Rocket to Cosmos',
    prompt: 'A rocket launching toward a ringed planet in starry cosmos',
    imageStyle: 'artwork',
    videoStyle: 'scene',
  },
  {
    label: 'Moonlit River Boat',
    prompt: 'A wooden boat sailing on a moonlit river with fireflies',
    imageStyle: 'artwork',
    videoStyle: 'scene',
  },
  {
    label: 'Snowy Forest Cabin',
    prompt: 'A cozy cabin house with smoke in a snowy pine forest',
    imageStyle: 'poster',
    videoStyle: 'motion',
  },
  {
    label: 'Document Briefing',
    prompt: 'Executive briefing summary from selected documents',
    imageStyle: 'briefing',
    videoStyle: 'briefing',
  },
];

export const MediaStudio: React.FC<MediaStudioProps> = ({
  media,
  selectedDocs,
  isGenerating,
  generationLabel,
  livePreviewFrame,
  onGenerateMedia,
  onUploadLocalMedia,
  onDeleteMedia,
}) => {
  const [studioMode, setStudioMode] = useState<MediaKind>('image');
  const [prompt, setPrompt] = useState('');
  const [stylePreset, setStylePreset] = useState<ImageStylePreset>('artwork');
  const [videoStyle, setVideoStyle] = useState<VideoStylePreset>('scene');
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '1:1'>('16:9');
  const [durationSec, setDurationSec] = useState<number>(4);
  const [filterKind, setFilterKind] = useState<'all' | MediaKind>('all');
  const [validationError, setValidationError] = useState<string | null>(null);

  const uploadInputRef = useRef<HTMLInputElement>(null);

  const filteredMedia =
    filterKind === 'all' ? media : media.filter((m) => m.kind === filterKind);

  const counts = {
    all: media.length,
    image: media.filter((m) => m.kind === 'image').length,
    audio: media.filter((m) => m.kind === 'audio').length,
    video: media.filter((m) => m.kind === 'video').length,
  };

  const handleGenerateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const isBriefing =
      (studioMode === 'image' &&
        (stylePreset === 'briefing' ||
          stylePreset === 'network' ||
          stylePreset === 'metrics')) ||
      (studioMode === 'video' && videoStyle === 'briefing');

    const trimmed = prompt.trim();
    if (!trimmed && !isBriefing) {
      setValidationError(
        `Describe the ${studioMode} you want to generate, or pick an example prompt below.`
      );
      return;
    }
    setValidationError(null);

    const effectivePrompt =
      trimmed ||
      (selectedDocs.length > 0
        ? `${selectedDocs[0].name.replace(/\.(pdf|docx|txt)$/i, '')} Local Briefing`
        : 'Local Document Analysis Summary');

    onGenerateMedia(studioMode, effectivePrompt, {
      stylePreset,
      videoStyle,
      aspectRatio,
      durationSec,
    });
  };

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Generator Panel */}
        <section className="rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 font-display">
                On-Device Rich Media Synthesis
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                Generate creative scenes, visual posters, animated WebM videos, WAV audio, or document briefings from your {selectedDocs.length} scoped file{selectedDocs.length === 1 ? '' : 's'}—100% locally.
              </p>
            </div>

            <div>
              <input
                ref={uploadInputRef}
                type="file"
                accept="audio/*,video/*"
                className="sr-only"
                aria-label="Upload local audio or video file for analysis"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    onUploadLocalMedia(file);
                    e.target.value = '';
                  }
                }}
              />
              <button
                type="button"
                onClick={() => uploadInputRef.current?.click()}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Analyze Local Audio/Video</span>
              </button>
            </div>
          </div>

          {/* Modality Selector */}
          <div className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            {(
              [
                { id: 'image', label: 'Image Studio', Icon: FileImage },
                { id: 'audio', label: 'Audio Studio', Icon: FileAudio },
                { id: 'video', label: 'Video Studio', Icon: FileVideo },
              ] as const
            ).map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setStudioMode(id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  studioMode === id
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                <Icon className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" aria-hidden="true" />
                <span>{label}</span>
              </button>
            ))}
          </div>

          <form onSubmit={handleGenerateSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-2">
                <label
                  htmlFor="studio-prompt-input"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  {studioMode === 'image'
                    ? 'Describe any image scene, artwork, or briefing'
                    : studioMode === 'audio'
                    ? 'Narration script or soundscape topic'
                    : 'Describe any video scene, story, or briefing'}
                </label>
                <input
                  id="studio-prompt-input"
                  type="text"
                  value={prompt}
                  onChange={(e) => {
                    setPrompt(e.target.value);
                    if (validationError) setValidationError(null);
                  }}
                  placeholder={
                    studioMode === 'image'
                      ? 'e.g. A red sports car at sunset, a cat under moonlight, or a castle in snow'
                      : studioMode === 'video'
                      ? 'e.g. A rocket launching into cosmos, a wooden boat on a river, or a flying bird'
                      : 'Enter audio topic, narration script, or leave blank for document summary'
                  }
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-teal-700"
                />
              </div>

              {studioMode === 'image' && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label
                      htmlFor="studio-image-preset"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      Style
                    </label>
                    <select
                      id="studio-image-preset"
                      value={stylePreset}
                      onChange={(e) =>
                        setStylePreset(e.target.value as ImageStylePreset)
                      }
                      className="w-full px-2.5 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100"
                    >
                      <option value="artwork">Creative Scene</option>
                      <option value="poster">Visual Poster</option>
                      <option value="briefing">Briefing Card</option>
                      <option value="network">Concept Graph</option>
                      <option value="metrics">Metric Bars</option>
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor="studio-image-ratio"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      Ratio
                    </label>
                    <select
                      id="studio-image-ratio"
                      value={aspectRatio}
                      onChange={(e) =>
                        setAspectRatio(e.target.value as '16:9' | '1:1')
                      }
                      className="w-full px-2.5 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100"
                    >
                      <option value="16:9">16:9</option>
                      <option value="1:1">1:1</option>
                    </select>
                  </div>
                </div>
              )}

              {studioMode === 'audio' && (
                <div>
                  <label
                    htmlFor="studio-audio-duration"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    WAV Duration (sec)
                  </label>
                  <select
                    id="studio-audio-duration"
                    value={durationSec}
                    onChange={(e) => setDurationSec(Number(e.target.value))}
                    className="w-full px-2.5 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 tabular-nums"
                  >
                    <option value={3}>3 seconds</option>
                    <option value={5}>5 seconds</option>
                    <option value={8}>8 seconds</option>
                  </select>
                </div>
              )}

              {studioMode === 'video' && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label
                      htmlFor="studio-video-style"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      Video Mode
                    </label>
                    <select
                      id="studio-video-style"
                      value={videoStyle}
                      onChange={(e) =>
                        setVideoStyle(e.target.value as VideoStylePreset)
                      }
                      className="w-full px-2.5 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100"
                    >
                      <option value="scene">Animated Scene</option>
                      <option value="motion">Motion Story</option>
                      <option value="briefing">Document Brief</option>
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor="studio-video-duration"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      Duration
                    </label>
                    <select
                      id="studio-video-duration"
                      value={durationSec}
                      onChange={(e) => setDurationSec(Number(e.target.value))}
                      className="w-full px-2.5 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 tabular-nums"
                    >
                      <option value={4}>4 seconds</option>
                      <option value={6}>6 seconds</option>
                      <option value={8}>8 seconds</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Quick Creative & Briefing Prompt Ideas */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400 mr-1">
                <Sparkles className="w-3 h-3 text-teal-700 dark:text-teal-400" aria-hidden="true" />
                <span>Try:</span>
              </span>
              {STUDIO_IDEAS.map((idea) => (
                <button
                  key={idea.label}
                  type="button"
                  onClick={() => {
                    setPrompt(idea.prompt);
                    setStylePreset(idea.imageStyle);
                    setVideoStyle(idea.videoStyle);
                    setValidationError(null);
                  }}
                  className="px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-teal-50 dark:hover:bg-teal-950/50 hover:text-teal-800 dark:hover:text-teal-200 rounded-md transition-colors cursor-pointer"
                >
                  {idea.label}
                </button>
              ))}
            </div>

            {validationError && (
              <p role="alert" className="text-xs text-red-600 dark:text-red-400 font-medium">
                {validationError}
              </p>
            )}

            {isGenerating && livePreviewFrame && (
              <div className="rounded-lg border border-teal-200 dark:border-teal-800 bg-slate-950 overflow-hidden max-w-md">
                <img
                  src={livePreviewFrame}
                  alt="Live video frame synthesis preview"
                  className="w-full h-44 object-cover block"
                />
                <div className="px-3 py-1.5 text-[11px] font-medium text-teal-200 bg-slate-900/90 tabular-nums">
                  {generationLabel}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-4">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {isGenerating
                  ? generationLabel
                  : studioMode === 'video'
                  ? 'Encodes 960×540 WebM locally at 24 fps'
                  : 'Synthesizes prompt subjects & scenes locally'}
              </span>
              <button
                type="submit"
                disabled={isGenerating}
                className="px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
              >
                {isGenerating
                  ? 'Rendering...'
                  : studioMode === 'image'
                  ? 'Generate PNG Image'
                  : studioMode === 'audio'
                  ? 'Synthesize WAV Audio'
                  : 'Render WebM Video'}
              </button>
            </div>
          </form>
        </section>

        {/* Gallery Filter & List */}
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
              Generated & Analyzed Media ({filteredMedia.length})
            </h3>

            <div
              role="group"
              aria-label="Filter media artifacts"
              className="inline-flex items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-800 rounded-lg"
            >
              {(
                [
                  { id: 'all', label: `All (${counts.all})` },
                  { id: 'image', label: `Images (${counts.image})` },
                  { id: 'audio', label: `Audio (${counts.audio})` },
                  { id: 'video', label: `Video (${counts.video})` },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilterKind(tab.id)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 tabular-nums cursor-pointer ${
                    filterKind === tab.id
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {filteredMedia.length === 0 ? (
            <div className="rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 text-center space-y-1.5">
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                No {filterKind === 'all' ? 'media artifacts' : `${filterKind} files`} yet
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Use the synthesizer above or generate media directly inside any chat response.
              </p>
            </div>
          ) : (
            <div
              data-testid="media-gallery"
              className="grid grid-cols-1 lg:grid-cols-2 gap-4"
            >
              {filteredMedia.map((item) => (
                <MediaArtifactCard
                  key={item.id}
                  artifact={item}
                  onDelete={onDeleteMedia}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
