import { AiEngineId, NeuralModelStatus, QWEN_MODEL_ID } from '../types/workspace';

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

export class LocalLlmBridge {
  private worker: Worker | null = null;
  private onState: (event: LocalLlmStateEvent) => void;
  private currentModelId: AiEngineId = QWEN_MODEL_ID;
  private readyModelId: AiEngineId | null = null;
  private activeGen: {
    requestId: string;
    text: string;
    onToken: (fullText: string) => void;
    resolve: (finalText: string) => void;
    reject: (err: Error) => void;
  } | null = null;

  constructor(onState: (event: LocalLlmStateEvent) => void) {
    this.onState = onState;
  }

  private reportError(message: string) {
    this.readyModelId = null;
    this.onState({
      status: 'error',
      modelId: this.currentModelId,
      progress: 0,
      message,
    });
  }

  private failActiveGeneration(message: string) {
    if (!this.activeGen) return;
    const generation = this.activeGen;
    this.activeGen = null;
    generation.reject(new Error(message));
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;

    let worker: Worker;
    try {
      worker = new Worker(
        new URL('../workers/localLlm.worker.ts', import.meta.url),
        { type: 'module' }
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to start the local AI worker.';
      this.reportError(message);
      throw new Error(message);
    }

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
          message: msg.file
            ? `Loading ${msg.file.split('/').pop()} (${msg.progress}%)`
            : `Loading model (${msg.progress}%)`,
        });
      } else if (msg.type === 'ready') {
        this.readyModelId = msg.modelId as AiEngineId;
        this.onState({
          status: 'ready',
          modelId: this.readyModelId,
          backend: msg.backend,
          progress: 100,
          message: `Ready offline (${msg.backend.toUpperCase()})`,
        });
      } else if (msg.type === 'error') {
        this.readyModelId = null;
        this.reportError(msg.error);
        this.failActiveGeneration(msg.error);
      } else if (msg.type === 'token' && this.activeGen?.requestId === msg.requestId) {
        this.activeGen.text += msg.text;
        this.activeGen.onToken(this.activeGen.text);
      } else if (msg.type === 'done' && this.activeGen?.requestId === msg.requestId) {
        const generation = this.activeGen;
        this.activeGen = null;
        generation.resolve(msg.text);
      } else if (msg.type === 'gen-error' && this.activeGen?.requestId === msg.requestId) {
        const generation = this.activeGen;
        this.activeGen = null;
        generation.reject(new Error(msg.error));
      }
    });

    worker.addEventListener('error', (event: ErrorEvent) => {
      const message = event.message || 'The local AI worker crashed while loading or running Qwen.';
      if (this.worker === worker) {
        this.worker.terminate();
        this.worker = null;
      }
      this.reportError(message);
      this.failActiveGeneration(message);
    });

    worker.addEventListener('messageerror', () => {
      const message = 'The local AI worker returned an unreadable message and was restarted.';
      if (this.worker === worker) {
        this.worker.terminate();
        this.worker = null;
      }
      this.reportError(message);
      this.failActiveGeneration(message);
    });

    this.worker = worker;
    return worker;
  }

  loadModel(modelId: AiEngineId) {
    this.failActiveGeneration('The model was changed while a response was generating.');
    this.currentModelId = modelId;
    this.readyModelId = null;
    this.onState({
      status: 'loading',
      modelId,
      progress: 1,
      message: 'Starting local model runtime...',
    });

    try {
      this.ensureWorker().postMessage({ type: 'load', modelId });
    } catch (error) {
      this.reportError(error instanceof Error ? error.message : 'Unable to start local model runtime.');
    }
  }

  generate(
    messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
    onToken: (fullText: string) => void,
    options?: { maxNewTokens?: number; temperature?: number }
  ): Promise<string> {
    if (this.readyModelId !== this.currentModelId) {
      return Promise.reject(
        new Error('Qwen 3B is still loading. Wait for the automatic download or cached-model connection to finish.')
      );
    }

    let worker: Worker;
    try {
      worker = this.ensureWorker();
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error('Unable to start Qwen worker.'));
    }

    if (this.activeGen) {
      return Promise.reject(new Error('A local Qwen response is already running.'));
    }

    const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    return new Promise((resolve, reject) => {
      this.activeGen = { requestId, text: '', onToken, resolve, reject };
      try {
        worker.postMessage({
          type: 'generate',
          requestId,
          messages,
          maxNewTokens: options?.maxNewTokens ?? 192,
          temperature: options?.temperature ?? 0.2,
        });
      } catch (error) {
        this.activeGen = null;
        reject(error instanceof Error ? error : new Error('Unable to send prompt to Qwen.'));
      }
    });
  }

  interrupt() {
    if (this.worker) {
      this.worker.postMessage({ type: 'interrupt' });
    }
  }

  dispose() {
    this.failActiveGeneration('Cairn closed the local AI runtime.');
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.readyModelId = null;
  }
}
