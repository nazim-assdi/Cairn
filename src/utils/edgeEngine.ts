import {
  ChatMessage,
  CitationRef,
  DocumentChunk,
  DocumentFormat,
  DocumentPage,
  MediaKind,
  VaultDocument,
} from '../types/workspace';

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'by', 'for', 'from',
  'has', 'have', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'or', 'that',
  'the', 'to', 'was', 'were', 'will', 'with', 'this', 'these', 'those',
  'what', 'which', 'who', 'whom', 'when', 'where', 'why', 'how', 'can',
  'could', 'should', 'would', 'do', 'does', 'did', 'about', 'into', 'over',
  'under', 'all', 'any', 'both', 'each', 'more', 'most', 'other', 'some',
  'such', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just',
  'tell', 'me', 'give', 'show', 'explain', 'list', 'find', 'summarize',
  'summary', 'document', 'documents', 'file', 'files', 'please',
]);

export function normalizeWord(word: string): string {
  const cleaned = word.toLowerCase().replace(/[^a-z0-9\-_.%$]/g, '');
  if (cleaned.length <= 3) return cleaned;
  if (cleaned.endsWith('ies') && cleaned.length > 5) return cleaned.slice(0, -3) + 'y';
  if (cleaned.endsWith('ing') && cleaned.length > 6) return cleaned.slice(0, -3);
  if (cleaned.endsWith('ed') && cleaned.length > 5) return cleaned.slice(0, -2);
  if (cleaned.endsWith('s') && !cleaned.endsWith('ss') && cleaned.length > 4) return cleaned.slice(0, -1);
  return cleaned;
}

export function tokenize(text: string, removeStopWords = true): string[] {
  const raw = text
    .toLowerCase()
    .replace(/[^\w\s\-%.$]/g, ' ')
    .split(/\s+/)
    .map((w) => normalizeWord(w))
    .filter((w) => w.length > 1);

  if (!removeStopWords) return raw;
  return raw.filter((w) => !STOP_WORDS.has(w));
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

function sliceOverlapAtWordBoundary(text: string, overlapChars: number): string {
  if (text.length <= overlapChars) return text.trim();
  const rawStart = text.length - overlapChars;
  const nextSpace = text.indexOf(' ', rawStart);
  if (nextSpace !== -1 && nextSpace < text.length - 10) {
    return text.slice(nextSpace + 1).trim();
  }
  return text.slice(rawStart).trim();
}

export function chunkDocumentPages(
  documentId: string,
  documentName: string,
  format: DocumentFormat,
  pages: DocumentPage[],
  targetChars = 460,
  overlapChars = 80
): DocumentChunk[] {
  const chunks: DocumentChunk[] = [];
  let globalIndex = 0;

  for (const page of pages) {
    const cleanText = page.text.replace(/\r\n/g, '\n').trim();
    if (!cleanText) continue;

    const paragraphs = cleanText
      .split(/\n+/)
      .map((p) => p.trim())
      .filter(Boolean);

    let buffer = '';

    const flushBuffer = (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      chunks.push({
        id: `${documentId}::c${globalIndex}`,
        documentId,
        documentName,
        format,
        pageNumber: page.pageNumber,
        pageLabel: page.label,
        chunkIndex: globalIndex,
        text: trimmed,
        wordCount: countWords(trimmed),
      });
      globalIndex += 1;
    };

    for (const para of paragraphs) {
      if (para.length > targetChars) {
        if (buffer.trim()) {
          flushBuffer(buffer);
          buffer = '';
        }
        const sentences = para.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g) || [para];
        let sentenceBuf = '';
        for (const sentence of sentences) {
          if ((sentenceBuf + ' ' + sentence).trim().length > targetChars && sentenceBuf.trim()) {
            flushBuffer(sentenceBuf);
            const overlap = sliceOverlapAtWordBoundary(sentenceBuf, overlapChars);
            sentenceBuf = `${overlap} ${sentence.trim()}`.trim();
          } else {
            sentenceBuf = (sentenceBuf + ' ' + sentence.trim()).trim();
          }
        }
        if (sentenceBuf.trim()) {
          flushBuffer(sentenceBuf);
        }
      } else if ((buffer + '\n' + para).trim().length > targetChars && buffer.trim()) {
        flushBuffer(buffer);
        const overlap = sliceOverlapAtWordBoundary(buffer, overlapChars);
        buffer = overlap ? `${overlap}\n${para}` : para;
      } else {
        buffer = buffer ? `${buffer}\n${para}` : para;
      }
    }

    if (buffer.trim()) {
      flushBuffer(buffer);
    }
  }

  return chunks;
}

function charTrigrams(text: string): Set<string> {
  const clean = text.toLowerCase().replace(/\s+/g, ' ').trim();
  const grams = new Set<string>();
  for (let i = 0; i <= clean.length - 3; i++) {
    grams.add(clean.slice(i, i + 3));
  }
  return grams;
}

function trigramOverlap(queryGrams: Set<string>, docGrams: Set<string>): number {
  if (queryGrams.size === 0 || docGrams.size === 0) return 0;
  let hits = 0;
  for (const g of queryGrams) {
    if (docGrams.has(g)) hits += 1;
  }
  return hits / Math.sqrt(queryGrams.size * docGrams.size);
}

export interface ScoredChunk {
  chunk: DocumentChunk;
  score: number;
  matchedTerms: string[];
}

export function scoreChunksBM25(
  query: string,
  chunks: DocumentChunk[],
  topK = 5
): ScoredChunk[] {
  if (chunks.length === 0) return [];
  const queryTerms = tokenize(query, true);
  const effectiveQueryTerms = queryTerms.length > 0 ? queryTerms : tokenize(query, false);

  const docTokenLists = chunks.map((c) => tokenize(c.text, false));
  const avgDocLen =
    docTokenLists.reduce((sum, list) => sum + list.length, 0) / Math.max(1, chunks.length);

  const docFreq = new Map<string, number>();
  for (const tokens of docTokenLists) {
    const unique = new Set(tokens);
    for (const t of unique) {
      docFreq.set(t, (docFreq.get(t) ?? 0) + 1);
    }
  }

  const k1 = 1.5;
  const b = 0.75;
  const N = chunks.length;
  const queryLower = query.toLowerCase().trim();
  const queryGrams = charTrigrams(queryLower);

  const scored: ScoredChunk[] = chunks.map((chunk, idx) => {
    const tokens = docTokenLists[idx];
    const docLen = Math.max(1, tokens.length);
    const termCounts = new Map<string, number>();
    for (const t of tokens) {
      termCounts.set(t, (termCounts.get(t) ?? 0) + 1);
    }

    let bm25 = 0;
    const matched = new Set<string>();

    for (const qt of effectiveQueryTerms) {
      const tf = termCounts.get(qt) ?? 0;
      if (tf > 0) matched.add(qt);
      const df = docFreq.get(qt) ?? 0;
      const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
      const denom = tf + k1 * (1 - b + b * (docLen / Math.max(1, avgDocLen)));
      bm25 += idf * ((tf * (k1 + 1)) / Math.max(0.0001, denom));
    }

    const chunkLower = chunk.text.toLowerCase();
    const phraseBoost = queryLower.length >= 5 && chunkLower.includes(queryLower) ? 1.8 : 0;
    const trigramSim = trigramOverlap(queryGrams, charTrigrams(chunkLower)) * 1.25;
    const docNameMatch = effectiveQueryTerms.some((qt) =>
      chunk.documentName.toLowerCase().includes(qt)
    )
      ? 0.45
      : 0;

    const totalScore = bm25 + phraseBoost + trigramSim + docNameMatch;
    return {
      chunk,
      score: Number(totalScore.toFixed(4)),
      matchedTerms: Array.from(matched),
    };
  });

  scored.sort((a, bScore) => bScore.score - a.score);
  return scored.slice(0, topK);
}

export function extractKeyMetrics(text: string, limit = 8): string[] {
  const patterns = [
    /\$[\d,]+(?:\.\d+)?(?:\s?(?:k|m|b|million|billion))?/gi,
    /\b\d+(?:\.\d+)?%/g,
    /\b\d+(?:\.\d+)?\s?(?:ms|s|sec|seconds|min|minutes|hours|hrs|days|GB|MB|KB|TB|fps|Hz|kHz|C|F)\b/gi,
    /\b(?:20\d{2}-\d{2}-\d{2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+20\d{2}|Q[1-4]\s+20\d{2})\b/gi,
  ];

  const found = new Set<string>();
  for (const regex of patterns) {
    const matches = text.match(regex);
    if (matches) {
      for (const m of matches) {
        const clean = m.trim();
        if (clean) found.add(clean);
        if (found.size >= limit) return Array.from(found);
      }
    }
  }
  return Array.from(found);
}

export interface TermFrequency {
  term: string;
  count: number;
}

export function extractTopTerms(text: string, limit = 8): TermFrequency[] {
  const tokens = tokenize(text, true).filter((t) => t.length >= 3 && !/^\d+$/.test(t));
  const counts = new Map<string, number>();
  for (const token of tokens) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([term, count]) => ({ term, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export type QueryIntent = 'summary' | 'comparison' | 'metrics' | 'risks' | 'general';

export function classifyIntent(query: string): QueryIntent {
  const q = query.toLowerCase();
  if (/\b(summarize|summary|overview|takeaway|tl;dr|brief|highlights)\b/.test(q)) {
    return 'summary';
  }
  if (/\b(compare|comparison|difference|versus|vs\.?|across|contrast)\b/.test(q)) {
    return 'comparison';
  }
  if (/\b(metric|number|stat|cost|percent|uptime|budget|date|when|how much|how many|figure)\b/.test(q)) {
    return 'metrics';
  }
  if (/\b(risk|issue|incident|warning|thermal|failure|problem|security|vulnerability|error)\b/.test(q)) {
    return 'risks';
  }
  return 'general';
}

export function detectNaturalMediaRequest(query: string): MediaKind | null {
  const q = query.toLowerCase().trim();
  if (/^\/image\b/.test(q)) return 'image';
  if (/^\/audio\b/.test(q)) return 'audio';
  if (/^\/video\b/.test(q)) return 'video';

  if (/\b(html|svg|css|code|typescript|javascript|python|react|sql|component|function|script|json)\b/.test(q)) {
    return null;
  }

  // Avoid hijacking document Q&A questions like "what does the video section in the pdf say?"
  if (/^(what|how|why|when|where|who|which|explain|does|is|are)\b/.test(q) && /\b(pdf|docx|doc|document|file|report|section|page)\b/.test(q)) {
    return null;
  }

  const imageAction = /\b(generate|create|make|render|draw|paint|sketch|design|show|bana[oo]?|dao|tairi|anko|ak[eo])\b|বানা|আঁক|দাও/;
  const imageNoun = /\b(image|img|visual|diagram|chart|infographic|poster|picture|pic|art|artwork|wallpaper|scene|photo|chobi|tasbir)\b|ছবি|পোস্টার/;
  const audioNoun = /\b(audio|voice|wav|podcast|sound|speech|briefing|kotha)\b|অডিও/;
  const videoNoun = /\b(video|clip|webm|mp4|animation|animate|slides|recap|movie|film)\b|ভিডিও/;

  if (
    (imageAction.test(q) && imageNoun.test(q)) ||
    /^(?:an?\s+)?(?:image|picture|photo|drawing|painting|poster|artwork)\s+of\b/.test(q) ||
    /\b(?:draw|paint|sketch)\s+(?:a|an|the|me)?\s*\w+/.test(q)
  ) {
    return 'image';
  }
  if (
    (imageAction.test(q) && audioNoun.test(q)) ||
    /^(?:an?\s+)?(?:audio|voice|sound)\s+(?:of|for|about)\b/.test(q)
  ) {
    return 'audio';
  }
  if (
    (imageAction.test(q) && videoNoun.test(q)) ||
    /^(?:a\s+)?(?:video|animation|clip|movie)\s+(?:of|about|for)\b/.test(q) ||
    /\banimate\s+(?:a|an|the)?\s*\w+/.test(q)
  ) {
    return 'video';
  }
  return null;
}

export function detectConversationalIntent(query: string): 'greeting' | 'identity' | 'followup_short' | 'followup_email' | null {
  const q = query.toLowerCase().trim();
  if (
    /^(hi|hello|hey|assalamu|salam|namaste|good morning|good evening|kemon ach[eo]|ki khobor|bhai|hlw)\b[!.? ]*$/i.test(q)
  ) {
    return 'greeting';
  }
  if (
    /\b(who are you|what can you do|how do you work|tumi ke|ki ki korte paro|offline ai|are you offline)\b/.test(q)
  ) {
    return 'identity';
  }
  if (/^(make it shorter|shorter|tl;dr|concise|choto koro|summarize that)\b/.test(q)) {
    return 'followup_short';
  }
  if (/\b(write an email|draft an email|email summary|format as email|email likh)\b/.test(q)) {
    return 'followup_email';
  }
  return null;
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 18);
}

export interface LocalAnalysisResult {
  answer: string;
  intent: QueryIntent | 'conversation';
  citations: CitationRef[];
  extractedMetrics: string[];
  keyThemes: string[];
  briefingTitle: string;
  briefingBullets: string[];
}

export function retrieveContextForQuery(
  query: string,
  selectedDocs: VaultDocument[],
  allChunks: DocumentChunk[],
  limit = 4
): {
  citations: CitationRef[];
  contextBlock: string;
  extractedMetrics: string[];
  keyThemes: string[];
} {
  if (selectedDocs.length === 0 || allChunks.length === 0) {
    return { citations: [], contextBlock: '', extractedMetrics: [], keyThemes: [] };
  }
  const selectedIds = new Set(selectedDocs.map((d) => d.id));
  const scopedChunks = allChunks.filter((c) => selectedIds.has(c.documentId));
  if (scopedChunks.length === 0) {
    return { citations: [], contextBlock: '', extractedMetrics: [], keyThemes: [] };
  }

  const intent = classifyIntent(query);
  const topScored =
    intent === 'summary'
      ? selectRepresentativeChunks(scopedChunks, selectedDocs, limit)
      : scoreChunksBM25(query, scopedChunks, limit);

  const relevant =
    topScored.filter((s) => s.score > 0.05).length > 0
      ? topScored.filter((s) => s.score > 0.05)
      : topScored.slice(0, Math.min(3, topScored.length));

  const citations: CitationRef[] = relevant.map((item, idx) => ({
    id: `cit-${idx + 1}-${item.chunk.id}`,
    chunkId: item.chunk.id,
    documentId: item.chunk.documentId,
    documentName: item.chunk.documentName,
    pageLabel: item.chunk.pageLabel,
    excerpt:
      item.chunk.text.length > 180
        ? item.chunk.text.slice(0, 177).trim() + '...'
        : item.chunk.text,
    score: item.score,
  }));

  const combined = relevant.map((s) => s.chunk.text).join('\n');
  const contextBlock = relevant
    .map(
      (s, i) =>
        `[Source ${i + 1}: ${s.chunk.documentName}, ${s.chunk.pageLabel}]\n${s.chunk.text}`
    )
    .join('\n\n');

  return {
    citations,
    contextBlock,
    extractedMetrics: extractKeyMetrics(combined, 6),
    keyThemes: extractTopTerms(combined, 5).map((t) => t.term),
  };
}

export function buildLlmMessages(
  query: string,
  history: ChatMessage[],
  contextBlock: string,
  selectedDocs: VaultDocument[],
  customSystemPrompt?: string
): { role: 'system' | 'user' | 'assistant'; content: string; images?: string[] }[] {
  const docNames = selectedDocs.map((d) => d.name).join(', ') || 'None selected';
  const baseIdentity =
    customSystemPrompt?.trim() ||
    'You are Cairn, a private offline AI assistant running locally on the user device. Answer clearly, directly, and conversationally. Respond in the same language or style the user uses when appropriate.';

  // Keep the prompt compact: long histories and document extracts slow CPU inference.
  const compactContextBlock =
    contextBlock.length > 2200
      ? `${contextBlock.slice(0, 2200)}\n[Additional document text omitted to keep local replies fast.]`
      : contextBlock;

  const systemPrompt = [
    baseIdentity,
    compactContextBlock
      ? `Active local documents (${docNames}):\n${compactContextBlock}\n\nGround factual claims about the files in these sources and cite them like [Source 1].`
      : 'No local documents matched or loaded. Answer helpfully as a general offline AI assistant.',
  ].join('\n\n');

  // Only the latest two exchanges are useful for most follow-up prompts.
  const recentTurns = history
    .filter((m) => m.intent !== 'media')
    .slice(-4)
    .map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content.slice(0, 650),
    }));

  return [
    { role: 'system', content: systemPrompt },
    ...recentTurns,
    { role: 'user', content: query },
  ];
}

export function analyzeDocumentsLocally(
  query: string,
  selectedDocs: VaultDocument[],
  allChunks: DocumentChunk[],
  history: ChatMessage[] = []
): LocalAnalysisResult {
  const convoIntent = detectConversationalIntent(query);

  if (convoIntent === 'greeting') {
    const docStatus =
      selectedDocs.length > 0
        ? `${selectedDocs.length} local document${selectedDocs.length > 1 ? 's' : ''} (${selectedDocs.map((d) => d.name).join(', ')}) ready in your private vault`
        : 'your private local vault ready for PDF, DOCX, or TXT uploads';
    return {
      answer: `Hello! I am Cairn, your offline on-device AI assistant. You currently have ${docStatus}.\n\nAsk me anything in natural language—summarize files, extract metrics, draft emails, or ask me to generate an image diagram, audio briefing, or video recap right here.`,
      intent: 'conversation',
      citations: [],
      extractedMetrics: [],
      keyThemes: [],
      briefingTitle: 'Cairn Local AI Assistant',
      briefingBullets: ['100% offline on-device document chat and rich media synthesis.'],
    };
  }

  if (convoIntent === 'identity') {
    return {
      answer:
        'I run 100% locally on your device—no document text or queries leave your browser.\n\n• Document AI: Parse & analyze PDF, DOCX, and TXT files with grounded page citations.\n• Neural LLM Option: Load an on-device ONNX model (SmolLM2 / Qwen 2.5) from the engine bar above to cache weights in browser storage for full offline neural chat.\n• Rich Media: Generate PNG infographics, WAV audio briefings, and WebM video recaps directly inside this chat.',
      intent: 'conversation',
      citations: [],
      extractedMetrics: [],
      keyThemes: [],
      briefingTitle: 'Offline Edge AI Capabilities',
      briefingBullets: [
        'Local PDF, DOCX, and TXT parsing in IndexedDB.',
        'Optional cached on-device ONNX neural LLM via WebGPU/WASM.',
        'On-device PNG, WAV audio, and WebM video generation.',
      ],
    };
  }

  const lastAssistant = [...history]
    .reverse()
    .find((m) => m.role === 'assistant' && m.intent !== 'media');

  if (convoIntent === 'followup_short' && lastAssistant) {
    const lines = lastAssistant.content
      .split('\n')
      .filter((l) => l.trim().startsWith('•'))
      .slice(0, 2);
    const concise =
      lines.length > 0
        ? `Concise summary:\n\n${lines.join('\n')}`
        : `Concise summary:\n\n${lastAssistant.content.slice(0, 240).trim()}...`;
    return {
      answer: concise,
      intent: 'conversation',
      citations: lastAssistant.citations ?? [],
      extractedMetrics: lastAssistant.extractedMetrics ?? [],
      keyThemes: lastAssistant.keyThemes ?? [],
      briefingTitle: 'Concise Summary',
      briefingBullets: lines.map((l) => l.replace(/^•\s*/, '')),
    };
  }

  if (convoIntent === 'followup_email' && lastAssistant) {
    const bullets = lastAssistant.content
      .split('\n')
      .filter((l) => l.trim().startsWith('•'));
    const bodyPoints =
      bullets.length > 0 ? bullets.join('\n') : `• ${lastAssistant.content.slice(0, 320)}`;
    return {
      answer: `Subject: Local Document Analysis Summary\n\nHi team,\n\nHere are the key findings from our local review:\n\n${bodyPoints}\n\nBest regards,`,
      intent: 'conversation',
      citations: lastAssistant.citations ?? [],
      extractedMetrics: lastAssistant.extractedMetrics ?? [],
      keyThemes: lastAssistant.keyThemes ?? [],
      briefingTitle: 'Email Summary Draft',
      briefingBullets: bullets.map((l) => l.replace(/^•\s*/, '')),
    };
  }

  if (selectedDocs.length === 0) {
    return {
      answer:
        'No documents are currently selected in your local vault. Select at least one PDF, DOCX, or TXT file in the left sidebar (or upload a new document) so I can analyze it for you—or switch to an on-device neural model above for open-ended offline chat.',
      intent: 'general',
      citations: [],
      extractedMetrics: [],
      keyThemes: [],
      briefingTitle: 'No Active Documents',
      briefingBullets: ['Select or upload a PDF, DOCX, or TXT file to begin local analysis.'],
    };
  }

  const selectedIds = new Set(selectedDocs.map((d) => d.id));
  const scopedChunks = allChunks.filter((c) => selectedIds.has(c.documentId));

  if (scopedChunks.length === 0) {
    return {
      answer:
        'The selected documents contain no extractable text chunks. Try uploading a text-based PDF, DOCX, or TXT file.',
      intent: 'general',
      citations: [],
      extractedMetrics: [],
      keyThemes: [],
      briefingTitle: 'Empty Document Content',
      briefingBullets: ['No readable text chunks found in selected documents.'],
    };
  }

  const intent = classifyIntent(query);
  const topScored =
    intent === 'summary'
      ? selectRepresentativeChunks(scopedChunks, selectedDocs, 5)
      : scoreChunksBM25(query, scopedChunks, 5);

  const relevantChunks =
    topScored.filter((s) => s.score > 0.05).length > 0
      ? topScored.filter((s) => s.score > 0.05)
      : topScored.slice(0, 3);

  const combinedText = relevantChunks.map((s) => s.chunk.text).join('\n');
  const fullScopedText = scopedChunks.map((c) => c.text).join('\n');
  const extractedMetrics = extractKeyMetrics(combinedText, 6);
  const topTerms = extractTopTerms(combinedText, 5);
  const keyThemes = topTerms.map((t) => t.term);

  const queryTerms = new Set(tokenize(query, true));
  const candidateSentences: { sentence: string; score: number; docName: string; pageLabel: string }[] = [];

  for (const item of relevantChunks) {
    const sentences = splitSentences(item.chunk.text);
    for (const s of sentences) {
      const sTerms = tokenize(s, true);
      let overlap = 0;
      for (const t of sTerms) {
        if (queryTerms.has(t)) overlap += 1;
      }
      const hasMetrics = extractKeyMetrics(s, 2).length > 0 ? 0.5 : 0;
      const riskBonus =
        intent === 'risks' && /\b(risk|warning|throttl|fail|unencrypt|tamper|drop|severed)\b/i.test(s)
          ? 1.5
          : 0;
      candidateSentences.push({
        sentence: s,
        score: overlap + hasMetrics + riskBonus + item.score * 0.25,
        docName: item.chunk.documentName,
        pageLabel: item.chunk.pageLabel,
      });
    }
  }

  candidateSentences.sort((a, b) => b.score - a.score);
  const uniqueBullets: string[] = [];
  const seen = new Set<string>();
  for (const cand of candidateSentences) {
    const key = cand.sentence.slice(0, 48).toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      uniqueBullets.push(`${cand.sentence} (${cand.docName}, ${cand.pageLabel})`);
    }
    if (uniqueBullets.length >= 4) break;
  }

  const citations: CitationRef[] = relevantChunks.slice(0, 4).map((item, index) => ({
    id: `cit-${index + 1}-${item.chunk.id}`,
    chunkId: item.chunk.id,
    documentId: item.chunk.documentId,
    documentName: item.chunk.documentName,
    pageLabel: item.chunk.pageLabel,
    excerpt:
      item.chunk.text.length > 180
        ? item.chunk.text.slice(0, 177).trim() + '...'
        : item.chunk.text,
    score: item.score,
  }));

  const docCountLabel =
    selectedDocs.length === 1
      ? selectedDocs[0].name
      : `${selectedDocs.length} local documents`;

  const leadParagraph = buildLeadSummary(intent, docCountLabel, uniqueBullets, extractedMetrics);
  const bulletSection = uniqueBullets.map((b) => `• ${b}`).join('\n');
  const metricsLine =
    extractedMetrics.length > 0
      ? `\nKey figures detected: ${extractedMetrics.join(', ')}.`
      : '';

  const answer = `${leadParagraph}\n\n${bulletSection}${metricsLine}`;

  const fallbackTerms = extractTopTerms(fullScopedText, 4).map((t) => t.term);
  return {
    answer,
    intent,
    citations,
    extractedMetrics,
    keyThemes: keyThemes.length > 0 ? keyThemes : fallbackTerms,
    briefingTitle:
      selectedDocs.length === 1
        ? selectedDocs[0].name.replace(/\.(pdf|docx|txt)$/i, '')
        : `Cross-Document Synthesis (${selectedDocs.length} Files)`,
    briefingBullets: uniqueBullets.map((b) => b.replace(/\s*\([^)]+\)$/, '')),
  };
}

function selectRepresentativeChunks(
  chunks: DocumentChunk[],
  docs: VaultDocument[],
  limit: number
): ScoredChunk[] {
  const picked: ScoredChunk[] = [];
  for (const doc of docs) {
    const docChunks = chunks.filter((c) => c.documentId === doc.id);
    if (docChunks[0]) {
      picked.push({ chunk: docChunks[0], score: 2.0, matchedTerms: [] });
    }
    if (docChunks.length > 1 && picked.length < limit) {
      picked.push({
        chunk: docChunks[docChunks.length - 1],
        score: 1.5,
        matchedTerms: [],
      });
    }
    if (picked.length >= limit) break;
  }
  return picked.slice(0, limit);
}

function buildLeadSummary(
  intent: QueryIntent,
  docCountLabel: string,
  bullets: string[],
  metrics: string[]
): string {
  if (bullets.length === 0) {
    return `Local analysis across ${docCountLabel} completed, though no exact phrase match was found. Here are the closest passages retrieved from your edge index:`;
  }
  switch (intent) {
    case 'summary':
      return `Local edge synthesis across ${docCountLabel} highlights ${bullets.length} primary findings:`;
    case 'comparison':
      return `Cross-referencing passages across ${docCountLabel} surfaces the following distinctions and shared operational behaviors:`;
    case 'metrics':
      return metrics.length > 0
        ? `Quantitative extraction from ${docCountLabel} surfaced ${metrics.length} key figures (${metrics.slice(0, 3).join(', ')}):`
        : `Searched ${docCountLabel} for quantitative figures and operational measurements:`;
    case 'risks':
      return `Risk and incident inspection across ${docCountLabel} identified these documented warnings and operational controls:`;
    default:
      return `Based on local retrieval across ${docCountLabel}, here is the grounded breakdown from the top matching passages:`;
  }
}
