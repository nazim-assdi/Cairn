import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import mammoth from 'mammoth';
import { DocumentFormat, DocumentPage, VaultDocument } from '../types/workspace';
import { chunkDocumentPages, countWords } from './edgeEngine';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB local cap

export function detectDocumentFormat(filename: string): DocumentFormat | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.docx')) return 'docx';
  if (lower.endsWith('.txt') || lower.endsWith('.md') || lower.endsWith('.csv')) return 'txt';
  return null;
}

export async function parseLocalDocument(file: File): Promise<{
  doc: VaultDocument;
  chunks: ReturnType<typeof chunkDocumentPages>;
}> {
  const format = detectDocumentFormat(file.name);
  if (!format) {
    throw new Error(
      `Unsupported file format for "${file.name}". Please upload PDF, DOCX, or TXT files.`
    );
  }

  if (file.size === 0) {
    throw new Error(`"${file.name}" is empty (0 bytes).`);
  }

  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`"${file.name}" exceeds the 25 MB local processing limit.`);
  }

  let pages: DocumentPage[] = [];

  if (format === 'txt') {
    const rawText = await file.text();
    const cleaned = rawText.replace(/\r\n/g, '\n').trim();
    if (!cleaned) {
      throw new Error(`"${file.name}" contains no readable text.`);
    }
    pages = splitPlainTextIntoSections(cleaned, 'Lines');
  } else if (format === 'docx') {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    const cleaned = (result.value || '').replace(/\r\n/g, '\n').trim();
    if (!cleaned) {
      throw new Error(`No readable text could be extracted from "${file.name}".`);
    }
    pages = splitPlainTextIntoSections(cleaned, 'Section');
  } else if (format === 'pdf') {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(arrayBuffer),
      useSystemFonts: true,
    });
    const pdf = await loadingTask.promise;
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageStrings = textContent.items
        .map((item) => ('str' in item ? item.str : ''))
        .filter(Boolean);
      const text = pageStrings.join(' ').replace(/\s+/g, ' ').trim();
      if (text) {
        pages.push({
          pageNumber: pageNum,
          label: `Page ${pageNum}`,
          text,
        });
      }
    }
    if (pages.length === 0) {
      throw new Error(
        `"${file.name}" appears to have no extractable text layer (scanned image PDF).`
      );
    }
  }

  const fullText = pages.map((p) => p.text).join('\n');
  const id = `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const chunks = chunkDocumentPages(id, file.name, format, pages);

  const doc: VaultDocument = {
    id,
    name: file.name,
    format,
    sizeBytes: file.size,
    uploadedAt: Date.now(),
    pageCount: pages.length,
    wordCount: countWords(fullText),
    chunkCount: chunks.length,
    pages,
    selected: true,
  };

  return { doc, chunks };
}

function splitPlainTextIntoSections(text: string, labelPrefix: string): DocumentPage[] {
  const lines = text.split('\n');
  if (labelPrefix === 'Lines') {
    const chunkSize = 40;
    const pages: DocumentPage[] = [];
    for (let i = 0; i < lines.length; i += chunkSize) {
      const slice = lines.slice(i, i + chunkSize).join('\n').trim();
      if (slice) {
        const startLine = i + 1;
        const endLine = Math.min(lines.length, i + chunkSize);
        pages.push({
          pageNumber: pages.length + 1,
          label: `Lines ${startLine}-${endLine}`,
          text: slice,
        });
      }
    }
    return pages;
  }

  const targetChars = 1600;
  const pages: DocumentPage[] = [];
  let buf = '';
  for (const line of lines) {
    if ((buf + '\n' + line).length > targetChars && buf.trim()) {
      const idx = pages.length + 1;
      pages.push({
        pageNumber: idx,
        label: `${labelPrefix} ${idx}`,
        text: buf.trim(),
      });
      buf = line;
    } else {
      buf = buf ? `${buf}\n${line}` : line;
    }
  }
  if (buf.trim()) {
    const idx = pages.length + 1;
    pages.push({
      pageNumber: idx,
      label: `${labelPrefix} ${idx}`,
      text: buf.trim(),
    });
  }
  return pages;
}
