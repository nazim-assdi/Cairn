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
  | { type: 'fallback'; reason: string; requestId?: string }
  | { type: 'error'; error: string }
  | { type: 'token'; requestId: string; text: string }
  | { type: 'done'; requestId: string; text: string }
  | { type: 'gen-error'; requestId: string; error: string };

type BackendPreference = 'auto' | 'wasm';

interface ActiveGeneration {
  requestId: string;
  text: string;
  onToken: (fullText: string) => void;
  resolve: (finalText: string) => void;
  reject: (err: Error) => void;
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
  maxNewTokens: number;
  temperature: number;
  sent: boolean;
}

export class LocalLlmBridge {
  private worker: Worker | null = null;
  private onState: (event: LocalLlmStateEvent) => void;
  private currentModelId: AiEngineId = QWEN_MODEL_ID;
  private readyModelId: AiEngineId | null = null;
  private backendPreference: BackendPreference = 'auto';
  private activeBackend: 'webgpu' | 'wasm' | null = null;
  private activeGen: ActiveGeneration | null = null;

  constructor(onState: (event: LocalLlmStateEvent) => void) {
    this.onState = onState;
  }

  private reportError(message: string) {
    this.readyModelId = null;
    this.activeBackend = null;
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

  private sendActiveGeneration(worker: Worker) {
    const generation = this.activeGen;
    if (!generation || generation.sent || this.worker !== worker) return;

    generation.sent = true;
    generation.text = '';
    try {
      worker.postMessage({
        type: 'generate',
        requestId: generation.requestId,
        messages: generation.messages,
        maxNewTokens: generation.maxNewTokens,
        temperature: generation.temperature,
      });
    } catch (error) {
      generation.sent = false;
      this.activeGen = null;
      generation.reject(
        error instanceof Error ? error : new Error('Unable to send prompt to Qwen.')
      );
    }
  }

  private switchToWasm(worker: Worker, reason: string, requestId?: string) {
    if (this.worker !== worker) return;

    if (this.backendPreference === 'wasm') {
      worker.terminate();
      this.worker = null;
      const message = 'Qwen CPU/WASM fallback failed: ' + reason;
      this.reportError(message);
      this.failActiveGeneration(message);
      return;
    }

    if (requestId && this.activeGen && this.activeGen.requestId !== requestId) {
      this.failActiveGeneration('The WebGPU worker failed while another request was active.');
    } else if (this.activeGen) {
      // Keep the original Promise alive and replay this prompt once on WASM.
      this.activeGen.text = '';
      this.activeGen.sent = false;
    }

    this.backendPreference = 'wasm';
    this.readyModelId = null;
    this.activeBackend = null;
    worker.terminate();
    this.worker = null;

    this.onState({
      status: 'loading',
      modelId: this.currentModelId,
      progress: 90,
      message: 'WebGPU failed its runtime test. Switching to a clean CPU/WASM worker...',
    });

    try {
      const fallbackWorker = this.ensureWorker();
      fallbackWorker.postMessage({
        type: 'load',
        modelId: this.currentModelId,
        backend: 'wasm',
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to start CPU/WASM fallback.';
      this.reportError(message);
      this.failActiveGeneration(message);
    }
  }

  private handleWorkerFailure(worker: Worker, message: string) {
    if (this.worker !== worker) return;
    if (this.backendPreference === 'auto') {
      this.switchToWasm(worker, message);
      return;
    }

    worker.terminate();
    this.worker = null;
    this.reportError(message);
    this.failActiveGeneration(message);
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
      if (this.worker !== worker) return;
      const msg = event.data;

      if (msg.type === 'fallback') {
        this.switchToWasm(worker, msg.reason, msg.requestId);
      } else if (msg.type === 'status') {
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
            ? 'Loading ' + msg.file.split('/').pop() + ' (' + msg.progress + '%)'
            : 'Loading model (' + msg.progress + '%)',
        });
      } else if (msg.type === 'ready') {
        this.readyModelId = msg.modelId as AiEngineId;
        this.activeBackend = msg.backend;
        this.onState({
          status: 'ready',
          modelId: this.readyModelId,
          backend: msg.backend,
          progress: 100,
          message: 'Ready offline (' + msg.backend.toUpperCase() + ')',
        });
        // If a WebGPU generation failed, transparently replay it after the
        // clean WASM worker has passed its own load and smoke test.
        this.sendActiveGeneration(worker);
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
      const message =
        event.message || 'The local AI worker crashed while loading or running Qwen.';
      this.handleWorkerFailure(worker, message);
    });

    worker.addEventListener('messageerror', () => {
      this.handleWorkerFailure(
        worker,
        'The local AI worker returned an unreadable message and was restarted.'
      );
    });

    this.worker = worker;
    return worker;
  }

  loadModel(modelId: AiEngineId) {
    this.failActiveGeneration('The model was changed while a response was generating.');
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }

    this.backendPreference = 'auto';
    this.activeBackend = null;
    this.currentModelId = modelId;
    this.readyModelId = null;
    this.onState({
      status: 'loading',
      modelId,
      progress: 1,
      message: 'Checking WebGPU, then CPU/WASM if needed...',
    });

    try {
      this.ensureWorker().postMessage({
        type: 'load',
        modelId,
        backend: 'auto',
      });
    } catch (error) {
      this.reportError(
        error instanceof Error ? error.message : 'Unable to start local model runtime.'
      );
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
      return Promise.reject(
        error instanceof Error ? error : new Error('Unable to start Qwen worker.')
      );
    }

    if (this.activeGen) {
      return Promise.reject(new Error('A local Qwen response is already running.'));
    }

    const requestId = 'req-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    return new Promise((resolve, reject) => {
      this.activeGen = {
        requestId,
        text: '',
        onToken,
        resolve,
        reject,
        messages,
        maxNewTokens: options?.maxNewTokens ?? 192,
        temperature: options?.temperature ?? 0.2,
        sent: false,
      };
      this.sendActiveGeneration(worker);
    });
  }

  interrupt() {
    if (this.worker) {
      try {
        this.worker.postMessage({ type: 'interrupt' });
      } catch {
        // The worker may be shutting down during a provider fallback.
      }
    }
  }

  dispose() {
    this.failActiveGeneration('Cairn closed the local AI runtime.');
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.readyModelId = null;
    this.activeBackend = null;
  }
}
