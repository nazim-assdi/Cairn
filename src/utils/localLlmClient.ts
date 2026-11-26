import { AiEngineId, NeuralModelStatus } from '../types/workspace';

export interface LocalLlmStateEvent {
  status: NeuralModelStatus;
  modelId: AiEngineId;
  backend?: 'webgpu' | 'wasm';
  progress: number;
  message?: string;
}

type WorkerOutMessage =
  | { type: 'status'; message: string; progress: number }
  | { type: 'progress'; progress: number; file?: string }
  | { type: 'ready'; modelId: string; backend: 'webgpu' | 'wasm' }
  | { type: 'error'; error: string }
  | { type: 'token'; requestId: string; text: string }
  | { type: 'done'; requestId: string; text: string }
  | { type: 'gen-error'; requestId: string; error: string };

const CACHED_MODELS_KEY = 'cairn_cached_neural_models_v1';

export function getCachedNeuralModelIds(): string[] {
  try {
    const raw = localStorage.getItem(CACHED_MODELS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function markModelCached(modelId: string) {
  try {
    const existing = new Set(getCachedNeuralModelIds());
    existing.add(modelId);
    localStorage.setItem(CACHED_MODELS_KEY, JSON.stringify(Array.from(existing)));
  } catch {
    // Ignore
  }
}

export class LocalLlmBridge {
  private worker: Worker | null = null;
  private onState: (event: LocalLlmStateEvent) => void;
  private currentModelId: AiEngineId = 'builtin-edge';
  private activeGen: {
    requestId: string;
    onToken: (fullText: string) => void;
    resolve: (finalText: string) => void;
    reject: (err: Error) => void;
  } | null = null;

  constructor(onState: (event: LocalLlmStateEvent) => void) {
    this.onState = onState;
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(
      new URL('../workers/localLlm.worker.ts', import.meta.url),
      { type: 'module' }
    );

    worker.addEventListener('message', (event: MessageEvent<WorkerOutMessage>) => {
      const msg = event.data;

      if (msg.type === 'status') {
        this.onState({
          status: 'loading',
          modelId: this.currentModelId,
          progress: msg.progress,
          message: msg.message,
        });
      } else if (msg.type === 'progress') {
        this.onState({
          status: 'loading',
          modelId: this.currentModelId,
          progress: msg.progress,
          message: msg.file ? `Caching ${msg.file.split('/').pop()} (${msg.progress}%)` : `Caching model (${msg.progress}%)`,
        });
      } else if (msg.type === 'ready') {
        markModelCached(msg.modelId);
        this.onState({
          status: 'ready',
          modelId: msg.modelId as AiEngineId,
          backend: msg.backend,
          progress: 100,
          message: `Ready offline (${msg.backend.toUpperCase()})`,
        });
      } else if (msg.type === 'error') {
        this.onState({
          status: 'error',
          modelId: this.currentModelId,
          progress: 0,
          message: msg.error,
        });
      } else if (msg.type === 'token' && this.activeGen?.requestId === msg.requestId) {
        this.activeGen.onToken(msg.text);
      } else if (msg.type === 'done' && this.activeGen?.requestId === msg.requestId) {
        const gen = this.activeGen;
        this.activeGen = null;
        gen.resolve(msg.text);
      } else if (msg.type === 'gen-error' && this.activeGen?.requestId === msg.requestId) {
        const gen = this.activeGen;
        this.activeGen = null;
        gen.reject(new Error(msg.error));
      }
    });

    this.worker = worker;
    return worker;
  }

  loadModel(modelId: AiEngineId) {
    if (modelId === 'builtin-edge') {
      this.currentModelId = 'builtin-edge';
      this.onState({
        status: 'ready',
        modelId: 'builtin-edge',
        progress: 100,
        message: 'Instant Built-in Edge AI',
      });
      return;
    }

    this.currentModelId = modelId;
    this.onState({
      status: 'loading',
      modelId,
      progress: 1,
      message: 'Initializing on-device runtime...',
    });

    const worker = this.ensureWorker();
    worker.postMessage({ type: 'load', modelId });
  }

  generate(
    messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
    onToken: (fullText: string) => void,
    options?: { maxNewTokens?: number; temperature?: number }
  ): Promise<string> {
    const worker = this.ensureWorker();
    const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    return new Promise((resolve, reject) => {
      this.activeGen = { requestId, onToken, resolve, reject };
      worker.postMessage({
        type: 'generate',
        requestId,
        messages,
        maxNewTokens: options?.maxNewTokens ?? 768,
        temperature: options?.temperature ?? 0.2,
      });
    });
  }

  interrupt() {
    if (this.worker) {
      this.worker.postMessage({ type: 'interrupt' });
    }
  }

  dispose() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }
}
