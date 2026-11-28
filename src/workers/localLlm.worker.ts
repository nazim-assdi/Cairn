import {
  pipeline,
  env,
  InterruptableStoppingCriteria,
  TextStreamer,
} from '@huggingface/transformers';
import { QWEN_MODEL_ID } from '../types/workspace';

// Keep model files in persistent browser Cache Storage across app launches.
env.allowLocalModels = false;
env.useBrowserCache = true;
if (env.backends.onnx.wasm) {
  env.backends.onnx.wasm.simd = true;
}

type WorkerRequest =
  | { type: 'load'; modelId: string; backend?: 'auto' | 'wasm' }
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
        // Legacy model cleanup is best-effort.
      }
    })();
  }
  await legacyCacheCleanup;
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

async function hasWebGpuAdapter(): Promise<boolean> {
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

function announceWebGpuFallback(reason: string, requestId?: string): void {
  self.postMessage({
    type: 'fallback',
    reason,
    requestId,
  });
}

async function loadQwenWithWasm(
  modelId: string,
  onProgress: (info: { status?: string; file?: string; progress?: number }) => void
): Promise<void> {
  self.postMessage({
    type: 'status',
    message: 'WebGPU is unavailable or failed its test. Switching to CPU/WASM...',
    progress: 90,
  });

  const loaded = await pipeline('text-generation', modelId, {
    dtype: 'q4',
    device: 'wasm',
    progress_callback: onProgress,
  });

  // A one-token smoke test verifies the runtime before the UI reports Ready.
  await loaded(
    [{ role: 'user', content: 'Reply with OK.' }],
    { max_new_tokens: 1, do_sample: false }
  );

  generator = loaded;
  loadedModelId = modelId;
  activeBackend = 'wasm';
  self.postMessage({
    type: 'ready',
    modelId,
    backend: 'wasm',
  });
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

      // Each worker owns one runtime. Switching providers is done by the
      // bridge terminating this worker and creating a fresh worker.
      if (generator) {
        throw new Error('The local model worker must be restarted before changing runtime.');
      }

      stoppingCriteria.reset();
      if (msg.modelId !== QWEN_MODEL_ID) {
        throw new Error('Cairn supports only the Qwen 2.5 Coder 3B model.');
      }

      await removeLegacyModelCacheEntries();

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

      if (msg.backend !== 'wasm') {
        const supported = await hasWebGpuAdapter();
        if (!supported) {
          announceWebGpuFallback('No compatible WebGPU adapter was found.');
          return;
        }

        try {
          self.postMessage({
            type: 'status',
            message: 'Testing Qwen 3B on WebGPU...',
            progress: 2,
          });

          const gpuGenerator = await pipeline('text-generation', msg.modelId, {
            dtype: 'q4',
            device: 'webgpu',
            progress_callback: onProgress,
          });

          // Do not declare GPU Ready based on adapter detection alone.
          // Run a real inference before exposing this backend to chat.
          await gpuGenerator(
            [{ role: 'user', content: 'Reply with OK.' }],
            { max_new_tokens: 1, do_sample: false }
          );

          generator = gpuGenerator;
          loadedModelId = msg.modelId;
          activeBackend = 'webgpu';
          self.postMessage({
            type: 'ready',
            modelId: msg.modelId,
            backend: 'webgpu',
          });
          return;
        } catch (error) {
          // Do not call pipeline.dispose() here. A failed WebGPU runtime can
          // leave a stale device reference in the worker. The bridge terminates
          // this worker and starts a clean WASM worker instead.
          announceWebGpuFallback(errorMessage(error));
          return;
        }
      }

      await loadQwenWithWasm(msg.modelId, onProgress);
    } catch (error) {
      generator = null;
      loadedModelId = null;
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
        error: 'The Qwen model is not loaded. Wait for the model runtime to become Ready.',
      });
      return;
    }

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

    try {
      stoppingCriteria.reset();
      const streamer = new TextStreamer(generator.tokenizer, {
        skip_prompt: true,
        skip_special_tokens: true,
        callback_function: (text: string) => {
          accumulated += text;
          pendingText += text;
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
      if (flushTimer !== null) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      if (activeBackend === 'webgpu') {
        // Preserve the pending prompt in the bridge; it will be replayed once
        // on a fresh WASM worker after this GPU worker is terminated.
        announceWebGpuFallback(errorMessage(error), msg.requestId);
        return;
      }
      self.postMessage({
        type: 'gen-error',
        requestId: msg.requestId,
        error: errorMessage(error),
      });
    }
  }
});
