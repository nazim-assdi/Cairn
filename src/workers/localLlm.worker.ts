import {
  AutoModelForCausalLM,
  AutoTokenizer,
  env,
  InterruptableStoppingCriteria,
  TextStreamer,
} from '@huggingface/transformers';

// Always use browser Cache Storage so downloaded ONNX weights persist offline
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
let tokenizer: Awaited<ReturnType<typeof AutoTokenizer.from_pretrained>> | null = null;
let model: Awaited<ReturnType<typeof AutoModelForCausalLM.from_pretrained>> | null = null;
let activeBackend: 'webgpu' | 'wasm' = 'wasm';
const stoppingCriteria = new InterruptableStoppingCriteria();

async function detectWebGpu(): Promise<boolean> {
  try {
    const nav = self.navigator as Navigator & {
      gpu?: { requestAdapter: () => Promise<unknown | null> };
    };
    if (!nav.gpu) return false;
    const adapter = await nav.gpu.requestAdapter();
    return Boolean(adapter);
  } catch {
    return false;
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
      if (loadedModelId === msg.modelId && tokenizer && model) {
        self.postMessage({
          type: 'ready',
          modelId: msg.modelId,
          backend: activeBackend,
        });
        return;
      }

      const hasWebGpu = await detectWebGpu();
      activeBackend = hasWebGpu ? 'webgpu' : 'wasm';

      if (msg.modelId.includes('7B') && !hasWebGpu) {
        self.postMessage({
          type: 'error',
          error:
            'Qwen 2.5 Coder 7B in-browser requires WebGPU VRAM. Use "Qwen 2.5 Coder 7B (Local Ollama)" via `ollama run qwen2.5-coder:7b` or select Qwen 2.5 Coder 1.5B / 0.5B.',
        });
        return;
      }

      self.postMessage({
        type: 'status',
        message: `Loading ${msg.modelId} (${activeBackend.toUpperCase()})...`,
        progress: 2,
      });

      const progressMap = new Map<string, number>();

      const onProgress = (info: { status?: string; file?: string; progress?: number }) => {
        if (typeof info.progress === 'number' && info.file) {
          progressMap.set(info.file, info.progress);
          const vals = Array.from(progressMap.values());
          const avg = vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length);
          self.postMessage({
            type: 'progress',
            progress: Math.min(99, Math.round(avg)),
            file: info.file,
          });
        }
      };

      tokenizer = await AutoTokenizer.from_pretrained(msg.modelId, {
        progress_callback: onProgress,
      });

      model = await AutoModelForCausalLM.from_pretrained(msg.modelId, {
        dtype: msg.modelId.includes('7B') ? 'q4f16' : 'q4',
        device: activeBackend,
        progress_callback: onProgress,
      });

      loadedModelId = msg.modelId;
      self.postMessage({
        type: 'ready',
        modelId: msg.modelId,
        backend: activeBackend,
      });
    } catch (err) {
      loadedModelId = null;
      tokenizer = null;
      model = null;
      self.postMessage({
        type: 'error',
        error:
          err instanceof Error
            ? err.message
            : 'Unable to load on-device model. Check network for initial weight caching.',
      });
    }
    return;
  }

  if (msg.type === 'generate') {
    if (!tokenizer || !model) {
      self.postMessage({
        type: 'gen-error',
        requestId: msg.requestId,
        error: 'On-device neural model is not loaded yet.',
      });
      return;
    }

    try {
      stoppingCriteria.reset();
      const inputs = tokenizer.apply_chat_template(msg.messages, {
        add_generation_prompt: true,
        return_dict: true,
      }) as Record<string, unknown>;

      let accumulated = '';
      const streamer = new TextStreamer(tokenizer, {
        skip_prompt: true,
        skip_special_tokens: true,
        callback_function: (tokenText: string) => {
          accumulated += tokenText;
          self.postMessage({
            type: 'token',
            requestId: msg.requestId,
            text: accumulated,
          });
        },
      });

      const temp = msg.temperature ?? 0.2;
      await model.generate({
        ...inputs,
        max_new_tokens: msg.maxNewTokens ?? 768,
        do_sample: temp > 0.05,
        ...(temp > 0.05 ? { temperature: temp } : {}),
        streamer,
        stopping_criteria: [stoppingCriteria],
      });

      self.postMessage({
        type: 'done',
        requestId: msg.requestId,
        text: accumulated.trim(),
      });
    } catch (err) {
      self.postMessage({
        type: 'gen-error',
        requestId: msg.requestId,
        error: err instanceof Error ? err.message : 'Local generation error',
      });
    }
  }
});
