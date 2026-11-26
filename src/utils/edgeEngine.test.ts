import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeDocumentsLocally,
  buildLlmMessages,
  chunkDocumentPages,
  classifyIntent,
  detectConversationalIntent,
  detectNaturalMediaRequest,
  extractKeyMetrics,
  extractTopTerms,
  retrieveContextForQuery,
  scoreChunksBM25,
  tokenize,
} from './edgeEngine';
import { ChatMessage, VaultDocument } from '../types/workspace';

const mockDocs: VaultDocument[] = [
  {
    id: 'doc-1',
    name: 'Resilience.pdf',
    format: 'pdf',
    sizeBytes: 1200,
    uploadedAt: 1000,
    pageCount: 2,
    wordCount: 60,
    chunkCount: 2,
    selected: true,
    pages: [
      {
        pageNumber: 1,
        label: 'Page 1',
        text: 'Regional cluster uptime reached 99.94% across 42 stations. Operating expenditure stayed at $128,400.',
      },
      {
        pageNumber: 2,
        label: 'Page 2',
        text: 'Thermal throttling above 78C occurred on Node-19 during video encoding. Patch v4.2 lowers TDP by 19%.',
      },
    ],
  },
  {
    id: 'doc-2',
    name: 'Privacy.docx',
    format: 'docx',
    sizeBytes: 900,
    uploadedAt: 2000,
    pageCount: 1,
    wordCount: 40,
    chunkCount: 1,
    selected: true,
    pages: [
      {
        pageNumber: 1,
        label: 'Section 1',
        text: 'All PDF and DOCX parsing runs locally inside IndexedDB with zero external network egress.',
      },
    ],
  },
];

test('tokenize normalizes plurals and strips stop words', () => {
  const tokens = tokenize('What are the thermal warnings on stations?');
  assert.ok(tokens.includes('thermal'));
  assert.ok(tokens.includes('warning'));
  assert.ok(tokens.includes('station'));
  assert.equal(tokens.includes('what'), false);
});

test('chunkDocumentPages preserves page labels and overlapping chunks without mid-word cuts', () => {
  const chunks = chunkDocumentPages('doc-1', 'Resilience.pdf', 'pdf', mockDocs[0].pages, 90, 20);
  assert.ok(chunks.length >= 2);
  assert.equal(chunks[0].pageLabel, 'Page 1');
  assert.equal(chunks[chunks.length - 1].pageLabel, 'Page 2');

  const longPages = [
    {
      pageNumber: 1,
      label: 'Lines 1-5',
      text: 'Alpha station reported uninterrupted telemetry during offline testing.\nBeta station verified zero packet drops across local NVMe buffers.',
    },
  ];
  const longChunks = chunkDocumentPages('doc-long', 'Long.txt', 'txt', longPages, 75, 22);
  assert.ok(longChunks.length >= 2);
  assert.equal(longChunks[1].text.startsWith('rrupted'), false);
});

test('scoreChunksBM25 ranks thermal chunk highest for thermal query', () => {
  const chunks = mockDocs.flatMap((d) =>
    chunkDocumentPages(d.id, d.name, d.format, d.pages)
  );
  const scored = scoreChunksBM25('thermal throttling Node-19', chunks, 3);
  assert.ok(scored.length > 0);
  assert.equal(scored[0].chunk.pageLabel, 'Page 2');
  assert.ok(scored[0].score > 0);
});

test('extractKeyMetrics detects percentages, currency, and temperatures', () => {
  const metrics = extractKeyMetrics(
    'Uptime reached 99.94% at $128,400 while Node-19 peaked at 78C on 2026-09-14.'
  );
  assert.ok(metrics.includes('99.94%'));
  assert.ok(metrics.includes('$128,400'));
  assert.ok(metrics.includes('2026-09-14'));
});

test('classifyIntent detects summary, metrics, and risks', () => {
  assert.equal(classifyIntent('Summarize the uploaded files'), 'summary');
  assert.equal(classifyIntent('What are the uptime metrics and budget?'), 'metrics');
  assert.equal(classifyIntent('List any thermal risks or incidents'), 'risks');
});

test('analyzeDocumentsLocally respects document selection and returns citations', () => {
  const chunks = mockDocs.flatMap((d) =>
    chunkDocumentPages(d.id, d.name, d.format, d.pages)
  );
  const result = analyzeDocumentsLocally('How is privacy enforced locally?', [mockDocs[1]], chunks);
  assert.ok(result.citations.length > 0);
  assert.equal(result.citations[0].documentName, 'Privacy.docx');
  assert.ok(result.answer.includes('IndexedDB'));
});

test('analyzeDocumentsLocally handles empty selection gracefully', () => {
  const result = analyzeDocumentsLocally('Summarize everything', [], []);
  assert.equal(result.citations.length, 0);
  assert.ok(result.answer.includes('No documents are currently selected'));
});

test('extractTopTerms counts meaningful terms', () => {
  const terms = extractTopTerms('local vault local indexing private vault edge edge edge', 3);
  assert.equal(terms[0].term, 'edge');
  assert.equal(terms[0].count, 3);
});

test('conversational intent handles greetings, identity, and follow-ups', () => {
  assert.equal(detectConversationalIntent('Hello!'), 'greeting');
  assert.equal(detectConversationalIntent('kemon acho'), 'greeting');
  assert.equal(detectConversationalIntent('Who are you and are you offline?'), 'identity');

  const history: ChatMessage[] = [
    {
      id: 'm1',
      role: 'assistant',
      content: 'Findings:\n• Uptime reached 99.94%.\n• Thermal warning on Node-19.',
      createdAt: 1000,
    },
  ];
  const emailRes = analyzeDocumentsLocally('write an email summary', mockDocs, [], history);
  assert.equal(emailRes.intent, 'conversation');
  assert.ok(emailRes.answer.includes('Subject:'));
  assert.ok(emailRes.answer.includes('99.94%'));
});

test('detectNaturalMediaRequest catches image, audio, and video requests in chat', () => {
  assert.equal(detectNaturalMediaRequest('generate an image of the resilience findings'), 'image');
  assert.equal(detectNaturalMediaRequest('draw a cat on a roof'), 'image');
  assert.equal(detectNaturalMediaRequest('ekta beraler chobi anko'), 'image');
  assert.equal(detectNaturalMediaRequest('create an audio briefing'), 'audio');
  assert.equal(detectNaturalMediaRequest('make a video recap of these docs'), 'video');
  assert.equal(detectNaturalMediaRequest('video of a rocket launching into space'), 'video');
  assert.equal(detectNaturalMediaRequest('What does the video section in the pdf say?'), null);
  assert.equal(detectNaturalMediaRequest('Write a React video player component'), null);
  assert.equal(detectNaturalMediaRequest('What was the uptime in Q3?'), null);
});

test('buildLlmMessages formats grounded RAG context and conversation history', () => {
  const chunks = mockDocs.flatMap((d) =>
    chunkDocumentPages(d.id, d.name, d.format, d.pages)
  );
  const rag = retrieveContextForQuery('uptime', mockDocs, chunks);
  const msgs = buildLlmMessages('What is the uptime?', [], rag.contextBlock, mockDocs);
  assert.equal(msgs[0].role, 'system');
  assert.ok(msgs[0].content.includes('99.94%'));
  assert.equal(msgs[msgs.length - 1].role, 'user');
});

test('analyzeDocumentsLocally keeps decimal percentages like 99.94% intact in sentences', () => {
  const chunks = mockDocs.flatMap((d) =>
    chunkDocumentPages(d.id, d.name, d.format, d.pages)
  );
  const res = analyzeDocumentsLocally('Summarize uptime across stations', [mockDocs[0]], chunks);
  assert.ok(res.briefingBullets.some((b) => b.includes('99.94%')));
});
