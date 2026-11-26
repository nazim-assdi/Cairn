import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateMathOrUnit,
  parseSlashCommand,
  routeOfflineQuery,
} from './assistantBrain';
import { DEFAULT_AI_SETTINGS, VaultDocument } from '../types/workspace';
import { chunkDocumentPages } from './edgeEngine';

const sampleDoc: VaultDocument = {
  id: 'd1',
  name: 'Audit.pdf',
  format: 'pdf',
  sizeBytes: 1024,
  uploadedAt: 1000,
  pageCount: 1,
  wordCount: 25,
  chunkCount: 1,
  selected: true,
  pages: [
    {
      pageNumber: 1,
      label: 'Page 1',
      text: 'Cluster uptime reached 99.94% and thermal warning occurred at 78C on Node-19.',
    },
  ],
};

test('parseSlashCommand extracts command and arguments cleanly', () => {
  assert.deepEqual(parseSlashCommand('/code Write a debounce hook'), {
    command: '/code',
    args: 'Write a debounce hook',
  });
  assert.deepEqual(parseSlashCommand('regular question'), {
    command: null,
    args: 'regular question',
  });
});

test('evaluateMathOrUnit evaluates arithmetic, percentages, and unit conversions safely', () => {
  const arith = evaluateMathOrUnit('25 * 48 + 100');
  assert.equal(arith?.resultText, '1,300');

  const pct = evaluateMathOrUnit('18.5% of $128,400');
  assert.equal(pct?.resultText, '23,754');

  const size = evaluateMathOrUnit('2 GB to MB');
  assert.equal(size?.resultText, '2,048 MB');

  const temp = evaluateMathOrUnit('78C to F');
  assert.equal(temp?.resultText, '172.4°F');
});

test('routeOfflineQuery returns TypeScript code block for CSV coding prompt instead of raw doc chunks', () => {
  const chunks = chunkDocumentPages(
    sampleDoc.id,
    sampleDoc.name,
    sampleDoc.format,
    sampleDoc.pages
  );
  const reply = routeOfflineQuery({
    query: 'Write a TypeScript helper to parse CSV metrics with strict type safety',
    selectedDocs: [sampleDoc],
    allChunks: chunks,
    history: [],
    settings: DEFAULT_AI_SETTINGS,
  });

  assert.ok(reply.answer.includes('```ts'));
  assert.ok(reply.answer.includes('parseCsvMetrics'));
  assert.equal(reply.citations.length, 0);
  assert.ok(reply.suggestedFollowUps.length > 0);
});

test('routeOfflineQuery routes document questions to grounded RAG with citations', () => {
  const chunks = chunkDocumentPages(
    sampleDoc.id,
    sampleDoc.name,
    sampleDoc.format,
    sampleDoc.pages
  );
  const reply = routeOfflineQuery({
    query: 'What are the thermal warnings and uptime in Audit.pdf?',
    selectedDocs: [sampleDoc],
    allChunks: chunks,
    history: [],
    settings: DEFAULT_AI_SETTINGS,
  });

  assert.ok(reply.citations.length > 0);
  assert.ok(reply.answer.includes('99.94%'));
});

test('routeOfflineQuery validates and formats /json payloads', () => {
  const reply = routeOfflineQuery({
    query: '/json {"status":"ok","nodes":42}',
    selectedDocs: [],
    allChunks: [],
    history: [],
    settings: DEFAULT_AI_SETTINGS,
  });
  assert.ok(reply.answer.includes('```json'));
  assert.ok(reply.answer.includes('"nodes": 42'));
});
