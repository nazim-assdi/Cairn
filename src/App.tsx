import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AiSettingsModal } from './components/AiSettingsModal';
import { ChatWorkspace } from './components/ChatWorkspace';
import { DocumentInspector } from './components/DocumentInspector';
import { MediaStudio } from './components/MediaStudio';
import { SidebarVault } from './components/SidebarVault';
import { TopBar } from './components/TopBar';
import {
  AiEngineId,
  AiSettings,
  ChatMessage,
  ChatSession,
  CitationRef,
  DEFAULT_AI_SETTINGS,
  ImageAttachment,
  ImageStylePreset,
  LOCAL_AI_MODELS,
  MediaArtifact,
  MediaKind,
  NeuralModelStatus,
  OllamaStatus,
  ThemeMode,
  VaultDocument,
  VideoStylePreset,
  WorkspaceTab,
} from './types/workspace';
import { parseSlashCommand, routeOfflineQuery } from './utils/assistantBrain';
import { inferMediaIntentFromPrompt } from './utils/sceneRenderer';
import { parseLocalDocument } from './utils/documentParser';
import {
  analyzeDocumentsLocally,
  buildLlmMessages,
  chunkDocumentPages,
  detectNaturalMediaRequest,
  retrieveContextForQuery,
} from './utils/edgeEngine';
import { getCachedNeuralModelIds, LocalLlmBridge } from './utils/localLlmClient';
import { probeLocalOllama, streamOllamaChat } from './utils/ollamaClient';
import {
  deleteDocumentFromVault,
  deleteMediaFromVault,
  deleteSessionFromVault,
  loadVaultState,
  restoreSampleDocuments,
  saveDocumentToVault,
  saveMediaToVault,
  saveSessionToVault,
  wipeEntireVault,
} from './utils/localVaultDb';
import { deriveSessionTitle } from './utils/markdownParser';
import {
  analyzeLocalAudioFile,
  analyzeLocalVideoFile,
  generateLocalAudioArtifact,
  generateLocalImageArtifact,
  generateLocalVideoArtifact,
} from './utils/mediaGenerator';

const THEME_STORAGE_KEY = 'cairn_theme_v1';
const SETTINGS_STORAGE_KEY = 'cairn_ai_settings_v1';
const ENGINE_STORAGE_KEY = 'cairn_selected_ai_engine_v1';
const DEFAULT_BROWSER_ENGINE: AiEngineId =
  'onnx-community/Qwen2.5-Coder-0.5B-Instruct';

function loadInitialSelectedEngine(): AiEngineId {
  if (typeof window === 'undefined') return DEFAULT_BROWSER_ENGINE;
  try {
    const saved = window.localStorage.getItem(ENGINE_STORAGE_KEY);
    if (saved && LOCAL_AI_MODELS.some((model) => model.id === saved)) {
      return saved as AiEngineId;
    }

    const cached = getCachedNeuralModelIds();
    const preferredCached = [
      'onnx-community/Qwen2.5-Coder-0.5B-Instruct',
      'onnx-community/Qwen2.5-Coder-1.5B-Instruct',
      'onnx-community/Qwen2.5-Coder-7B-Instruct',
    ];
    const cachedModel = preferredCached.find((modelId) => cached.includes(modelId));
    return (cachedModel as AiEngineId | undefined) ?? DEFAULT_BROWSER_ENGINE;
  } catch {
    return DEFAULT_BROWSER_ENGINE;
  }
}

function loadInitialAiSettings(): AiSettings {
  if (typeof window === 'undefined') return DEFAULT_AI_SETTINGS;
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_AI_SETTINGS;
    const saved = JSON.parse(raw) as Partial<AiSettings>;
    return {
      ...DEFAULT_AI_SETTINGS,
      ...saved,
      responseMode:
        saved.responseMode === 'balanced' || saved.responseMode === 'thinking'
          ? saved.responseMode
          : 'fast',
      // Older releases used 192 as the default ceiling. Raise that legacy
      // default so Thinking mode can actually use its longer response budget.
      maxTokens:
        saved.responseMode === undefined && saved.maxTokens === 192
          ? 1024
          : saved.maxTokens ?? DEFAULT_AI_SETTINGS.maxTokens,
    };
  } catch {
    return DEFAULT_AI_SETTINGS;
  }
}

function getFastResponseTokenBudget(query: string, settings: AiSettings): number {
  const normalized = query.toLowerCase();
  const codeHeavy =
    /\b(code|coding|program|function|component|debug|implement|build|script|typescript|javascript|python|sql|write tests)\b/.test(normalized) ||
    /কোড|প্রোগ্রাম|ফাংশন|ডিবাগ|তৈরি কর|লিখে দাও/.test(normalized);
  const mode = settings.responseMode ?? 'fast';
  const target =
    mode === 'fast'
      ? codeHeavy ? 160 : 96
      : mode === 'thinking'
        ? codeHeavy ? 512 : 384
        : codeHeavy ? 320 : 192;
  const configured = Number.isFinite(settings.maxTokens) && settings.maxTokens > 0
    ? settings.maxTokens
    : 384;
  return Math.max(48, Math.min(configured, target));
}

function getRetrievalLimit(mode: AiSettings['responseMode']): number {
  return mode === 'fast' ? 2 : mode === 'thinking' ? 5 : 3;
}

export default function App() {
  const [documents, setDocuments] = useState<VaultDocument[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [media, setMedia] = useState<MediaArtifact[]>([]);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('chat');
  const [inspectorDocId, setInspectorDocId] = useState<string | null>(null);
  const [highlightedChunkId, setHighlightedChunkId] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationLabel, setGenerationLabel] = useState('');
  const [livePreviewFrame, setLivePreviewFrame] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') return 'light';
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    return saved === 'dark' ? 'dark' : 'light';
  });

  // Start with a lightweight Qwen model suitable for CPU/WASM machines.
  // Keep the user's engine selection between desktop sessions.
  const [selectedEngine, setSelectedEngine] = useState<AiEngineId>(
    () => loadInitialSelectedEngine()
  );
  const [neuralStatus, setNeuralStatus] = useState<NeuralModelStatus>('idle');
  const [neuralProgress, setNeuralProgress] = useState(0);
  const [neuralStatusMessage, setNeuralStatusMessage] = useState('');
  const [cachedModelIds, setCachedModelIds] = useState<string[]>(() =>
    getCachedNeuralModelIds()
  );
  const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434');
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus>('unchecked');
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [aiSettings, setAiSettings] = useState<AiSettings>(() => loadInitialAiSettings());
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);

  const llmBridgeRef = useRef<LocalLlmBridge | null>(null);
  const ollamaAbortRef = useRef<AbortController | null>(null);
  const sessionsRef = useRef<ChatSession[]>([]);
  const activeSessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.classList.toggle('dark', theme === 'dark');
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    }
  }, [theme]);

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId) ?? null,
    [sessions, activeSessionId]
  );

  const messages = activeSession?.messages ?? [];

  const handleCheckOllama = async (urlOverride?: string) => {
    setOllamaStatus('checking');
    const result = await probeLocalOllama(urlOverride ?? ollamaUrl);
    if (result.connected) {
      setOllamaStatus('connected');
      setOllamaModels(result.models);
      setStatusError(null);
    } else {
      setOllamaStatus('offline');
      setOllamaModels([]);
    }
  };

  useEffect(() => {
    const bridge = new LocalLlmBridge((evt) => {
      setNeuralStatus(evt.status);
      setNeuralProgress(evt.progress);
      if (evt.message) setNeuralStatusMessage(evt.message);
      if (evt.status === 'ready') {
        setCachedModelIds(getCachedNeuralModelIds());
      }
      if (evt.status === 'error' && evt.message) {
        setStatusError(evt.message);
      }
    });
    llmBridgeRef.current = bridge;
    return () => {
      bridge.dispose();
    };
  }, []);

  useEffect(() => {
    if (selectedEngine === 'ollama:qwen2.5-coder:7b') {
      void handleCheckOllama();
      return;
    }
    if (
      selectedEngine !== 'builtin-edge' &&
      cachedModelIds.includes(selectedEngine)
    ) {
      setNeuralStatusMessage('Cached Qwen model found — loading it for offline use...');
      llmBridgeRef.current?.loadModel(selectedEngine);
    } else if (selectedEngine !== 'builtin-edge') {
      setNeuralStatusMessage('Select Download & Cache Offline to install the lightweight Qwen model.');
    }
  }, []);

  useEffect(() => {
    let active = true;
    loadVaultState().then((state) => {
      if (!active) return;
      setDocuments(state.documents);
      setSessions(state.sessions);
      sessionsRef.current = state.sessions;
      const initialSessionId = state.sessions[0]?.id ?? null;
      setActiveSessionId(initialSessionId);
      activeSessionIdRef.current = initialSessionId;
      setMedia(state.media);
      if (state.documents[0]) {
        setInspectorDocId(state.documents[0].id);
      }
      setIsHydrated(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const allChunks = useMemo(() => {
    return documents.flatMap((doc) =>
      chunkDocumentPages(doc.id, doc.name, doc.format, doc.pages)
    );
  }, [documents]);

  const selectedDocs = useMemo(
    () => documents.filter((d) => d.selected),
    [documents]
  );

  const mediaMap = useMemo(() => {
    const map = new Map<string, MediaArtifact>();
    for (const item of media) {
      map.set(item.id, item);
    }
    return map;
  }, [media]);

  const commitSessionUpdate = async (
    targetId: string | null,
    titleHint: string,
    updater: (prevMsgs: ChatMessage[]) => ChatMessage[]
  ): Promise<{ sessionId: string; messages: ChatMessage[] }> => {
    const now = Date.now();
    const existing = targetId
      ? sessionsRef.current.find((s) => s.id === targetId)
      : undefined;

    if (existing) {
      const nextMsgs = updater(existing.messages);
      const updatedSession: ChatSession = {
        ...existing,
        updatedAt: now,
        messages: nextMsgs,
      };
      const nextList = [
        updatedSession,
        ...sessionsRef.current.filter((s) => s.id !== existing.id),
      ];
      sessionsRef.current = nextList;
      setSessions(nextList);
      await saveSessionToVault(updatedSession);
      return { sessionId: updatedSession.id, messages: nextMsgs };
    }

    const newSessionId = `session-${now}-${Math.random().toString(36).slice(2, 6)}`;
    const nextMsgs = updater([]);
    const created: ChatSession = {
      id: newSessionId,
      title: deriveSessionTitle(titleHint),
      createdAt: now,
      updatedAt: now,
      messages: nextMsgs,
    };
    const nextList = [created, ...sessionsRef.current];
    sessionsRef.current = nextList;
    activeSessionIdRef.current = newSessionId;
    setSessions(nextList);
    setActiveSessionId(newSessionId);
    await saveSessionToVault(created);
    return { sessionId: newSessionId, messages: nextMsgs };
  };

  const handleNewChat = () => {
    setActiveSessionId(null);
    activeSessionIdRef.current = null;
    setActiveTab('chat');
    setStatusError(null);
  };

  const handleSelectSession = (id: string) => {
    setActiveSessionId(id);
    activeSessionIdRef.current = id;
    setActiveTab('chat');
  };

  const handleRenameSession = async (id: string, title: string) => {
    const existing = sessionsRef.current.find((s) => s.id === id);
    if (!existing) return;
    const updated: ChatSession = { ...existing, title };
    const nextList = sessionsRef.current.map((s) => (s.id === id ? updated : s));
    sessionsRef.current = nextList;
    setSessions(nextList);
    await saveSessionToVault(updated);
  };

  const handleSaveSettings = (next: AiSettings) => {
    setAiSettings(next);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage quota issues
      }
    }
  };

  const handleTogglePinSession = async (id: string) => {
    const existing = sessionsRef.current.find((s) => s.id === id);
    if (!existing) return;
    const updated: ChatSession = { ...existing, pinned: !existing.pinned };
    const nextList = sessionsRef.current.map((s) => (s.id === id ? updated : s));
    sessionsRef.current = nextList;
    setSessions(nextList);
    await saveSessionToVault(updated);
  };

  const handleDeleteSession = async (id: string) => {
    await deleteSessionFromVault(id);
    const remaining = sessionsRef.current.filter((s) => s.id !== id);
    sessionsRef.current = remaining;
    setSessions(remaining);
    if (activeSessionIdRef.current === id) {
      const nextId = remaining[0]?.id ?? null;
      setActiveSessionId(nextId);
      activeSessionIdRef.current = nextId;
    }
  };

  const handleSelectEngine = (engineId: AiEngineId) => {
    setSelectedEngine(engineId);
    try {
      window.localStorage.setItem(ENGINE_STORAGE_KEY, engineId);
    } catch {
      // Engine selection still works for this session if storage is unavailable.
    }
    setStatusError(null);
    if (engineId === 'builtin-edge') {
      setNeuralStatus('idle');
      setNeuralProgress(0);
      setNeuralStatusMessage('');
      return;
    }
    if (engineId === 'ollama:qwen2.5-coder:7b') {
      handleCheckOllama();
      return;
    }
    setNeuralStatus('idle');
    setNeuralProgress(0);
    setNeuralStatusMessage(
      cachedModelIds.includes(engineId)
        ? 'Cached locally — click Load Cached Model to activate'
        : 'Click Download & Cache Offline to store weights locally'
    );
  };

  const handleLoadNeuralModel = (engineId: AiEngineId) => {
    setStatusError(null);
    llmBridgeRef.current?.loadModel(engineId);
  };

  const handleStopGeneration = () => {
    llmBridgeRef.current?.interrupt();
    ollamaAbortRef.current?.abort();
  };

  const handleUploadFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    setIsUploading(true);
    setStatusError(null);

    const addedDocs: VaultDocument[] = [];
    const errors: string[] = [];

    for (const file of files) {
      try {
        const { doc } = await parseLocalDocument(file);
        await saveDocumentToVault(doc);
        addedDocs.push(doc);
      } catch (err) {
        errors.push(
          err instanceof Error ? err.message : `Failed to parse ${file.name}`
        );
      }
    }

    if (addedDocs.length > 0) {
      setDocuments((prev) => [...addedDocs, ...prev]);
      setInspectorDocId(addedDocs[0].id);
    }

    if (errors.length > 0) {
      setStatusError(errors.join(' '));
    }

    setIsUploading(false);
  };

  const handleToggleDocument = async (id: string) => {
    let updatedDoc: VaultDocument | undefined;
    setDocuments((prev) =>
      prev.map((d) => {
        if (d.id === id) {
          updatedDoc = { ...d, selected: !d.selected };
          return updatedDoc;
        }
        return d;
      })
    );
    if (updatedDoc) {
      await saveDocumentToVault(updatedDoc);
    }
  };

  const handleSelectAll = async (selected: boolean) => {
    const next = documents.map((d) => ({ ...d, selected }));
    setDocuments(next);
    for (const doc of next) {
      await saveDocumentToVault(doc);
    }
  };

  const handleDeleteDocument = async (id: string) => {
    await deleteDocumentFromVault(id);
    setDocuments((prev) => {
      const remaining = prev.filter((d) => d.id !== id);
      if (inspectorDocId === id) {
        setInspectorDocId(remaining[0]?.id ?? null);
      }
      return remaining;
    });
  };

  const handleRestoreSamples = async () => {
    setStatusError(null);
    const seeded = await restoreSampleDocuments();
    setDocuments((prev) => {
      const existingIds = new Set(prev.map((d) => d.id));
      const missing = seeded.filter((s) => !existingIds.has(s.id));
      return [...missing, ...prev];
    });
  };

  const handleWipeVault = async () => {
    await wipeEntireVault();
    setDocuments([]);
    sessionsRef.current = [];
    setSessions([]);
    setActiveSessionId(null);
    activeSessionIdRef.current = null;
    setMedia([]);
    setInspectorDocId(null);
    setHighlightedChunkId(null);
  };

  const generateAssistantResponse = async (
    query: string,
    targetSessionId: string,
    priorHistory: ChatMessage[],
    attachments?: ImageAttachment[]
  ) => {
    const slash = parseSlashCommand(query);
    if (
      slash.command === '/image' ||
      slash.command === '/audio' ||
      slash.command === '/video'
    ) {
      const kind = slash.command.slice(1) as MediaKind;
      await handleGenerateMedia(
        kind,
        slash.args || 'Executive Document Briefing Visual',
        {
          postToChat: true,
          sessionId: targetSessionId,
        }
      );
      return;
    }

    const naturalMedia = detectNaturalMediaRequest(query);
    if (naturalMedia) {
      await handleGenerateMedia(naturalMedia, query, {
        postToChat: true,
        sessionId: targetSessionId,
      });
      return;
    }

    const browserModelSelected =
      selectedEngine !== 'builtin-edge' &&
      selectedEngine !== 'ollama:qwen2.5-coder:7b';

    if (browserModelSelected && neuralStatus !== 'ready') {
      const message =
        neuralStatus === 'loading'
          ? 'Qwen is still loading. Wait until AI Settings shows “Ready offline”, then send your message again.'
          : 'Qwen is not ready yet. Open AI Settings and download the model or load its cached weights. Choose Built-in Edge AI only when you want to use the lightweight fallback.';
      setStatusError(message);
      const assistantMsg: ChatMessage = {
        id: `msg-a-${Date.now() + 1}`,
        role: 'assistant',
        content: message,
        createdAt: Date.now() + 1,
        intent: 'general',
        engineLabel: 'Qwen runtime not ready',
      };
      await commitSessionUpdate(targetSessionId, query, (prev) => [
        ...prev,
        assistantMsg,
      ]);
      return;
    }

    const useOllama =
      selectedEngine === 'ollama:qwen2.5-coder:7b' &&
      ollamaStatus === 'connected';

    if (useOllama) {
      setIsGenerating(true);
      setStreamingText('');
      const rag = retrieveContextForQuery(
        query,
        selectedDocs,
        allChunks,
        getRetrievalLimit(aiSettings.responseMode)
      );
      const llmMessages = buildLlmMessages(
        query,
        priorHistory,
        rag.contextBlock,
        selectedDocs,
        aiSettings.systemPrompt,
        aiSettings.responseMode
      );
      if (attachments && attachments.length > 0 && llmMessages.length > 0) {
        const encodedImages = attachments
          .map((a) => a.dataUrl.split(',')[1] || '')
          .filter(Boolean);
        if (encodedImages.length > 0) {
          llmMessages[llmMessages.length - 1] = {
            ...llmMessages[llmMessages.length - 1],
            images: encodedImages,
          };
        }
      }

      const controller = new AbortController();
      ollamaAbortRef.current = controller;
      const preferred = aiSettings.customOllamaModel.trim().toLowerCase();
      const targetModel =
        (preferred &&
          ollamaModels.find((m) => m.toLowerCase() === preferred)) ||
        (preferred &&
          ollamaModels.find((m) => m.toLowerCase().includes(preferred))) ||
        ollamaModels.find((m) => m.toLowerCase().startsWith('qwen2.5-coder:7b')) ||
        ollamaModels.find((m) => m.toLowerCase().includes('qwen2.5-coder')) ||
        aiSettings.customOllamaModel ||
        'qwen2.5-coder:7b';

      try {
        const finalAnswer = await streamOllamaChat({
          baseUrl: ollamaUrl,
          model: targetModel,
          messages: llmMessages,
          temperature: aiSettings.temperature,
          maxTokens: getFastResponseTokenBudget(query, aiSettings),
          onToken: (partial) => setStreamingText(partial),
          signal: controller.signal,
        });
        const assistantMsg: ChatMessage = {
          id: `msg-a-${Date.now() + 1}`,
          role: 'assistant',
          content: finalAnswer || 'Generation stopped.',
          createdAt: Date.now() + 1,
          citations: rag.citations,
          extractedMetrics: rag.extractedMetrics,
          keyThemes: rag.keyThemes,
          suggestedFollowUps: [
            'Explain this further',
            'Make it shorter',
            '/code Write unit tests for this',
          ],
          intent: 'general',
          scopedDocNames: selectedDocs.map((d) => d.name),
          engineLabel: `Qwen 2.5 Coder (${targetModel})`,
        };
        setStreamingText(null);
        setIsGenerating(false);
        await commitSessionUpdate(targetSessionId, query, (prev) => [
          ...prev,
          assistantMsg,
        ]);
        return;
      } catch (err) {
        setStreamingText(null);
        setIsGenerating(false);
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        setStatusError(
          err instanceof Error
            ? `${err.message} — using Built-in Edge AI fallback.`
            : 'Local Ollama unavailable — using Built-in Edge AI fallback.'
        );
      }
    }

    const useBrowserNeural =
      selectedEngine !== 'builtin-edge' &&
      selectedEngine !== 'ollama:qwen2.5-coder:7b' &&
      neuralStatus === 'ready' &&
      llmBridgeRef.current;

    if (useBrowserNeural) {
      setIsGenerating(true);
      setStreamingText('');
      const rag = retrieveContextForQuery(query, selectedDocs, allChunks, getRetrievalLimit(aiSettings.responseMode));
      const llmMessages = buildLlmMessages(
        query,
        priorHistory,
        rag.contextBlock,
        selectedDocs,
        aiSettings.systemPrompt,
        aiSettings.responseMode
      );
      const engineLabel =
        LOCAL_AI_MODELS.find((m) => m.id === selectedEngine)?.label ||
        'On-Device LLM';

      try {
        const finalAnswer = await llmBridgeRef.current!.generate(
          llmMessages,
          (partial) => setStreamingText(partial),
          {
            maxNewTokens: getFastResponseTokenBudget(query, aiSettings),
            temperature: aiSettings.temperature,
          }
        );
        const assistantMsg: ChatMessage = {
          id: `msg-a-${Date.now() + 1}`,
          role: 'assistant',
          content:
            finalAnswer || 'Generation stopped before producing output.',
          createdAt: Date.now() + 1,
          citations: rag.citations,
          extractedMetrics: rag.extractedMetrics,
          keyThemes: rag.keyThemes,
          suggestedFollowUps: ['Make it shorter', 'Write an email summary'],
          intent: 'general',
          scopedDocNames: selectedDocs.map((d) => d.name),
          engineLabel,
        };
        setStreamingText(null);
        setIsGenerating(false);
        await commitSessionUpdate(targetSessionId, query, (prev) => [
          ...prev,
          assistantMsg,
        ]);
        return;
      } catch (err) {
        setStreamingText(null);
        setIsGenerating(false);
        setStatusError(
          err instanceof Error
            ? `${err.message} — falling back to Built-in Edge AI.`
            : 'Neural generation error — falling back to Built-in Edge AI.'
        );
      }
    }

    const routed = routeOfflineQuery({
      query,
      selectedDocs,
      allChunks,
      history: priorHistory,
      settings: aiSettings,
      attachments,
    });

    const assistantMsg: ChatMessage = {
      id: `msg-a-${Date.now() + 1}`,
      role: 'assistant',
      content: routed.answer,
      createdAt: Date.now() + 1,
      citations: routed.citations,
      extractedMetrics: routed.extractedMetrics,
      keyThemes: routed.keyThemes,
      suggestedFollowUps: routed.suggestedFollowUps,
      intent: routed.intent,
      scopedDocNames: selectedDocs.map((d) => d.name),
      engineLabel: 'Cairn Edge AI',
    };

    await commitSessionUpdate(targetSessionId, query, (prev) => [
      ...prev,
      assistantMsg,
    ]);
  };

  const handleSendQuery = async (
    query: string,
    attachments?: ImageAttachment[]
  ) => {
    const userMsg: ChatMessage = {
      id: `msg-u-${Date.now()}`,
      role: 'user',
      content: query,
      createdAt: Date.now(),
      attachments,
    };

    const { sessionId, messages: updatedMsgs } = await commitSessionUpdate(
      activeSessionIdRef.current,
      query,
      (prev) => [...prev, userMsg]
    );
    const priorHistory = updatedMsgs.slice(0, -1);
    await generateAssistantResponse(
      query,
      sessionId,
      priorHistory,
      attachments
    );
  };

  const handleEditUserMessage = async (
    messageId: string,
    newContent: string
  ) => {
    if (!activeSession || isGenerating) return;
    const targetIdx = activeSession.messages.findIndex(
      (m) => m.id === messageId
    );
    if (targetIdx < 0) return;
    const original = activeSession.messages[targetIdx];
    const updatedUserMsg: ChatMessage = {
      ...original,
      content: newContent,
      createdAt: Date.now(),
    };
    const keptMessages = [
      ...activeSession.messages.slice(0, targetIdx),
      updatedUserMsg,
    ];
    const priorHistory = keptMessages.slice(0, -1);

    await commitSessionUpdate(activeSession.id, newContent, () => keptMessages);
    await generateAssistantResponse(
      newContent,
      activeSession.id,
      priorHistory,
      original.attachments
    );
  };

  const handleRegenerateMessage = async (assistantMessageId: string) => {
    if (!activeSession || isGenerating) return;
    const targetIdx = activeSession.messages.findIndex(
      (m) => m.id === assistantMessageId
    );
    if (targetIdx <= 0) return;

    let promptIdx = targetIdx - 1;
    while (promptIdx >= 0 && activeSession.messages[promptIdx].role !== 'user') {
      promptIdx -= 1;
    }
    if (promptIdx < 0) return;

    const targetUserMsg = activeSession.messages[promptIdx];
    const keptMessages = activeSession.messages.slice(0, promptIdx + 1);
    const priorHistory = keptMessages.slice(0, -1);

    await commitSessionUpdate(
      activeSession.id,
      targetUserMsg.content,
      () => keptMessages
    );
    await generateAssistantResponse(
      targetUserMsg.content,
      activeSession.id,
      priorHistory,
      targetUserMsg.attachments
    );
  };

  const handleGenerateMedia = async (
    kind: MediaKind,
    prompt: string,
    options?: {
      stylePreset?: ImageStylePreset;
      videoStyle?: VideoStylePreset;
      aspectRatio?: '16:9' | '1:1';
      durationSec?: number;
      highlights?: string[];
      postToChat?: boolean;
      sessionId?: string;
    }
  ) => {
    const postToChat = options?.postToChat ?? true;
    setIsGenerating(true);
    setStatusError(null);

    try {
      let artifact: MediaArtifact;
      const inferredIntent = inferMediaIntentFromPrompt(prompt);
      const effectiveImagePreset: ImageStylePreset =
        options?.stylePreset ??
        (inferredIntent === 'briefing' ? 'briefing' : 'artwork');
      const effectiveVideoStyle: VideoStylePreset =
        options?.videoStyle ??
        (inferredIntent === 'briefing' ? 'briefing' : 'scene');

      const needsDocSummary =
        kind === 'audio' ||
        (kind === 'image' &&
          (effectiveImagePreset === 'briefing' ||
            effectiveImagePreset === 'network' ||
            effectiveImagePreset === 'metrics')) ||
        (kind === 'video' && effectiveVideoStyle === 'briefing');

      const summaryContext = needsDocSummary
        ? analyzeDocumentsLocally(
            prompt || 'summarize key findings and metrics',
            selectedDocs,
            allChunks
          )
        : null;

      const cleanDisplayTitle =
        prompt.trim().length > 0
          ? prompt.trim().length > 64 && summaryContext
            ? summaryContext.briefingTitle
            : prompt.trim()
          : summaryContext?.briefingTitle || 'Local Visual Creation';

      if (kind === 'image') {
        const isCreativeImg =
          effectiveImagePreset === 'artwork' || effectiveImagePreset === 'poster';
        setGenerationLabel(
          isCreativeImg
            ? 'Rendering local PNG scene...'
            : 'Rendering local PNG infographic...'
        );
        artifact = await generateLocalImageArtifact({
          prompt: cleanDisplayTitle,
          docs: isCreativeImg ? [] : selectedDocs,
          stylePreset: effectiveImagePreset,
          aspectRatio: options?.aspectRatio ?? '16:9',
          highlights:
            options?.highlights && options.highlights.length > 0
              ? options.highlights
              : summaryContext?.briefingBullets,
          ollamaConfig: {
            baseUrl: ollamaUrl,
            model: aiSettings.customOllamaModel || 'qwen2.5-coder:7b',
            connected: ollamaStatus === 'connected',
          },
        });
      } else if (kind === 'audio') {
        setGenerationLabel('Synthesizing local WAV audio briefing...');
        const script =
          prompt.length > 60
            ? prompt
            : `${summaryContext?.briefingTitle || cleanDisplayTitle}. ${(
                summaryContext?.briefingBullets ?? []
              )
                .slice(0, 3)
                .join(' ')}`;
        artifact = await generateLocalAudioArtifact({
          title: `Audio Brief: ${cleanDisplayTitle}`,
          scriptText: script,
          docs: selectedDocs,
          durationSec: options?.durationSec ?? 5,
        });
      } else {
        const isCreativeVid =
          effectiveVideoStyle === 'scene' || effectiveVideoStyle === 'motion';
        setGenerationLabel(
          isCreativeVid
            ? 'Rendering animated WebM video (0%)...'
            : 'Encoding local WebM video briefing (0%)...'
        );
        const slides = isCreativeVid
          ? [
              { heading: cleanDisplayTitle, body: prompt.trim() || cleanDisplayTitle },
              {
                heading: cleanDisplayTitle,
                body: 'Generated locally on device · WebM 24 fps',
              },
            ]
          : [
              {
                heading: summaryContext?.briefingTitle || cleanDisplayTitle,
                body:
                  selectedDocs.length > 0
                    ? `Local synthesis across ${selectedDocs
                        .map((d) => d.name)
                        .join(', ')}.`
                    : cleanDisplayTitle,
              },
              ...(summaryContext?.briefingBullets ?? [])
                .slice(0, 3)
                .map((b, idx) => ({
                  heading: `Key Finding 0${idx + 1}`,
                  body: b,
                })),
            ];
        artifact = await generateLocalVideoArtifact({
          title:
            effectiveVideoStyle === 'briefing'
              ? `Video Recap: ${cleanDisplayTitle}`
              : cleanDisplayTitle,
          slides,
          docs: isCreativeVid ? [] : selectedDocs,
          videoStyle: effectiveVideoStyle,
          durationSec: options?.durationSec ?? 4,
          onProgress: (pct) =>
            setGenerationLabel(
              isCreativeVid
                ? `Rendering animated WebM video (${pct}%)...`
                : `Encoding local WebM video briefing (${pct}%)...`
            ),
          onFramePreview: (frameUrl) => setLivePreviewFrame(frameUrl),
        });
      }

      await saveMediaToVault(artifact);
      setMedia((prev) => [artifact, ...prev]);

      if (postToChat) {
        const mediaMsg: ChatMessage = {
          id: `msg-m-${Date.now()}`,
          role: 'assistant',
          content:
            artifact.sourceDocIds.length > 0
              ? `Generated ${kind} artifact locally from ${
                  artifact.sourceDocIds.length
                } selected document${
                  artifact.sourceDocIds.length > 1 ? 's' : ''
                }.`
              : `Generated ${kind} "${artifact.title}" locally on device.`,
          createdAt: Date.now(),
          mediaIds: [artifact.id],
          intent: 'media',
          scopedDocNames:
            artifact.sourceDocIds.length > 0
              ? selectedDocs.map((d) => d.name)
              : [],
          engineLabel: 'Cairn Local Media',
        };
        await commitSessionUpdate(
          options?.sessionId ?? activeSessionIdRef.current,
          cleanDisplayTitle,
          (prev) => [...prev, mediaMsg]
        );
      }
    } catch (err) {
      setStatusError(
        err instanceof Error ? err.message : 'Local media generation failed.'
      );
    } finally {
      setIsGenerating(false);
      setGenerationLabel('');
      setLivePreviewFrame(null);
    }
  };

  const handleUploadLocalMedia = async (file: File) => {
    setIsGenerating(true);
    setStatusError(null);
    setGenerationLabel(`Analyzing ${file.name} locally...`);

    try {
      const isVideo =
        file.type.startsWith('video/') || /\.(mp4|webm|mov)$/i.test(file.name);
      const artifact = isVideo
        ? await analyzeLocalVideoFile(file)
        : await analyzeLocalAudioFile(file);

      await saveMediaToVault(artifact);
      setMedia((prev) => [artifact, ...prev]);

      const msg: ChatMessage = {
        id: `msg-m-${Date.now()}`,
        role: 'assistant',
        content: `Processed local ${artifact.kind} file "${file.name}" on-device (${
          artifact.durationSec ? `${artifact.durationSec}s` : 'metadata ready'
        }).`,
        createdAt: Date.now(),
        mediaIds: [artifact.id],
        intent: 'media',
        engineLabel: 'Cairn Local Media',
      };
      await commitSessionUpdate(
        activeSessionIdRef.current,
        `Media: ${file.name}`,
        (prev) => [...prev, msg]
      );
    } catch (err) {
      setStatusError(
        err instanceof Error ? err.message : `Could not analyze ${file.name}.`
      );
    } finally {
      setIsGenerating(false);
      setGenerationLabel('');
    }
  };

  const handleDeleteMedia = async (id: string) => {
    await deleteMediaFromVault(id);
    setMedia((prev) => prev.filter((m) => m.id !== id));
  };

  const handleOpenCitation = (citation: CitationRef) => {
    setInspectorDocId(citation.documentId);
    setHighlightedChunkId(citation.chunkId);
    setActiveTab('inspector');
  };

  const handleClearChat = async () => {
    if (!activeSessionIdRef.current) return;
    await handleDeleteSession(activeSessionIdRef.current);
  };

  const handleExportThread = () => {
    if (!activeSession || activeSession.messages.length === 0) return;
    const lines: string[] = [
      `# ${activeSession.title}`,
      '',
      ...activeSession.messages.flatMap((m) => [
        `## ${m.role === 'user' ? 'User' : m.engineLabel || 'Cairn AI'}`,
        '',
        m.content,
        '',
      ]),
    ];
    const blob = new Blob([lines.join('\n')], {
      type: 'text/markdown;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeName = activeSession.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    link.href = url;
    link.download = `${safeName || 'cairn-chat'}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-screen w-full flex overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <SidebarVault
        documents={documents}
        sessions={sessions}
        activeSessionId={activeSessionId}
        activeTab={activeTab}
        theme={theme}
        onToggleTheme={() =>
          setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))
        }
        onNewChat={handleNewChat}
        onSelectSession={handleSelectSession}
        onRenameSession={handleRenameSession}
        onTogglePinSession={handleTogglePinSession}
        onDeleteSession={handleDeleteSession}
        onSelectTab={setActiveTab}
        onUploadFiles={handleUploadFiles}
        onToggleDocument={handleToggleDocument}
        onSelectAll={handleSelectAll}
        onDeleteDocument={handleDeleteDocument}
        onInspectDocument={(id) => {
          setInspectorDocId(id);
          setHighlightedChunkId(null);
          setActiveTab('inspector');
        }}
        onRestoreSamples={handleRestoreSamples}
        onWipeVault={handleWipeVault}
        isUploading={isUploading}
        mediaCount={media.length}
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0 h-full">
        <TopBar
          activeTab={activeTab}
          activeSessionTitle={activeSession?.title}
          selectedDocCount={selectedDocs.length}
          totalDocCount={documents.length}
          isUploading={isUploading}
          theme={theme}
          onToggleTheme={() =>
            setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))
          }
          onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
          onUploadFiles={handleUploadFiles}
          onSelectTab={setActiveTab}
        />

        {statusError && (
          <div
            role="alert"
            className="flex items-center justify-between gap-3 px-4 sm:px-6 py-2.5 bg-red-50 dark:bg-red-950/60 border-b border-red-200 dark:border-red-900 text-xs text-red-800 dark:text-red-200 shrink-0"
          >
            <span>{statusError}</span>
            <button
              type="button"
              onClick={() => setStatusError(null)}
              className="font-semibold hover:underline shrink-0 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {!isHydrated ? (
          <main className="flex-1 flex items-center justify-center p-8">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Opening local IndexedDB vault...
            </p>
          </main>
        ) : (
          <main className="flex-1 flex flex-col min-h-0">
            {activeTab === 'chat' && (
              <ChatWorkspace
                messages={messages}
                mediaMap={mediaMap}
                selectedDocs={selectedDocs}
                isGenerating={isGenerating}
                generationLabel={generationLabel}
                livePreviewFrame={livePreviewFrame}
                streamingText={streamingText}
                selectedEngine={selectedEngine}
                neuralStatus={neuralStatus}
                neuralProgress={neuralProgress}
                neuralStatusMessage={neuralStatusMessage}
                cachedModelIds={cachedModelIds}
                ollamaStatus={ollamaStatus}
                ollamaModels={ollamaModels}
                aiSettings={aiSettings}
                onOpenSettings={() => setSettingsModalOpen(true)}
                onSelectEngine={handleSelectEngine}
                onLoadNeuralModel={handleLoadNeuralModel}
                onStopGeneration={handleStopGeneration}
                onSendQuery={handleSendQuery}
                onEditUserMessage={handleEditUserMessage}
                onRegenerateMessage={handleRegenerateMessage}
                onExportThread={handleExportThread}
                onUploadDocuments={handleUploadFiles}
                onGenerateMediaFromPrompt={(kind, prompt, opts) =>
                  handleGenerateMedia(kind, prompt, { ...opts, postToChat: true })
                }
                onUploadLocalMedia={handleUploadLocalMedia}
                onOpenCitation={handleOpenCitation}
                onClearChat={handleClearChat}
                onDeleteMedia={handleDeleteMedia}
              />
            )}

            {activeTab === 'inspector' && (
              <DocumentInspector
                documents={documents}
                chunks={allChunks}
                activeDocId={inspectorDocId}
                highlightedChunkId={highlightedChunkId}
                onSelectDoc={(id) => {
                  setInspectorDocId(id);
                  setHighlightedChunkId(null);
                }}
                onAskAboutDoc={(docName) => {
                  setActiveTab('chat');
                  handleSendQuery(`Summarize ${docName}`);
                }}
              />
            )}

            {activeTab === 'media' && (
              <MediaStudio
                media={media}
                selectedDocs={selectedDocs}
                isGenerating={isGenerating}
                generationLabel={generationLabel}
                livePreviewFrame={livePreviewFrame}
                onGenerateMedia={(kind, prompt, opts) =>
                  handleGenerateMedia(kind, prompt, {
                    ...opts,
                    postToChat: false,
                  })
                }
                onUploadLocalMedia={handleUploadLocalMedia}
                onDeleteMedia={handleDeleteMedia}
              />
            )}
          </main>
        )}
      </div>

      <AiSettingsModal
        open={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
        settings={aiSettings}
        onSaveSettings={handleSaveSettings}
        selectedEngine={selectedEngine}
        onSelectEngine={handleSelectEngine}
        ollamaUrl={ollamaUrl}
        ollamaStatus={ollamaStatus}
        ollamaModels={ollamaModels}
        onChangeOllamaUrl={setOllamaUrl}
        onCheckOllama={() => handleCheckOllama()}
        neuralStatus={neuralStatus}
        neuralProgress={neuralProgress}
        neuralStatusMessage={neuralStatusMessage}
        cachedModelIds={cachedModelIds}
        onLoadNeuralModel={handleLoadNeuralModel}
      />
    </div>
  );
}
