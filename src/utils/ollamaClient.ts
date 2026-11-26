export interface OllamaProbeResult {
  connected: boolean;
  models: string[];
  hasQwenCoder7B: boolean;
  error?: string;
}

export function isLocalEndpointUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    return (
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === '::1'
    );
  } catch {
    return false;
  }
}

export function normalizeOllamaBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

export function parseOllamaStreamLine(line: string): {
  token: string;
  done: boolean;
  error?: string;
} | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  try {
    const json = JSON.parse(trimmed) as {
      message?: { content?: string };
      response?: string;
      done?: boolean;
      error?: string;
    };
    if (json.error) {
      return { token: '', done: true, error: json.error };
    }
    return {
      token: json.message?.content ?? json.response ?? '',
      done: Boolean(json.done),
    };
  } catch {
    return null;
  }
}

export async function probeLocalOllama(
  baseUrl = 'http://localhost:11434'
): Promise<OllamaProbeResult> {
  const cleanUrl = normalizeOllamaBaseUrl(baseUrl);
  if (!isLocalEndpointUrl(cleanUrl)) {
    return {
      connected: false,
      models: [],
      hasQwenCoder7B: false,
      error: 'Only local device endpoints (localhost / 127.0.0.1) are permitted.',
    };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2200);
    const res = await fetch(`${cleanUrl}/api/tags`, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      return {
        connected: false,
        models: [],
        hasQwenCoder7B: false,
        error: `Ollama responded with HTTP ${res.status}`,
      };
    }

    const data = (await res.json()) as {
      models?: { name?: string }[];
    };
    const models = (data.models ?? [])
      .map((m) => m.name ?? '')
      .filter(Boolean);
    const hasQwenCoder7B = models.some((name) =>
      name.toLowerCase().startsWith('qwen2.5-coder:7b') ||
      name.toLowerCase().includes('qwen2.5-coder')
    );

    return {
      connected: true,
      models,
      hasQwenCoder7B,
    };
  } catch {
    return {
      connected: false,
      models: [],
      hasQwenCoder7B: false,
      error: 'Local Ollama daemon not detected on localhost:11434.',
    };
  }
}

export async function streamOllamaChat(options: {
  baseUrl: string;
  model: string;
  messages: {
    role: 'system' | 'user' | 'assistant';
    content: string;
    images?: string[];
  }[];
  temperature?: number;
  maxTokens?: number;
  onToken: (fullText: string) => void;
  signal?: AbortSignal;
}): Promise<string> {
  const cleanUrl = normalizeOllamaBaseUrl(options.baseUrl);
  if (!isLocalEndpointUrl(cleanUrl)) {
    throw new Error('Only localhost endpoints are permitted for offline privacy.');
  }

  const res = await fetch(`${cleanUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: options.signal,
    body: JSON.stringify({
      model: options.model,
      messages: options.messages,
      stream: true,
      options: {
        temperature: options.temperature ?? 0.3,
        num_predict: options.maxTokens ?? 1024,
      },
    }),
  });

  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => '');
    throw new Error(
      errText || `Local Ollama error (HTTP ${res.status}). Ensure "${options.model}" is pulled.`
    );
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let accumulated = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const parsed = parseOllamaStreamLine(line);
      if (!parsed) continue;
      if (parsed.error) throw new Error(parsed.error);
      if (parsed.token) {
        accumulated += parsed.token;
        options.onToken(accumulated);
      }
    }
  }

  if (buffer.trim()) {
    const parsed = parseOllamaStreamLine(buffer);
    if (parsed?.token) {
      accumulated += parsed.token;
      options.onToken(accumulated);
    }
  }

  return accumulated.trim();
}

export function sanitizeSvgMarkup(raw: string): string | null {
  const match = raw.match(/<svg[\s\S]*?<\/svg>/i);
  if (!match) return null;
  let svg = match[0]
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/https?:\/\/[^\s"'<>]+/gi, '');
  if (!/viewBox\s*=/i.test(svg)) {
    svg = svg.replace(/<svg/i, '<svg viewBox="0 0 1200 675"');
  }
  return svg;
}

export async function generateOllamaSvgScene(options: {
  baseUrl: string;
  model: string;
  prompt: string;
  width: number;
  height: number;
}): Promise<string | null> {
  const cleanUrl = normalizeOllamaBaseUrl(options.baseUrl);
  if (!isLocalEndpointUrl(cleanUrl)) return null;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    const res = await fetch(`${cleanUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: options.model,
        stream: false,
        options: { temperature: 0.35, num_predict: 1200 },
        prompt: `Generate a rich, detailed, layered SVG illustration (width="${options.width}" height="${options.height}" viewBox="0 0 ${options.width} ${options.height}") depicting: "${options.prompt}". Use gradients, layered shapes, lighting, and scenery. Output ONLY valid <svg>...</svg> markup with no markdown or scripts.`,
      }),
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = (await res.json()) as { response?: string };
    return data.response ? sanitizeSvgMarkup(data.response) : null;
  } catch {
    return null;
  }
}

