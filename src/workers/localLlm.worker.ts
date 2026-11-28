import {
  pipeline,
  env,
  InterruptableStoppingCriteria,
  TextStreamer,
} from '@huggingface/transformers';
import { QWEN_MODEL_ID } from '../types/workspace';

// Transformers.js keeps model files in the browser Cache Storage so the
// same model can be loaded again without a network connection.
env.allowLocalModels = false;
env.useBrowserCache = true;
// Enable SIMD kernels when the ONNX WASM backend exposes the optional setting.
if (env.backends.onnx.wasm) {
  env.backends.onnx.wasm.simd = true;
}

type WorkerRequest =
  | { type: 'load'; modelId: string }
  | {
      type: 'generate';
      requestId: string;
      messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
      maxNewTokens?: number;
      temperature?: number;
    }
  | { type: 'interrupt' };

let loadedModelId: string | null = null;
let generator: any = null;
let activeBackend: 'webgpu' | 'wasm' = 'wasm';
const stoppingCriteria = new InterruptableStoppingCriteria();

let legacyCacheCleanup: Promise<void> | null = null;

async function removeLegacyModelCacheEntries(): Promise<void> {
  if (!legacyCacheCleanup) {
    legacyCacheCleanup = (async () => {
      const legacyNames = [
        'Qwen2.5-Coder-0.5B-Instruct',
        'Qwen2.5-Coder-1.5B-Instruct',
        'Qwen2.5-Coder-7B-Instruct',
      ];
      try {
        for (const cacheName of await caches.keys()) {
          const cache = await caches.open(cacheName);
          const requests = await cache.keys();
          await Promise.all(
            requests
              .filter((request) => {
                let url = request.url;
                try { url = decodeURIComponent(url); } catch { /* use original URL */ }
                return legacyNames.some((name) => url.includes(name));
              })
              .map((request) => cache.delete(request))
          );
        }
      } catch {
        // Old model cache cleanup is best-effort.
      }
    })();
  }
  await legacyCacheCleanup;
}

async function detectWebGpu(): Promise<boolean> {
  try {
    const nav = self.navigator as Navigator & {
      gpu?: { requestAdapter: () => Promise<unknown | null> };
    };
    if (!nav.gpu) return false;
    return Boolean(await nav.gpu.requestAdapter());
  } catch {
    return false;
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown local model runtime error';
  }
}

async function disposeCurrentGenerator(): Promise<void> {
  const current = generator;
  generator = null;
  loadedModelId = null;
  if (current && typeof current.dispose === 'function') {
    try {
      await current.dispose();
    } catch {
      // Releasing the worker below also releases any remaining runtime memory.
    }
  }
}

self.addEventListener('message', async (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;

  if (msg.type === 'interrupt') {
    stoppingCriteria.interrupt();
    return;
  }

  if (msg.type === 'load') {
    try {
      if (loadedModelId === msg.modelId && generator) {
        self.postMessage({
          type: 'ready',
          modelId: msg.modelId,
          backend: activeBackend,
        });
        return;
      }

      await disposeCurrentGenerator();
      stoppingCriteria.reset();

      if (msg.modelId !== QWEN_MODEL_ID) {
        throw new Error('Cairn supports only the Qwen 2.5 Coder 3B model.');
      }

      await removeLegacyModelCacheEntries();
      const hasWebGpu = await detectWebGpu();
      const backends: Array<'webgpu' | 'wasm'> = hasWebGpu
        ? ['webgpu', 'wasm']
        : ['wasm'];

      const progressMap = new Map<string, number>();
      const onProgress = (info: {
        status?: string;
        file?: string;
        progress?: number;
      }) => {
        if (typeof info.progress !== 'number' || !info.file) return;
        progressMap.set(info.file, info.progress);
        const values = Array.from(progressMap.values());
        const average =
          values.reduce((sum, value) => sum + value, 0) /
          Math.max(1, values.length);
        self.postMessage({
          type: 'progress',
          progress: Math.min(99, Math.round(average)),
          file: info.file,
        });
      };

      let lastLoadError: unknown = null;
      for (let index = 0; index < backends.length; index += 1) {
        const backend = backends[index];
        try {
          self.postMessage({
            type: 'status',
            message:
              backend === 'webgpu'
                ? 'Connecting Qwen 3B with WebGPU...'
                : hasWebGpu
                  ? 'WebGPU is unavailable for this model; continuing with CPU/WASM...'
                  : 'Loading Qwen 3B on CPU/WASM...',
            progress: index === 0 ? 2 : 90,
          });

          const loaded = await pipeline('text-generation', msg.modelId, {
            // Use the published Qwen 3B quantized ONNX Q4 weights.
            dtype: 'q4',
            device: backend,
            progress_callback: onProgress,
          });

          generator = loaded;
          loadedModelId = msg.modelId;
          activeBackend = backend;

          self.postMessage({
            type: 'ready',
            modelId: msg.modelId,
            backend,
          });
          return;
        } catch (error) {
          lastLoadError = error;
          generator = null;
          loadedModelId = null;

          if (index < backends.length - 1) {
            self.postMessage({
              type: 'status',
              message: `WebGPU could not start Qwen 3B. Retrying with CPU/WASM: ${errorMessage(error)}`,
              progress: 90,
            });
          }
        }
      }

      throw new Error(
        `Unable to load ${msg.modelId}. ${errorMessage(lastLoadError)}`
      );
    } catch (error) {
      await disposeCurrentGenerator();
      self.postMessage({
        type: 'error',
        error: errorMessage(error),
      });
    }
    return;
  }

  if (msg.type === 'generate') {
    if (!generator || loadedModelId === null) {
      self.postMessage({
        type: 'gen-error',
        requestId: msg.requestId,
        error: 'The Qwen model is not loaded. Load the cached model from AI Settings first.',
      });
      return;
    }

    try {
      stoppingCriteria.reset();
      let accumulated = '';
      let pendingText = '';
      let flushTimer: ReturnType<typeof setTimeout> | null = null;
      const flushStream = () => {
        if (flushTimer !== null) {
          clearTimeout(flushTimer);
          flushTimer = null;
        }
        if (!pendingText) return;
        const chunk = pendingText;
        pendingText = '';
        self.postMessage({
          type: 'token',
          requestId: msg.requestId,
          text: chunk,
        });
      };
      const streamer = new TextStreamer(generator.tokenizer, {
        skip_prompt: true,
        skip_special_tokens: true,
        callback_function: (text: string) => {
          accumulated += text;
          pendingText += text;
          // Batch tiny token events so the UI does not re-render for every token.
          if (flushTimer === null) {
            flushTimer = setTimeout(flushStream, 40);
          }
        },
      });

      const temperature = msg.temperature ?? 0.2;
      const output = await generator(msg.messages, {
        max_new_tokens: msg.maxNewTokens ?? 192,
        do_sample: temperature > 0.05,
        ...(temperature > 0.05 ? { temperature } : {}),
        streamer,
        stopping_criteria: [stoppingCriteria],
      });
      flushStream();

      let finalText = accumulated.trim();
      if (!finalText) {
        const generated = output?.[0]?.generated_text;
        const finalMessage = Array.isArray(generated)
          ? generated[generated.length - 1]
          : generated;
        finalText =
          typeof finalMessage === 'string'
            ? finalMessage.trim()
            : typeof finalMessage?.content === 'string'
              ? finalMessage.content.trim()
              : '';
      }

      self.postMessage({
        type: 'done',
        requestId: msg.requestId,
        text: finalText,
      });
    } catch (error) {
      self.postMessage({
        type: 'gen-error',
        requestId: msg.requestId,
        error: errorMessage(error),
      });
    }
  }
});
