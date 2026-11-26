import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowUp,
  BookOpen,
  Check,
  Copy,
  Cpu,
  Download,
  FileAudio,
  FileImage,
  FilePlus2,
  FileVideo,
  ImagePlus,
  Mic,
  MicOff,
  Paperclip,
  Pencil,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  Square,
  Terminal,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import {
  AI_PERSONAS,
  AiEngineId,
  AiSettings,
  ChatMessage,
  CitationRef,
  ComposerMode,
  ImageAttachment,
  ImageStylePreset,
  LOCAL_AI_MODELS,
  MediaArtifact,
  NeuralModelStatus,
  OllamaStatus,
  VaultDocument,
  VideoStylePreset,
} from '../types/workspace';
import { SLASH_COMMANDS } from '../utils/assistantBrain';
import { formatTimestamp } from '../utils/formatters';
import { MarkdownMessage } from './MarkdownMessage';
import { MediaArtifactCard } from './MediaArtifactCard';

interface ChatWorkspaceProps {
  messages: ChatMessage[];
  mediaMap: Map<string, MediaArtifact>;
  selectedDocs: VaultDocument[];
  isGenerating: boolean;
  generationLabel: string;
  livePreviewFrame: string | null;
  streamingText: string | null;
  selectedEngine: AiEngineId;
  neuralStatus: NeuralModelStatus;
  neuralProgress: number;
  neuralStatusMessage: string;
  cachedModelIds: string[];
  ollamaStatus: OllamaStatus;
  ollamaModels: string[];
  aiSettings: AiSettings;
  onOpenSettings: () => void;
  onSelectEngine: (engineId: AiEngineId) => void;
  onLoadNeuralModel: (engineId: AiEngineId) => void;
  onStopGeneration: () => void;
  onSendQuery: (query: string, attachments?: ImageAttachment[]) => void;
  onEditUserMessage: (messageId: string, newContent: string) => void;
  onRegenerateMessage: (assistantMessageId: string) => void;
  onExportThread: () => void;
  onUploadDocuments: (files: FileList | File[]) => void;
  onGenerateMediaFromPrompt: (
    kind: 'image' | 'audio' | 'video',
    prompt: string,
    options?: {
      stylePreset?: ImageStylePreset;
      videoStyle?: VideoStylePreset;
      highlights?: string[];
    }
  ) => void;
  onUploadLocalMedia: (file: File) => void;
  onOpenCitation: (citation: CitationRef) => void;
  onClearChat: () => void;
  onDeleteMedia: (id: string) => void;
}

const STARTER_PROMPTS = [
  'Write a TypeScript helper to parse CSV metrics with strict type safety',
  'Summarize key resilience findings and architectural privacy guarantees',
  'Calculate 18.5% of $128,400 and convert 2 GB to MB',
  'Create an HTML interactive system telemetry card I can preview live',
];

function readImageAttachment(file: File): Promise<ImageAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl) {
        reject(new Error(`Empty image payload for ${file.name}`));
        return;
      }
      const img = new Image();
      img.onload = () => {
        resolve({
          id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: file.name,
          dataUrl,
          width: img.naturalWidth || 0,
          height: img.naturalHeight || 0,
          sizeBytes: file.size,
        });
      };
      img.onerror = () => {
        resolve({
          id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: file.name,
          dataUrl,
          width: 0,
          height: 0,
          sizeBytes: file.size,
        });
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

export const ChatWorkspace: React.FC<ChatWorkspaceProps> = ({
  messages,
  mediaMap,
  selectedDocs,
  isGenerating,
  generationLabel,
  livePreviewFrame,
  streamingText,
  selectedEngine,
  neuralStatus,
  neuralProgress,
  neuralStatusMessage,
  cachedModelIds,
  ollamaStatus,
  ollamaModels,
  aiSettings,
  onOpenSettings,
  onSelectEngine,
  onLoadNeuralModel,
  onStopGeneration,
  onSendQuery,
  onEditUserMessage,
  onRegenerateMessage,
  onExportThread,
  onUploadDocuments,
  onGenerateMediaFromPrompt,
  onUploadLocalMedia,
  onOpenCitation,
  onClearChat,
  onDeleteMedia,
}) => {
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<ComposerMode>('chat');
  const [imagePreset, setImagePreset] = useState<ImageStylePreset>('artwork');
  const [videoStyle, setVideoStyle] = useState<VideoStylePreset>('scene');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);
  const [pendingImages, setPendingImages] = useState<ImageAttachment[]>([]);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [slashMenuPinned, setSlashMenuPinned] = useState(false);
  const [activeSlashIdx, setActiveSlashIdx] = useState(0);

  const bottomRef = useRef<HTMLDivElement>(null);
  const mediaUploadRef = useRef<HTMLInputElement>(null);
  const docUploadRef = useRef<HTMLInputElement>(null);
  const imageUploadRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isGenerating, streamingText]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  const speechRecSupported =
    typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  const speechSynthSupported =
    typeof window !== 'undefined' && 'speechSynthesis' in window;

  const activeModelSpec =
    LOCAL_AI_MODELS.find((m) => m.id === selectedEngine) ?? LOCAL_AI_MODELS[0];
  const isNeuralCached = cachedModelIds.includes(selectedEngine);

  const handleCopyMessage = async (msg: ChatMessage) => {
    try {
      await navigator.clipboard.writeText(msg.content);
      setCopiedMsgId(msg.id);
      setTimeout(() => {
        setCopiedMsgId((curr) => (curr === msg.id ? null : curr));
      }, 1600);
    } catch {
      // Ignore clipboard failures
    }
  };

  const handleSpeakMessage = (msg: ChatMessage) => {
    if (!speechSynthSupported) return;
    if (speakingMsgId === msg.id) {
      window.speechSynthesis.cancel();
      setSpeakingMsgId(null);
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(msg.content);
    utterance.rate = 1.0;
    utterance.onend = () => setSpeakingMsgId(null);
    utterance.onerror = () => setSpeakingMsgId(null);
    setSpeakingMsgId(msg.id);
    window.speechSynthesis.speak(utterance);
  };

  const handleToggleMic = () => {
    if (!speechRecSupported) return;
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    const SpeechRec =
      (window as unknown as {
        SpeechRecognition?: new () => {
          continuous: boolean;
          interimResults: boolean;
          lang: string;
          onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
          onend: () => void;
          onerror: () => void;
          start: () => void;
          stop: () => void;
        };
        webkitSpeechRecognition?: new () => {
          continuous: boolean;
          interimResults: boolean;
          lang: string;
          onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
          onend: () => void;
          onerror: () => void;
          start: () => void;
          stop: () => void;
        };
      }).SpeechRecognition ||
      (window as unknown as {
        webkitSpeechRecognition?: new () => {
          continuous: boolean;
          interimResults: boolean;
          lang: string;
          onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
          onend: () => void;
          onerror: () => void;
          start: () => void;
          stop: () => void;
        };
      }).webkitSpeechRecognition;

    if (!SpeechRec) return;

    const recognition = new SpeechRec();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript;
      if (transcript) {
        setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
      }
    };
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);

    recognitionRef.current = recognition;
    setIsListening(true);
    recognition.start();
  };

  const activePersona =
    AI_PERSONAS.find((p) => p.id === aiSettings.personaId) ?? AI_PERSONAS[0];

  const slashPrefix = input.startsWith('/') && !input.includes(' ') && !input.includes('\n')
    ? input.toLowerCase()
    : null;

  const filteredSlashCommands = slashPrefix
    ? SLASH_COMMANDS.filter((c) => c.command.startsWith(slashPrefix))
    : slashMenuPinned
    ? SLASH_COMMANDS
    : [];

  const isSlashMenuVisible = mode === 'chat' && filteredSlashCommands.length > 0;

  const applySlashCommand = (cmd: string) => {
    setSlashMenuPinned(false);
    setActiveSlashIdx(0);
    if (cmd === '/help') {
      setInput('');
      onSendQuery('/help');
      return;
    }
    setInput(`${cmd} `);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const handleImageFilesSelected = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList).slice(0, 4);
    try {
      const loaded = await Promise.all(files.map((f) => readImageAttachment(f)));
      setPendingImages((prev) => [...prev, ...loaded].slice(0, 4));
      setValidationError(null);
    } catch (err) {
      setValidationError(
        err instanceof Error ? err.message : 'Unable to attach image file.'
      );
    }
  };

  const submitCurrentInput = () => {
    if (isGenerating) return;
    const trimmed = input.trim();

    if (mode === 'chat') {
      if (!trimmed && pendingImages.length === 0) {
        setValidationError('Enter a question, type / for commands, or select a starter prompt.');
        return;
      }
      setValidationError(null);
      setSlashMenuPinned(false);
      const queryText = trimmed || `Inspect attached image (${pendingImages[0]?.name || 'image'})`;
      const imgs = pendingImages.length > 0 ? [...pendingImages] : undefined;
      setInput('');
      setPendingImages([]);
      onSendQuery(queryText, imgs);
      return;
    }

    const isBriefingMode =
      (mode === 'image' &&
        (imagePreset === 'briefing' ||
          imagePreset === 'network' ||
          imagePreset === 'metrics')) ||
      (mode === 'video' && videoStyle === 'briefing');

    if (!trimmed && !isBriefingMode) {
      setValidationError(`Describe the ${mode} you want to create before generating.`);
      return;
    }

    setValidationError(null);
    const fallbackPrompt =
      selectedDocs.length > 0
        ? `Briefing for ${selectedDocs.map((d) => d.name.replace(/\.(pdf|docx|txt)$/i, '')).join(', ')}`
        : 'Local Edge Document Briefing';

    const promptToUse = trimmed || fallbackPrompt;
    setInput('');
    onGenerateMediaFromPrompt(mode, promptToUse, {
      stylePreset: mode === 'image' ? imagePreset : undefined,
      videoStyle: mode === 'video' ? videoStyle : undefined,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitCurrentInput();
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-slate-50 dark:bg-slate-950">
      {/* Sub-header: Active Scope + On-Device AI Engine Selector */}
      <div className="px-4 sm:px-6 py-2.5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shrink-0 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <Cpu className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400 shrink-0" aria-hidden="true" />
            <label htmlFor="local-ai-engine-select" className="sr-only">
              Select on-device AI engine
            </label>
            <select
              id="local-ai-engine-select"
              value={selectedEngine}
              onChange={(e) => onSelectEngine(e.target.value as AiEngineId)}
              className="text-xs font-medium text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md px-2.5 py-1 max-w-xs"
            >
              {LOCAL_AI_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} · {m.sizeLabel}
                </option>
              ))}
            </select>

            {activeModelSpec.runtime === 'browser-llm' && neuralStatus !== 'ready' && (
              <button
                type="button"
                disabled={neuralStatus === 'loading'}
                onClick={() => onLoadNeuralModel(selectedEngine)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
              >
                <Download className="w-3 h-3" aria-hidden="true" />
                <span>
                  {neuralStatus === 'loading'
                    ? `Loading ${neuralProgress}%`
                    : isNeuralCached
                    ? 'Load Cached Model'
                    : 'Download & Cache Offline'}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={onOpenSettings}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" aria-hidden="true" />
              <span>AI Settings</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                setSlashMenuPinned((v) => !v);
                textareaRef.current?.focus();
              }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Terminal className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" aria-hidden="true" />
              <span>Commands (/)</span>
            </button>

            {messages.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={onExportThread}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Export .md</span>
                </button>
                <button
                  type="button"
                  onClick={onClearChat}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Clear thread</span>
                </button>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
          <span className="truncate">
            {activeModelSpec.runtime === 'ollama'
              ? ollamaStatus === 'connected'
                ? `Connected · ${
                    ollamaModels.some((m) =>
                      m.toLowerCase().includes(aiSettings.customOllamaModel.toLowerCase())
                    )
                      ? `${aiSettings.customOllamaModel} active`
                      : `${ollamaModels.length} local model(s) ready`
                  }`
                : `Built-in Edge AI active · ${
                    selectedDocs.length === 0
                      ? 'complete assistant mode'
                      : `${selectedDocs.length} doc${selectedDocs.length > 1 ? 's' : ''} scoped`
                  }`
              : activeModelSpec.runtime === 'browser-llm'
              ? neuralStatusMessage || activeModelSpec.description
              : selectedDocs.length === 0
              ? 'No documents selected · complete assistant mode'
              : `Scope: ${
                  selectedDocs.length === 1
                    ? selectedDocs[0].name
                    : `${selectedDocs.length} documents`
                }`}
          </span>
          <span className="text-[11px] text-slate-400 dark:text-slate-500 whitespace-nowrap shrink-0">
            {activePersona.label} · temp {aiSettings.temperature.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Neural Model Download / Initialization Progress Bar */}
      {activeModelSpec.runtime === 'browser-llm' && neuralStatus === 'loading' && (
        <div className="px-4 sm:px-6 py-2 bg-teal-50/70 dark:bg-teal-950/40 border-b border-teal-100 dark:border-teal-900 shrink-0">
          <div className="max-w-3xl mx-auto space-y-1">
            <div className="flex items-center justify-between text-xs text-teal-900 dark:text-teal-200 tabular-nums">
              <span>{neuralStatusMessage || 'Caching on-device ONNX weights...'}</span>
              <span className="font-mono">{neuralProgress}%</span>
            </div>
            <div className="w-full h-1.5 bg-teal-100 dark:bg-teal-900 rounded-full overflow-hidden">
              <div
                className="h-full bg-teal-700 dark:bg-teal-400 transition-all duration-150"
                style={{ width: `${Math.max(4, neuralProgress)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Message Stream */}
      <div
        data-testid="chat-messages"
        className="flex-1 overflow-y-auto px-4 sm:px-6 py-6"
      >
        <div className="max-w-3xl mx-auto space-y-6">
          {messages.length === 0 && !streamingText ? (
            <div className="py-6 space-y-8">
              <div className="space-y-2 max-w-2xl">
                <h2 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 font-display text-balance">
                  Private offline AI, document analysis, and media synthesis
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  Chat privately on-device with Qwen 2.5 Coder 7B or instant built-in Edge AI. Analyze PDF, DOCX, and TXT files with cited passages, write code, or synthesize PNG visuals, WAV audio, and WebM video inside one workspace.
                </p>
              </div>

              {/* Starter Prompts */}
              <div className="space-y-2.5">
                <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Suggested queries
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {STARTER_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => onSendQuery(prompt)}
                      className="text-left p-3.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-teal-600 dark:hover:border-teal-500 hover:bg-teal-50/30 dark:hover:bg-teal-950/30 transition-colors text-xs font-medium text-slate-800 dark:text-slate-200 leading-relaxed cursor-pointer"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>

              {/* One-click Rich Media Shortcuts */}
              <div className="space-y-2.5">
                <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Instant local media generation
                </h3>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={isGenerating}
                    onClick={() =>
                      onGenerateMediaFromPrompt(
                        'image',
                        'A red sports car driving by the ocean at sunset',
                        { stylePreset: 'artwork' }
                      )
                    }
                    className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-teal-600 dark:hover:border-teal-500 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                  >
                    <FileImage className="w-4 h-4 text-teal-700 dark:text-teal-400" aria-hidden="true" />
                    <span>Car at Sunset Image</span>
                  </button>

                  <button
                    type="button"
                    disabled={isGenerating}
                    onClick={() =>
                      onGenerateMediaFromPrompt(
                        'video',
                        'A rocket launching toward a ringed planet in starry cosmos',
                        { videoStyle: 'scene' }
                      )
                    }
                    className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-teal-600 dark:hover:border-teal-500 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                  >
                    <FileVideo className="w-4 h-4 text-teal-700 dark:text-teal-400" aria-hidden="true" />
                    <span>Rocket Launch Video</span>
                  </button>

                  <button
                    type="button"
                    disabled={isGenerating}
                    onClick={() =>
                      onGenerateMediaFromPrompt(
                        'audio',
                        'Audio Briefing from Selected Documents'
                      )
                    }
                    className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-teal-600 dark:hover:border-teal-500 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                  >
                    <FileAudio className="w-4 h-4 text-teal-700 dark:text-teal-400" aria-hidden="true" />
                    <span>Generate Audio Brief</span>
                  </button>

                  <button
                    type="button"
                    disabled={isGenerating}
                    onClick={() =>
                      onGenerateMediaFromPrompt(
                        'image',
                        'Executive Document Briefing Visual',
                        { stylePreset: 'briefing' }
                      )
                    }
                    className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-teal-600 dark:hover:border-teal-500 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                  >
                    <FileImage className="w-4 h-4 text-teal-700 dark:text-teal-400" aria-hidden="true" />
                    <span>Document Briefing Card</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            messages.map((msg, msgIdx) => {
              const attachedMedia = (msg.mediaIds || [])
                .map((id) => mediaMap.get(id))
                .filter((m): m is MediaArtifact => Boolean(m));
              const isLastMessage = msgIdx === messages.length - 1;

              if (msg.role === 'user') {
                const isEditingThis = editingMsgId === msg.id;
                return (
                  <div key={msg.id} className="flex justify-end group">
                    <div className="max-w-xl w-full sm:w-auto rounded-lg bg-teal-700 dark:bg-teal-600 text-white px-4 py-3 text-sm leading-relaxed space-y-2">
                      {msg.attachments && msg.attachments.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {msg.attachments.map((att) => (
                            <div
                              key={att.id}
                              className="rounded-md overflow-hidden border border-teal-500/50 bg-teal-900/40"
                            >
                              <img
                                src={att.dataUrl}
                                alt={att.name}
                                className="h-24 w-32 object-cover"
                              />
                              <div className="px-2 py-0.5 text-[10px] text-teal-100 truncate max-w-32">
                                {att.name}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {isEditingThis ? (
                        <div className="space-y-2 min-w-[260px]">
                          <label htmlFor={`edit-msg-${msg.id}`} className="sr-only">
                            Edit prompt message
                          </label>
                          <textarea
                            id={`edit-msg-${msg.id}`}
                            rows={3}
                            value={editDraft}
                            onChange={(e) => setEditDraft(e.target.value)}
                            className="w-full px-2.5 py-1.5 text-sm rounded bg-teal-900/50 text-white border border-teal-400/50 focus:outline-none resize-y"
                          />
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingMsgId(null);
                                setEditDraft('');
                              }}
                              className="px-2.5 py-1 text-xs font-medium text-teal-100 hover:bg-teal-800/60 rounded cursor-pointer"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              disabled={!editDraft.trim() || isGenerating}
                              onClick={() => {
                                const trimmed = editDraft.trim();
                                if (!trimmed) return;
                                setEditingMsgId(null);
                                setEditDraft('');
                                onEditUserMessage(msg.id, trimmed);
                              }}
                              className="px-2.5 py-1 text-xs font-semibold bg-white text-teal-900 hover:bg-teal-50 rounded cursor-pointer disabled:opacity-50"
                            >
                              Save &amp; Run
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="whitespace-pre-wrap">{msg.content}</p>
                          <div className="flex items-center justify-end gap-2 text-[11px] text-teal-100/90 tabular-nums">
                            {!isGenerating && (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingMsgId(msg.id);
                                  setEditDraft(msg.content);
                                }}
                                aria-label={`Edit prompt from ${formatTimestamp(msg.createdAt)}`}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-teal-800/60 text-teal-100/90 hover:text-white transition-colors cursor-pointer"
                              >
                                <Pencil className="w-3 h-3" aria-hidden="true" />
                                <span>Edit</span>
                              </button>
                            )}
                            <span>{formatTimestamp(msg.createdAt)}</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              }

              return (
                <article
                  key={msg.id}
                  className="rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-4"
                >
                  <div className="flex items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-semibold text-slate-800 dark:text-slate-100">
                      {msg.engineLabel || 'Cairn Local AI'}
                    </span>
                    <span className="tabular-nums">
                      {msg.scopedDocNames && msg.scopedDocNames.length > 0
                        ? `${msg.scopedDocNames.length} source${
                            msg.scopedDocNames.length > 1 ? 's' : ''
                          } · `
                        : ''}
                      {formatTimestamp(msg.createdAt)}
                    </span>
                  </div>

                  <MarkdownMessage content={msg.content} />

                  {/* Extracted Metrics */}
                  {msg.extractedMetrics && msg.extractedMetrics.length > 0 && (
                    <div className="text-xs text-slate-600 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800 tabular-nums">
                      <span className="font-medium text-slate-700 dark:text-slate-300">
                        Metrics:{' '}
                      </span>
                      {msg.extractedMetrics.join(' · ')}
                    </div>
                  )}

                  {/* Grounded Citations */}
                  {msg.citations && msg.citations.length > 0 && (
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
                      <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                        Grounded citations
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {msg.citations.map((cit, idx) => (
                          <button
                            key={cit.id}
                            type="button"
                            onClick={() => onOpenCitation(cit)}
                            className="text-left p-2.5 rounded-md bg-slate-50 dark:bg-slate-800/70 hover:bg-teal-50/50 dark:hover:bg-teal-950/40 border border-slate-200 dark:border-slate-700 hover:border-teal-600 dark:hover:border-teal-500 transition-colors cursor-pointer"
                          >
                            <div className="flex items-center justify-between gap-2 text-xs font-medium text-slate-900 dark:text-slate-100">
                              <span className="flex items-center gap-1.5 truncate">
                                <BookOpen
                                  className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400 shrink-0"
                                  aria-hidden="true"
                                />
                                <span className="truncate">
                                  [{idx + 1}] {cit.documentName}
                                </span>
                              </span>
                              <span className="text-[11px] text-slate-500 dark:text-slate-400 shrink-0 tabular-nums">
                                {cit.pageLabel}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                              {cit.excerpt}
                            </p>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Embedded Rich Media Artifacts */}
                  {attachedMedia.length > 0 && (
                    <div className="space-y-3 pt-2">
                      {attachedMedia.map((artifact) => (
                        <MediaArtifactCard
                          key={artifact.id}
                          artifact={artifact}
                          onDelete={onDeleteMedia}
                          compact
                        />
                      ))}
                    </div>
                  )}

                  {/* Per-Message Actions: Copy, Regenerate, Speak + Media Synthesis */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2.5 border-t border-slate-100 dark:border-slate-800">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleCopyMessage(msg)}
                        aria-label={`Copy response from ${formatTimestamp(msg.createdAt)}`}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        {copiedMsgId === msg.id ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" aria-hidden="true" />
                            <span>Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>

                      {msg.intent !== 'media' && (
                        <button
                          type="button"
                          disabled={isGenerating}
                          onClick={() => onRegenerateMessage(msg.id)}
                          aria-label={`Regenerate response from ${formatTimestamp(msg.createdAt)}`}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                        >
                          <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Regenerate</span>
                        </button>
                      )}

                      {speechSynthSupported && (
                        <button
                          type="button"
                          onClick={() => handleSpeakMessage(msg)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          {speakingMsgId === msg.id ? (
                            <>
                              <Square className="w-3 h-3 text-teal-700 dark:text-teal-400" aria-hidden="true" />
                              <span>Stop</span>
                            </>
                          ) : (
                            <>
                              <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>Speak</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>

                    {msg.intent !== 'media' && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          disabled={isGenerating}
                          onClick={() =>
                            onGenerateMediaFromPrompt('image', msg.content.slice(0, 70), {
                              stylePreset: 'briefing',
                              highlights: msg.content
                                .split('\n')
                                .filter((l) => /^(?:•|-|\*)\s+/.test(l.trim()))
                                .map((l) => l.trim().replace(/^(?:•|-|\*)\s+/, '')),
                            })
                          }
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                        >
                          <FileImage className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" aria-hidden="true" />
                          <span>Visual Card</span>
                        </button>

                        <button
                          type="button"
                          disabled={isGenerating}
                          onClick={() =>
                            onGenerateMediaFromPrompt('audio', msg.content)
                          }
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                        >
                          <FileAudio className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" aria-hidden="true" />
                          <span>Audio Brief</span>
                        </button>

                        <button
                          type="button"
                          disabled={isGenerating}
                          onClick={() =>
                            onGenerateMediaFromPrompt('video', msg.content)
                          }
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                        >
                          <FileVideo className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" aria-hidden="true" />
                          <span>Video Recap</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Contextual Follow-Up Suggestions */}
                  {isLastMessage &&
                    !isGenerating &&
                    msg.suggestedFollowUps &&
                    msg.suggestedFollowUps.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400 mr-1">
                          <Sparkles className="w-3 h-3 text-teal-700 dark:text-teal-400" aria-hidden="true" />
                          <span>Next:</span>
                        </span>
                        {msg.suggestedFollowUps.map((followUp) => (
                          <button
                            key={followUp}
                            type="button"
                            onClick={() => onSendQuery(followUp)}
                            className="px-2.5 py-1 text-xs font-medium text-teal-800 dark:text-teal-200 bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 hover:border-teal-600 dark:hover:border-teal-500 rounded-md transition-colors cursor-pointer"
                          >
                            {followUp}
                          </button>
                        ))}
                      </div>
                    )}
                </article>
              );
            })
          )}

          {streamingText !== null && (
            <article className="rounded-lg bg-white dark:bg-slate-900 border border-teal-200 dark:border-teal-800 p-4 sm:p-5 space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span className="font-semibold text-teal-800 dark:text-teal-300">
                  {activeModelSpec.label} (streaming locally)
                </span>
                <button
                  type="button"
                  onClick={onStopGeneration}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/50 hover:bg-red-100 dark:hover:bg-red-900/50 rounded cursor-pointer"
                >
                  <Square className="w-3 h-3" aria-hidden="true" />
                  <span>Stop</span>
                </button>
              </div>
              <MarkdownMessage
                content={streamingText || 'Generating tokens on-device...'}
              />
            </article>
          )}

          {isGenerating && streamingText === null && (
            <div className="rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 space-y-2.5">
              <div className="text-xs text-slate-600 dark:text-slate-400 tabular-nums">
                {generationLabel || 'Processing locally on device...'}
              </div>
              {livePreviewFrame && (
                <div className="rounded-md overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-950 max-w-sm">
                  <img
                    src={livePreviewFrame}
                    alt="Live video render preview"
                    className="w-full h-36 object-cover block"
                  />
                </div>
              )}
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Unified Chat + Media Generation Composer */}
      <div className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 sm:px-6 py-3 shrink-0">
        <div className="max-w-3xl mx-auto space-y-2.5">
          {/* Mode Switcher */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div
              role="group"
              aria-label="Response output mode"
              className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg"
            >
              {(
                [
                  { id: 'chat', label: 'Ask AI' },
                  { id: 'image', label: 'Image' },
                  { id: 'audio', label: 'Audio' },
                  { id: 'video', label: 'Video' },
                ] as { id: ComposerMode; label: string }[]
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setMode(item.id);
                    setValidationError(null);
                  }}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    mode === item.id
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {mode === 'image' && (
              <div className="flex items-center gap-1.5 text-xs">
                <label
                  htmlFor="chat-image-preset"
                  className="text-slate-500 dark:text-slate-400"
                >
                  Style:
                </label>
                <select
                  id="chat-image-preset"
                  value={imagePreset}
                  onChange={(e) => setImagePreset(e.target.value as ImageStylePreset)}
                  className="px-2 py-1 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-800 dark:text-slate-200"
                >
                  <option value="artwork">Creative Scene</option>
                  <option value="poster">Visual Poster</option>
                  <option value="briefing">Briefing Card</option>
                  <option value="network">Concept Graph</option>
                  <option value="metrics">Term Density</option>
                </select>
              </div>
            )}

            {mode === 'video' && (
              <div className="flex items-center gap-1.5 text-xs">
                <label
                  htmlFor="chat-video-style"
                  className="text-slate-500 dark:text-slate-400"
                >
                  Mode:
                </label>
                <select
                  id="chat-video-style"
                  value={videoStyle}
                  onChange={(e) => setVideoStyle(e.target.value as VideoStylePreset)}
                  className="px-2 py-1 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-800 dark:text-slate-200"
                >
                  <option value="scene">Animated Scene</option>
                  <option value="motion">Motion Story</option>
                  <option value="briefing">Doc Briefing</option>
                </select>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-1.5">
              <input
                ref={docUploadRef}
                type="file"
                accept=".pdf,.docx,.txt,.md,.csv"
                multiple
                className="sr-only"
                aria-label="Attach documents from composer"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    onUploadDocuments(e.target.files);
                    e.target.value = '';
                  }
                }}
              />
              <button
                type="button"
                onClick={() => docUploadRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <FilePlus2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Attach Docs</span>
              </button>

              <input
                ref={imageUploadRef}
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                aria-label="Attach image to prompt"
                onChange={(e) => {
                  handleImageFilesSelected(e.target.files);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                onClick={() => imageUploadRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <ImagePlus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Attach Image</span>
              </button>

              <input
                ref={mediaUploadRef}
                type="file"
                accept="audio/*,video/*"
                className="sr-only"
                aria-label="Inspect local audio or video file"
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
                onClick={() => mediaUploadRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Paperclip className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Inspect Audio/Video</span>
              </button>
            </div>
          </div>

          {/* Pending Image Attachments Preview Strip */}
          {pendingImages.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {pendingImages.map((img) => (
                <div
                  key={img.id}
                  className="flex items-center gap-2 pl-1.5 pr-2 py-1 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
                >
                  <img
                    src={img.dataUrl}
                    alt={img.name}
                    className="w-7 h-7 rounded object-cover shrink-0"
                  />
                  <div className="min-w-0 max-w-36">
                    <div className="truncate font-medium text-slate-800 dark:text-slate-100">
                      {img.name}
                    </div>
                    {img.width > 0 && (
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 tabular-nums">
                        {img.width}×{img.height}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setPendingImages((prev) => prev.filter((p) => p.id !== img.id))
                    }
                    aria-label={`Remove ${img.name}`}
                    className="p-0.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {validationError && (
            <p role="alert" className="text-xs text-red-600 dark:text-red-400 font-medium">
              {validationError}
            </p>
          )}

          <div className="relative">
            {/* Slash Command Autocomplete Popover */}
            {isSlashMenuVisible && (
              <div
                role="listbox"
                aria-label="Slash commands"
                className="absolute bottom-full left-0 right-0 mb-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-lg overflow-hidden z-20 max-h-64 overflow-y-auto"
              >
                <div className="flex items-center justify-between px-3 py-1.5 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  <span>Offline AI Slash Commands</span>
                  <button
                    type="button"
                    onClick={() => setSlashMenuPinned(false)}
                    className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                  >
                    Esc to close
                  </button>
                </div>
                {filteredSlashCommands.map((cmd, idx) => (
                  <button
                    key={cmd.command}
                    type="button"
                    role="option"
                    aria-selected={idx === activeSlashIdx}
                    onClick={() => applySlashCommand(cmd.command)}
                    className={`w-full text-left px-3 py-2 flex items-center justify-between gap-3 text-xs transition-colors cursor-pointer ${
                      idx === activeSlashIdx
                        ? 'bg-teal-50 dark:bg-teal-950/60 text-teal-900 dark:text-teal-100'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-800 dark:text-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <code className="font-mono font-semibold text-teal-700 dark:text-teal-400 shrink-0">
                        {cmd.command}
                      </code>
                      <span className="font-medium shrink-0">{cmd.label}</span>
                      <span className="text-slate-500 dark:text-slate-400 truncate">
                        {cmd.description}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex items-end gap-2">
              <div className="flex-1 relative">
                <label htmlFor="chat-composer-input" className="sr-only">
                  Prompt or document question
                </label>
                <textarea
                  ref={textareaRef}
                  id="chat-composer-input"
                  rows={1}
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    setActiveSlashIdx(0);
                    if (validationError) setValidationError(null);
                  }}
                  onKeyDown={(e) => {
                    if (isSlashMenuVisible) {
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setActiveSlashIdx((i) => (i + 1) % filteredSlashCommands.length);
                        return;
                      }
                      if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setActiveSlashIdx(
                          (i) =>
                            (i - 1 + filteredSlashCommands.length) %
                            filteredSlashCommands.length
                        );
                        return;
                      }
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        setSlashMenuPinned(false);
                        if (input === '/') setInput('');
                        return;
                      }
                      if (e.key === 'Enter' && !e.shiftKey) {
                        const targetCmd =
                          filteredSlashCommands[activeSlashIdx] ?? filteredSlashCommands[0];
                        if (targetCmd) {
                          e.preventDefault();
                          applySlashCommand(targetCmd.command);
                          return;
                        }
                      }
                    }
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      submitCurrentInput();
                    }
                  }}
                  placeholder={
                    mode === 'chat'
                      ? 'Ask AI or type / commands...'
                      : mode === 'image'
                      ? 'Describe any image scene or briefing...'
                      : mode === 'audio'
                      ? 'Audio briefing topic or script...'
                      : 'Describe any animated video scene...'
                  }
                  className="w-full px-3.5 py-2.5 pr-10 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-700/20 focus:border-teal-700 resize-none max-h-40 leading-relaxed"
                />
              {speechRecSupported && (
                <button
                  type="button"
                  onClick={handleToggleMic}
                  aria-label={isListening ? 'Stop voice dictation' : 'Start voice dictation'}
                  className={`absolute right-2 bottom-2 p-1.5 rounded-md transition-colors cursor-pointer ${
                    isListening
                      ? 'text-red-600 bg-red-50 dark:bg-red-950/50'
                      : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                  }`}
                >
                  {isListening ? (
                    <MicOff className="w-4 h-4" aria-hidden="true" />
                  ) : (
                    <Mic className="w-4 h-4" aria-hidden="true" />
                  )}
                </button>
              )}
            </div>

            {isGenerating && streamingText !== null ? (
              <button
                type="button"
                onClick={onStopGeneration}
                aria-label="Stop generating"
                className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Square className="w-4 h-4" aria-hidden="true" />
                <span>Stop</span>
              </button>
            ) : (
              <button
                type="submit"
                disabled={isGenerating}
                aria-label={
                  mode === 'chat'
                    ? 'Send query'
                    : `Generate ${mode}`
                }
                className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
              >
                <span>
                  {mode === 'chat'
                    ? 'Send'
                    : mode === 'image'
                    ? 'Render Image'
                    : mode === 'audio'
                    ? 'Create Audio'
                    : 'Render Video'}
                </span>
                <ArrowUp className="w-4 h-4" aria-hidden="true" />
              </button>
            )}
          </form>
          </div>
        </div>
      </div>
    </div>
  );
};
