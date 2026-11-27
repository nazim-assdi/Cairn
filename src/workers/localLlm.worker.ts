import {
  pipeline,
  env,
  InterruptableStoppingCriteria,
  TextStreamer,
} from '@huggingface/transformers';

// Transformers.js keeps model files in the browser Cache Storage so the
// same model can be loaded again without a network connection.
env.allowLocalModels = false;
env.useBrowserCache = true;

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

      const isLargeModel = msg.modelId.toUpperCase().includes('7B');
      const hasWebGpu = await detectWebGpu();

      if (isLargeModel && !hasWebGpu) {
        throw new Error(
          'Qwen 7B needs a compatible WebGPU graphics device with substantial dedicated memory. This PC should use Qwen 0.5B or 1.5B in CPU/WASM mode instead.'
        );
      }

      // Small models try the GPU first, then automatically fall back to CPU/WASM.
      // A detected WebGPU adapter does not guarantee that every ONNX operation
      // or quantized model is supported by that driver.
      const backends: Array<'webgpu' | 'wasm'> = isLargeModel
        ? ['webgpu']
        : hasWebGpu
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
                ? `Loading ${msg.modelId} on WebGPU...`
                : hasWebGpu
                  ? 'GPU runtime was not compatible; retrying on CPU/WASM...'
                  : `Loading ${msg.modelId} on CPU/WASM...`,
            progress: index === 0 ? 2 : 90,
          });

          const loaded = await pipeline('text-generation', msg.modelId, {
            // The published 0.5B/1.5B ONNX model cards use q4.
            // Reserve q4f16 for the large 7B WebGPU model.
            dtype: isLargeModel ? 'q4f16' : 'q4',
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
              message: `WebGPU could not start this model. Retrying with CPU/WASM: ${errorMessage(error)}`,
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
        max_new_tokens: msg.maxNewTokens ?? 512,
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
