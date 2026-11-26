import {
  AiSettings,
  ChatMessage,
  CitationRef,
  DocumentChunk,
  ImageAttachment,
  MediaKind,
  VaultDocument,
} from '../types/workspace';
import {
  analyzeDocumentsLocally,
  classifyIntent,
  detectConversationalIntent,
  scoreChunksBM25,
} from './edgeEngine';
import { formatBytes } from './formatters';

export interface SlashCommandDef {
  command: string;
  label: string;
  description: string;
  placeholder: string;
  mediaKind?: MediaKind;
}

export const SLASH_COMMANDS: SlashCommandDef[] = [
  {
    command: '/code',
    label: 'Generate Code',
    description: 'Write TypeScript, Python, SQL, React, or HTML/SVG code',
    placeholder: '/code Write a TypeScript debounce hook with cleanup',
  },
  {
    command: '/calc',
    label: 'Calculate & Convert',
    description: 'Evaluate math expressions, percentages, and unit conversions',
    placeholder: '/calc 18.5% of 128400',
  },
  {
    command: '/summarize',
    label: 'Summarize Docs',
    description: 'Synthesize key findings and citations from active files',
    placeholder: '/summarize key risks and uptime metrics',
  },
  {
    command: '/email',
    label: 'Draft Email',
    description: 'Turn findings or topic into a structured team email',
    placeholder: '/email Q3 resilience summary for engineering leads',
  },
  {
    command: '/json',
    label: 'Format JSON',
    description: 'Validate, pretty-print, and inspect JSON payloads locally',
    placeholder: '/json {"uptime":99.94,"nodes":42}',
  },
  {
    command: '/image',
    label: 'Generate Image',
    description: 'Create any PNG scene, AI artwork, poster, or document visual',
    placeholder: '/image Golden sunset over misty mountains and lake',
    mediaKind: 'image',
  },
  {
    command: '/audio',
    label: 'Audio Brief',
    description: 'Synthesize a local WAV audio briefing from context',
    placeholder: '/audio Daily cluster status update',
    mediaKind: 'audio',
  },
  {
    command: '/video',
    label: 'Generate Video',
    description: 'Render an animated WebM scene, motion story, or doc recap',
    placeholder: '/video Neon cyberpunk skyline in midnight rain',
    mediaKind: 'video',
  },
  {
    command: '/help',
    label: 'AI Capabilities',
    description: 'Show all offline AI tools, models, and shortcuts',
    placeholder: '/help',
  },
];

export function parseSlashCommand(input: string): {
  command: string | null;
  args: string;
} {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) {
    return { command: null, args: trimmed };
  }
  const match = trimmed.match(/^(\/[a-z]+)(?:\s+([\s\S]*))?$/i);
  if (!match) return { command: null, args: trimmed };
  return {
    command: match[1].toLowerCase(),
    args: (match[2] ?? '').trim(),
  };
}

// Pure recursive-descent math parser (no eval or Function)
function evaluateArithmeticExpression(expr: string): number | null {
  const clean = expr
    .replace(/,/g, '')
    .replace(/\^/g, '**')
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .trim();

  if (!/^[0-9+\-*/().\s]+$/.test(clean)) return null;

  const tokens: string[] = [];
  let i = 0;
  while (i < clean.length) {
    const ch = clean[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if ('+-*/()'.includes(ch)) {
      if (ch === '*' && clean[i + 1] === '*') {
        tokens.push('**');
        i += 2;
      } else {
        tokens.push(ch);
        i += 1;
      }
      continue;
    }
    const numMatch = clean.slice(i).match(/^\d+(?:\.\d+)?/);
    if (!numMatch) return null;
    tokens.push(numMatch[0]);
    i += numMatch[0].length;
  }

  if (tokens.length === 0) return null;

  let pos = 0;

  const parseExpr = (): number | null => {
    let left = parseTerm();
    if (left === null) return null;
    while (pos < tokens.length && (tokens[pos] === '+' || tokens[pos] === '-')) {
      const op = tokens[pos++];
      const right = parseTerm();
      if (right === null) return null;
      left = op === '+' ? left + right : left - right;
    }
    return left;
  };

  const parseTerm = (): number | null => {
    let left = parsePower();
    if (left === null) return null;
    while (pos < tokens.length && (tokens[pos] === '*' || tokens[pos] === '/')) {
      const op = tokens[pos++];
      const right = parsePower();
      if (right === null) return null;
      if (op === '/') {
        if (right === 0) return null;
        left = left / right;
      } else {
        left = left * right;
      }
    }
    return left;
  };

  const parsePower = (): number | null => {
    const base = parseUnary();
    if (base === null) return null;
    if (pos < tokens.length && tokens[pos] === '**') {
      pos += 1;
      const exp = parsePower();
      if (exp === null) return null;
      return Math.pow(base, exp);
    }
    return base;
  };

  const parseUnary = (): number | null => {
    if (tokens[pos] === '-') {
      pos += 1;
      const val = parseUnary();
      return val === null ? null : -val;
    }
    if (tokens[pos] === '+') {
      pos += 1;
      return parseUnary();
    }
    if (tokens[pos] === '(') {
      pos += 1;
      const inner = parseExpr();
      if (inner === null || tokens[pos] !== ')') return null;
      pos += 1;
      return inner;
    }
    const raw = tokens[pos++];
    if (!raw || !/^\d+(?:\.\d+)?$/.test(raw)) return null;
    return Number(raw);
  };

  const result = parseExpr();
  if (result === null || pos !== tokens.length || !Number.isFinite(result)) {
    return null;
  }
  return result;
}

export function evaluateMathOrUnit(query: string): {
  expression: string;
  resultText: string;
  explanation: string;
} | null {
  const q = query.trim();

  // Percentage: "18.5% of $128,400"
  const pctMatch = q.match(
    /(\d+(?:\.\d+)?)\s*%\s+of\s+\$?([\d,]+(?:\.\d+)?)/i
  );
  if (pctMatch) {
    const pct = Number(pctMatch[1]);
    const base = Number(pctMatch[2].replace(/,/g, ''));
    const val = (pct / 100) * base;
    const formatted = Number.isInteger(val)
      ? val.toLocaleString('en-US')
      : val.toLocaleString('en-US', { maximumFractionDigits: 4 });
    return {
      expression: `${pct}% of ${base.toLocaleString('en-US')}`,
      resultText: formatted,
      explanation: `Calculated \`(${pct} / 100) * ${base}\` = **${formatted}**.`,
    };
  }

  // Data size conversion: "2.5 GB to MB"
  const sizeMatch = q.match(
    /(?:convert\s+)?(\d+(?:\.\d+)?)\s*(b|bytes|kb|mb|gb|tb)\s+(?:to|in)\s+(b|bytes|kb|mb|gb|tb)\b/i
  );
  if (sizeMatch) {
    const val = Number(sizeMatch[1]);
    const unitPow: Record<string, number> = {
      b: 0,
      bytes: 0,
      kb: 1,
      mb: 2,
      gb: 3,
      tb: 4,
    };
    const fromKey = sizeMatch[2].toLowerCase();
    const toKey = sizeMatch[3].toLowerCase();
    const bytes = val * Math.pow(1024, unitPow[fromKey]);
    const converted = bytes / Math.pow(1024, unitPow[toKey]);
    const out =
      converted >= 1000
        ? converted.toLocaleString('en-US', { maximumFractionDigits: 2 })
        : Number(converted.toFixed(4)).toString();
    return {
      expression: `${val} ${fromKey.toUpperCase()} -> ${toKey.toUpperCase()}`,
      resultText: `${out} ${toKey.toUpperCase()}`,
      explanation: `Using binary 1024-byte units: **${val} ${fromKey.toUpperCase()} = ${out} ${toKey.toUpperCase()}**.`,
    };
  }

  // Temperature conversion: "78C to F" or "172F in C"
  const tempMatch = q.match(
    /(?:convert\s+)?(-?\d+(?:\.\d+)?)\s*°?\s*([cf])\s+(?:to|in)\s+°?\s*([cf])\b/i
  );
  if (tempMatch) {
    const val = Number(tempMatch[1]);
    const from = tempMatch[2].toUpperCase();
    const to = tempMatch[3].toUpperCase();
    let res = val;
    if (from === 'C' && to === 'F') res = (val * 9) / 5 + 32;
    if (from === 'F' && to === 'C') res = ((val - 32) * 5) / 9;
    const rounded = Number(res.toFixed(2));
    return {
      expression: `${val}°${from} -> °${to}`,
      resultText: `${rounded}°${to}`,
      explanation: `Converted temperature: **${val}°${from} = ${rounded}°${to}**.`,
    };
  }

  // Direct arithmetic expression (strip leading "calculate"/"what is"/"=")
  const stripped = q
    .replace(/^(?:calculate|compute|eval|what\s+is|solve|=)\s+/i, '')
    .replace(/\?$/, '')
    .trim();

  if (/[+\-*/^]/.test(stripped) && /\d/.test(stripped)) {
    const val = evaluateArithmeticExpression(stripped);
    if (val !== null) {
      const formatted = Number.isInteger(val)
        ? val.toLocaleString('en-US')
        : Number(val.toFixed(6)).toString();
      return {
        expression: stripped,
        resultText: formatted,
        explanation: `\`${stripped}\` = **${formatted}**`,
      };
    }
  }

  return null;
}

function isBengaliText(text: string): boolean {
  return /[\u0980-\u09FF]/.test(text);
}

function isCodingIntent(query: string): boolean {
  const q = query.toLowerCase();
  return (
    /\b(code|function|helper|script|component|hook|algorithm|regex|sql|query|typescript|javascript|python|react|html|css|svg|api|endpoint|interface|type\s+safety|parse|csv|debounce|throttle|sort|binary\s+search|dockerfile)\b/.test(
      q
    ) ||
    /\b(write|implement|create|build|generate|fix|debug)\s+(a|an|the)?\s*(ts|js|py|sql|html|svg|react|node)\b/.test(
      q
    )
  );
}

function generateCodingReply(query: string, personaInstruction?: string): {
  answer: string;
  followUps: string[];
} {
  const q = query.toLowerCase();

  if (q.includes('csv')) {
    return {
      answer: `Here is a strict, zero-dependency **TypeScript CSV metrics parser** handling quoted fields, headers, and numeric coercion:

\`\`\`ts
export interface MetricRow {
  [key: string]: string | number;
}

export function parseCsvMetrics(csvText: string): MetricRow[] {
  const lines = csvText
    .replace(/\\r\\n/g, '\\n')
    .split('\\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const splitRow = (line: string): string[] => {
    const cells: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        cells.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    cells.push(current.trim());
    return cells;
  };

  const headers = splitRow(lines[0]);

  return lines.slice(1).map((line) => {
    const values = splitRow(line);
    const row: MetricRow = {};
    headers.forEach((header, idx) => {
      const raw = values[idx] ?? '';
      const numeric = Number(raw.replace(/[%,$]/g, ''));
      row[header] = raw !== '' && Number.isFinite(numeric) ? numeric : raw;
    });
    return row;
  });
}
\`\`\`

• Handles quoted commas cleanly without external libraries.
• Preserves string labels while coercing percentages, currency strings, and numbers safely.`,
      followUps: [
        'Explain this CSV parser line by line',
        'Write unit tests for parseCsvMetrics',
        'Convert this helper to Python',
      ],
    };
  }

  if (/\b(svg|html|card|dashboard|widget|preview|diagram)\b/.test(q)) {
    return {
      answer: `Here is a self-contained interactive **HTML/SVG system status card** you can inspect or preview live right below using the **Preview** toggle:

\`\`\`html
<div style="font-family: system-ui, sans-serif; padding: 20px; background: #0f172a; color: #f8fafc; border-radius: 12px; border: 1px solid #1e293b;">
  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
    <strong style="font-size: 15px; color: #2dd4bf;">Local Edge AI Telemetry</strong>
    <span style="font-size: 12px; color: #94a3b8;">Offline · Encrypted</span>
  </div>
  <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
    <div style="background: #1e293b; padding: 12px; border-radius: 8px;">
      <div style="font-size: 11px; color: #94a3b8;">Uptime</div>
      <div style="font-size: 18px; font-weight: 700; margin-top: 4px;">99.94%</div>
    </div>
    <div style="background: #1e293b; padding: 12px; border-radius: 8px;">
      <div style="font-size: 11px; color: #94a3b8;">Active Nodes</div>
      <div style="font-size: 18px; font-weight: 700; margin-top: 4px;">42</div>
    </div>
    <div style="background: #1e293b; padding: 12px; border-radius: 8px;">
      <div style="font-size: 11px; color: #94a3b8;">Latency</div>
      <div style="font-size: 18px; font-weight: 700; margin-top: 4px;">14 ms</div>
    </div>
  </div>
</div>
\`\`\`

Click **Preview** on the code header above to render the card live inside the sandboxed frame.`,
      followUps: [
        'Add a responsive bar chart in SVG',
        'Convert this into a React Tailwind component',
      ],
    };
  }

  if (q.includes('python')) {
    return {
      answer: `Here is a clean, self-contained **Python 3** implementation tailored to your request:

\`\`\`python
from pathlib import Path
from typing import List, Dict
import json

def analyze_local_records(paths: List[str]) -> Dict[str, int]:
    summary: Dict[str, int] = {"files": 0, "lines": 0, "words": 0}
    for raw_path in paths:
        file_path = Path(raw_path)
        if not file_path.exists():
            continue
        text = file_path.read_text(encoding="utf-8", errors="ignore")
        summary["files"] += 1
        summary["lines"] += len(text.splitlines())
        summary["words"] += len(text.split())
    return summary

if __name__ == "__main__":
    print(json.dumps(analyze_local_records(["notes.txt"]), indent=2))
\`\`\`

For custom open-ended Python generation across arbitrary libraries, connect **Qwen 2.5 Coder 7B (Local Ollama)** or load **Qwen 2.5 Coder 1.5B** in **AI Settings**.`,
      followUps: [
        'Add error logging and CLI arguments',
        'Rewrite this in TypeScript',
      ],
    };
  }

  if (q.includes('sql')) {
    return {
      answer: `Here is a clean, parameterized **SQL** query template with aggregation and indexing guidance:

\`\`\`sql
SELECT
  station_id,
  COUNT(*) AS total_events,
  ROUND(AVG(cpu_temp_c), 2) AS avg_temp_c,
  MAX(recorded_at) AS last_seen_utc
FROM telemetry_events
WHERE recorded_at >= CURRENT_TIMESTAMP - INTERVAL '7 days'
GROUP BY station_id
HAVING MAX(cpu_temp_c) > 75.0
ORDER BY avg_temp_c DESC;
\`\`\`

• Add a composite index on \`(recorded_at, station_id)\` to keep time-window scans fast.`,
      followUps: [
        'Write the matching CREATE TABLE schema',
        'Optimize for PostgreSQL partitioning',
      ],
    };
  }

  if (q.includes('debounce') || q.includes('hook') || q.includes('react')) {
    return {
      answer: `Here is a reusable, type-safe **React \`useDebouncedValue\` hook** in TypeScript:

\`\`\`ts
import { useEffect, useState } from 'react';

export function useDebouncedValue<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
\`\`\`

• Automatically cancels pending timers on unmount or rapid state updates.`,
      followUps: [
        'Add a debounced callback version',
        'Write a Vitest unit test for this hook',
      ],
    };
  }

  const personaNote = personaInstruction
    ? `Active focus: ${personaInstruction.slice(0, 90)}`
    : 'Built-in Edge AI coding template';

  return {
    answer: `Here is a clean **TypeScript** starter pattern for your request (${personaNote}):

\`\`\`ts
export interface TaskResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

export async function runSafely<T>(task: () => Promise<T>): Promise<TaskResult<T>> {
  try {
    const data = await task();
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Unexpected execution error',
    };
  }
}
\`\`\`

Tip: For arbitrary multi-file refactoring and full 7B neural code synthesis, connect **Qwen 2.5 Coder 7B** via **AI Settings** (Ollama or In-Browser ONNX).`,
    followUps: [
      'Convert this pattern to Python',
      'Add retry with exponential backoff',
    ],
  };
}

export interface RoutedOfflineReply {
  answer: string;
  intent:
    | 'summary'
    | 'comparison'
    | 'metrics'
    | 'risks'
    | 'general'
    | 'conversation';
  citations: CitationRef[];
  extractedMetrics: string[];
  keyThemes: string[];
  suggestedFollowUps: string[];
  briefingTitle: string;
  briefingBullets: string[];
}

export function routeOfflineQuery(params: {
  query: string;
  selectedDocs: VaultDocument[];
  allChunks: DocumentChunk[];
  history: ChatMessage[];
  settings: AiSettings;
  attachments?: ImageAttachment[];
}): RoutedOfflineReply {
  const { query, selectedDocs, allChunks, history, settings, attachments } =
    params;

  const { command, args } = parseSlashCommand(query);

  // 1. Slash command: /help
  if (command === '/help') {
    return {
      answer: `### Cairn Complete Offline AI Capabilities

• **/code \`<prompt>\`** — Generate TypeScript, Python, SQL, React, or live HTML/SVG previews
• **/calc \`<expression>\`** — Evaluate math (\`18.5% of 128400\`, \`25 * 48\`, \`512 MB to KB\`, \`78C to F\`)
• **/summarize \`<focus>\`** — Grounded synthesis across your PDF, DOCX, and TXT vault
• **/email \`<topic>\`** — Draft structured team emails from your conversation or docs
• **/json \`<payload>\`** — Validate and pretty-print JSON offline
• **/image**, **/audio**, **/video** — Synthesize PNG visuals, WAV briefings, or WebM recaps locally

Open **AI Settings** in the top workspace bar to connect **Qwen 2.5 Coder 7B (Ollama)**, cache in-browser ONNX weights, or customize your system prompt and temperature.`,
      intent: 'conversation',
      citations: [],
      extractedMetrics: [],
      keyThemes: [],
      suggestedFollowUps: [
        '/code Write a TypeScript CSV parser',
        '/calc 18.5% of 128400',
        'Summarize key resilience findings',
      ],
      briefingTitle: 'Cairn AI Commands',
      briefingBullets: ['Offline chat, coding, math, document RAG, and media generation.'],
    };
  }

  // 2. Slash command: /json
  if (command === '/json' || (query.trim().startsWith('{') && query.trim().endsWith('}'))) {
    const payload = command === '/json' ? args : query.trim();
    try {
      const parsed = JSON.parse(payload);
      const pretty = JSON.stringify(parsed, null, 2);
      const keyCount =
        parsed && typeof parsed === 'object' ? Object.keys(parsed).length : 0;
      return {
        answer: `Valid JSON (${keyCount} top-level key${keyCount === 1 ? '' : 's'}):\n\n\`\`\`json\n${pretty}\n\`\`\``,
        intent: 'general',
        citations: [],
        extractedMetrics: [],
        keyThemes: [],
        suggestedFollowUps: [
          'Generate TypeScript interfaces for this JSON',
          'Make it shorter',
        ],
        briefingTitle: 'Validated JSON',
        briefingBullets: [`Validated ${keyCount} JSON keys locally.`],
      };
    } catch (err) {
      return {
        answer: `Invalid JSON syntax: \`${
          err instanceof Error ? err.message : 'Parse error'
        }\`. Check for missing quotes or trailing commas.`,
        intent: 'general',
        citations: [],
        extractedMetrics: [],
        keyThemes: [],
        suggestedFollowUps: ['/help'],
        briefingTitle: 'JSON Validation Error',
        briefingBullets: ['JSON syntax error detected locally.'],
      };
    }
  }

  // 3. Image attachment inspection in built-in offline mode
  if (attachments && attachments.length > 0 && !command) {
    const lines = attachments.map(
      (img) =>
        `• **${img.name}** — ${img.width}×${img.height} px · ${formatBytes(img.sizeBytes)}`
    );
    return {
      answer: `Attached ${attachments.length} image${attachments.length > 1 ? 's' : ''} locally on-device:\n\n${lines.join('\n')}\n\nNote: Built-in Edge AI inspected file metadata privately in your browser. To run visual Q&A on pixels, connect a vision-capable local Ollama model (e.g. \`qwen2.5vl\` or \`llava\`) in **AI Settings**, or tell me how you want to transform these findings into a document briefing.`,
      intent: 'conversation',
      citations: [],
      extractedMetrics: [],
      keyThemes: [],
      suggestedFollowUps: [
        'Summarize key resilience findings',
        'Generate Briefing Image',
      ],
      briefingTitle: 'Local Image Inspection',
      briefingBullets: lines.map((l) => l.replace(/\*\*/g, '')),
    };
  }

  // 4. Math / unit conversion (/calc or auto-detected)
  const mathTarget = command === '/calc' ? args : query;
  const mathResult = evaluateMathOrUnit(mathTarget);
  if (mathResult) {
    return {
      answer: `### Result: ${mathResult.resultText}\n\n${mathResult.explanation}`,
      intent: 'metrics',
      citations: [],
      extractedMetrics: [mathResult.resultText],
      keyThemes: [],
      suggestedFollowUps: [
        'Make it shorter',
        'Draft an email with this figure',
      ],
      briefingTitle: `Calculation: ${mathResult.expression}`,
      briefingBullets: [`${mathResult.expression} = ${mathResult.resultText}`],
    };
  }

  // 5. Coding intent (/code or detected coding prompt)
  const effectiveQuery =
    command === '/summarize'
      ? `Summarize ${args || 'all selected documents'}`
      : command === '/email'
      ? `Write an email summary about ${args || 'our findings'}`
      : command === '/explain'
      ? `Explain ${args}`
      : command === '/code'
      ? args || 'Write a TypeScript helper function'
      : query;

  if (command === '/code' || isCodingIntent(effectiveQuery)) {
    const coded = generateCodingReply(effectiveQuery, settings.systemPrompt);
    return {
      answer: coded.answer,
      intent: 'general',
      citations: [],
      extractedMetrics: [],
      keyThemes: [],
      suggestedFollowUps: coded.followUps,
      briefingTitle: 'Code Solution',
      briefingBullets: ['Generated offline code solution locally.'],
    };
  }

  // 6. Conversational / Bengali / Follow-up handling
  const convoIntent = detectConversationalIntent(effectiveQuery);
  if (convoIntent === 'greeting' && isBengaliText(effectiveQuery)) {
    return {
      answer: `হ্যালো! আমি **Cairn**, আপনার সম্পূর্ণ অফলাইন এআই অ্যাসিস্ট্যান্ট। আপনার ভল্টে বর্তমানে **${selectedDocs.length}টি ডকুমেন্ট** যুক্ত আছে।\n\nআমি আপনার জন্য যা যা করতে পারি:\n• **PDF, DOCX ও TXT** ফাইল বিশ্লেষণ ও সাইটেশনসহ উত্তর\n• **Qwen 2.5 Coder 7B** (Ollama বা ব্রাউজার ONNX) দিয়ে কোডিং ও চ্যাট\n• চ্যাটের ভেতরেই **Image, Audio ও Video** তৈরি\n\nযেকোনো প্রশ্ন বাংলায় বা ইংরেজিতে করুন!`,
      intent: 'conversation',
      citations: [],
      extractedMetrics: [],
      keyThemes: [],
      suggestedFollowUps: [
        'ডকুমেন্টগুলোর মূল তথ্য সংক্ষেপে বলো',
        '/code Write a TypeScript helper',
        '/help',
      ],
      briefingTitle: 'Cairn Offline AI',
      briefingBullets: ['Complete offline bilingual AI assistant.'],
    };
  }

  // Check if query has strong document intent or matches document chunks before falling back to RAG
  const docIntent = classifyIntent(effectiveQuery);
  const selectedIds = new Set(selectedDocs.map((d) => d.id));
  const scopedChunks = allChunks.filter((c) => selectedIds.has(c.documentId));
  const bestScore =
    scopedChunks.length > 0
      ? scoreChunksBM25(effectiveQuery, scopedChunks, 1)[0]?.score ?? 0
      : 0;

  const isDocQuestion =
    convoIntent !== null ||
    command === '/summarize' ||
    command === '/email' ||
    docIntent !== 'general' ||
    bestScore >= 0.9 ||
    /\b(document|doc|pdf|docx|txt|file|audit|station|node|resilience|privacy|incident|log|spec|report)\b/i.test(
      effectiveQuery
    );

  if (isDocQuestion || selectedDocs.length === 0) {
    const ragRes = analyzeDocumentsLocally(
      effectiveQuery,
      selectedDocs,
      allChunks,
      history
    );
    const followUps =
      ragRes.citations.length > 0
        ? ['Make it shorter', 'Write an email summary', 'Create a Visual Card']
        : ['/help', '/code Write a TypeScript helper'];

    return {
      answer: ragRes.answer,
      intent: ragRes.intent,
      citations: ragRes.citations,
      extractedMetrics: ragRes.extractedMetrics,
      keyThemes: ragRes.keyThemes,
      suggestedFollowUps: followUps,
      briefingTitle: ragRes.briefingTitle,
      briefingBullets: ragRes.briefingBullets,
    };
  }

  // General offline conversational fallback when query is unrelated to documents
  return {
    answer: `I am running in **Instant Edge AI** mode right now. While I can immediately analyze your **${selectedDocs.length} local documents**, run **calculations (\`/calc\`)**, format **JSON (\`/json\`)**, generate **code (\`/code\`)**, and render **PNG/WAV/WebM media**, open-ended world knowledge answers work best with a neural model.\n\n• Click **AI Settings** above to connect **Qwen 2.5 Coder 7B (Local Ollama)** or load **Qwen 2.5 Coder 0.5B / 1.5B** directly in your browser.\n• Or try \`/help\` to explore built-in offline tools.`,
    intent: 'conversation',
    citations: [],
    extractedMetrics: [],
    keyThemes: [],
    suggestedFollowUps: [
      'Summarize key resilience findings',
      '/code Write an interactive HTML card',
      '/help',
    ],
    briefingTitle: 'Cairn Local AI',
    briefingBullets: ['Connect Qwen 2.5 Coder 7B or use built-in tools offline.'],
  };
}
