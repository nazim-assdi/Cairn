export type MarkdownBlock =
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'code'; language: string; code: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'blockquote'; text: string }
  | { type: 'paragraph'; text: string };

export type InlineSegment =
  | { type: 'text'; value: string }
  | { type: 'bold'; value: string }
  | { type: 'code'; value: string };

export function parseMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks: MarkdownBlock[] = [];

  let i = 0;
  let paragraphBuf: string[] = [];

  const flushParagraph = () => {
    if (paragraphBuf.length > 0) {
      const joined = paragraphBuf.join('\n').trim();
      if (joined) {
        blocks.push({ type: 'paragraph', text: joined });
      }
      paragraphBuf = [];
    }
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Fenced code block
    if (trimmed.startsWith('```')) {
      flushParagraph();
      const language = trimmed.slice(3).trim() || 'text';
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i += 1;
      }
      blocks.push({
        type: 'code',
        language,
        code: codeLines.join('\n'),
      });
      i += 1;
      continue;
    }

    if (!trimmed) {
      flushParagraph();
      i += 1;
      continue;
    }

    // Heading
    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length as 1 | 2 | 3,
        text: headingMatch[2].trim(),
      });
      i += 1;
      continue;
    }

    // Blockquote
    if (trimmed.startsWith('> ')) {
      flushParagraph();
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('> ')) {
        quoteLines.push(lines[i].trim().slice(2));
        i += 1;
      }
      blocks.push({ type: 'blockquote', text: quoteLines.join(' ') });
      continue;
    }

    // Unordered list (•, -, *)
    if (/^(?:•|-|\*)\s+/.test(trimmed)) {
      flushParagraph();
      const items: string[] = [];
      while (i < lines.length && /^(?:•|-|\*)\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^(?:•|-|\*)\s+/, ''));
        i += 1;
      }
      blocks.push({ type: 'list', ordered: false, items });
      continue;
    }

    // Ordered list
    if (/^\d+\.\s+/.test(trimmed)) {
      flushParagraph();
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ''));
        i += 1;
      }
      blocks.push({ type: 'list', ordered: true, items });
      continue;
    }

    paragraphBuf.push(line);
    i += 1;
  }

  flushParagraph();
  return blocks;
}

export function parseInlineSegments(text: string): InlineSegment[] {
  const segments: InlineSegment[] = [];
  const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        type: 'text',
        value: text.slice(lastIndex, match.index),
      });
    }
    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      segments.push({ type: 'bold', value: token.slice(2, -2) });
    } else if (token.startsWith('`') && token.endsWith('`')) {
      segments.push({ type: 'code', value: token.slice(1, -1) });
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) });
  }

  return segments;
}

export function deriveSessionTitle(firstPrompt: string): string {
  const clean = firstPrompt.replace(/\s+/g, ' ').trim();
  if (!clean) return 'New conversation';
  return clean.length > 42 ? `${clean.slice(0, 39).trim()}...` : clean;
}
