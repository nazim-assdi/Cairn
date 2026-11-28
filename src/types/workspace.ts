export type DocumentFormat = 'pdf' | 'docx' | 'txt';

export interface DocumentPage {
  pageNumber: number;
  label: string;
  text: string;
}

export interface VaultDocument {
  id: string;
  name: string;
  format: DocumentFormat;
  sizeBytes: number;
  uploadedAt: number;
  pageCount: number;
  wordCount: number;
  chunkCount: number;
  pages: DocumentPage[];
  selected: boolean;
  isSample?: boolean;
}

export interface DocumentChunk {
  id: string;
  documentId: string;
  documentName: string;
  format: DocumentFormat;
  pageNumber: number;
  pageLabel: string;
  chunkIndex: number;
  text: string;
  wordCount: number;
}

export interface CitationRef {
  id: string;
  chunkId: string;
  documentId: string;
  documentName: string;
  pageLabel: string;
  excerpt: string;
  score: number;
}

export type MediaKind = 'image' | 'audio' | 'video';

export type ImageStylePreset =
  | 'artwork'
  | 'poster'
  | 'briefing'
  | 'network'
  | 'metrics';

export type VideoStylePreset = 'scene' | 'motion' | 'briefing';

export interface MediaArtifact {
  id: string;
  kind: MediaKind;
  title: string;
  prompt: string;
  createdAt: number;
  mimeType: string;
  dataUrl: string;
  durationSec?: number;
  width?: number;
  height?: number;
  sizeBytes: number;
  sourceDocIds: string[];
  scriptText?: string;
  waveformPeaks?: number[];
  keyframes?: string[];
  stylePreset?: ImageStylePreset;
  videoStyle?: VideoStylePreset;
}

export interface ImageAttachment {
  id: string;
  name: string;
  dataUrl: string;
  width: number;
  height: number;
  sizeBytes: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
  citations?: CitationRef[];
  extractedMetrics?: string[];
  keyThemes?: string[];
  mediaIds?: string[];
  attachments?: ImageAttachment[];
  suggestedFollowUps?: string[];
  intent?: 'summary' | 'comparison' | 'metrics' | 'risks' | 'general' | 'media' | 'conversation';
  scopedDocNames?: string[];
  engineLabel?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  pinned?: boolean;
  messages: ChatMessage[];
}

export type WorkspaceTab = 'chat' | 'inspector' | 'media';
export type ComposerMode = 'chat' | 'image' | 'audio' | 'video';
export type ThemeMode = 'light' | 'dark';

export type AiPersonaId = 'assistant' | 'coder' | 'analyst' | 'bilingual';

export interface AiPersonaPreset {
  id: AiPersonaId;
  label: string;
  description: string;
  systemPrompt: string;
  defaultTemperature: number;
}

export const AI_PERSONAS: AiPersonaPreset[] = [
  {
    id: 'assistant',
    label: 'Complete AI Assistant',
    description: 'Balanced reasoning, coding, document Q&A, and media synthesis',
    systemPrompt:
      'You are Cairn, a complete private AI assistant running locally on the user device. Answer clearly, accurately, and directly in the same language the user writes in.',
    defaultTemperature: 0.3,
  },
  {
    id: 'coder',
    label: 'Senior Software Engineer',
    description: 'Clean production code, debugging, architecture, and TypeScript/Python helpers',
    systemPrompt:
      'You are Cairn powered by Qwen 2.5 Coder. Write clean, well-typed, production-ready code with concise explanations and edge-case handling.',
    defaultTemperature: 0.15,
  },
  {
    id: 'analyst',
    label: 'Document & Data Analyst',
    description: 'Strict citation grounding across PDF, DOCX, and TXT files',
    systemPrompt:
      'You are Cairn, an analytical document AI. Ground every factual claim strictly in the provided local documents and cite exact sources.',
    defaultTemperature: 0.1,
  },
  {
    id: 'bilingual',
    label: 'Bengali & English Tutor',
    description: 'Natural explanations in Bengali or English with step-by-step clarity',
    systemPrompt:
      'You are Cairn, a helpful bilingual AI assistant fluent in both Bengali and English. Explain concepts clearly step by step.',
    defaultTemperature: 0.4,
  },
];

export type AiResponseMode = 'fast' | 'balanced' | 'thinking';

export interface AiSettings {
  personaId: AiPersonaId;
  systemPrompt: string;
  responseMode: AiResponseMode;
  temperature: number;
  maxTokens: number;
}

export const DEFAULT_AI_SETTINGS: AiSettings = {
  personaId: 'assistant',
  systemPrompt: AI_PERSONAS[0].systemPrompt,
  responseMode: 'fast',
  temperature: 0.3,
  maxTokens: 1024,
};

export const QWEN_MODEL_ID = 'onnx-community/Qwen2.5-Coder-3B-Instruct' as const;
export type AiEngineId = typeof QWEN_MODEL_ID;

export type NeuralModelStatus = 'idle' | 'loading' | 'ready' | 'error';
export type OllamaStatus = 'unchecked' | 'checking' | 'connected' | 'offline';
