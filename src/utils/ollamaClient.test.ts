import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isLocalEndpointUrl,
  normalizeOllamaBaseUrl,
  parseOllamaStreamLine,
} from './ollamaClient';

test('isLocalEndpointUrl accepts localhost and 127.0.0.1 and rejects remote hosts', () => {
  assert.equal(isLocalEndpointUrl('http://localhost:11434'), true);
  assert.equal(isLocalEndpointUrl('http://127.0.0.1:11434'), true);
  assert.equal(isLocalEndpointUrl('https://api.example.com'), false);
  assert.equal(isLocalEndpointUrl('not-a-url'), false);
});

test('normalizeOllamaBaseUrl strips trailing slashes', () => {
  assert.equal(
    normalizeOllamaBaseUrl('http://localhost:11434///'),
    'http://localhost:11434'
  );
});

test('parseOllamaStreamLine extracts token content, completion flag, and errors', () => {
  const chunk = parseOllamaStreamLine(
    '{"model":"qwen2.5-coder:7b","message":{"role":"assistant","content":"const x = 1;"},"done":false}'
  );
  assert.deepEqual(chunk, { token: 'const x = 1;', done: false });

  const end = parseOllamaStreamLine('{"done":true}');
  assert.deepEqual(end, { token: '', done: true });

  const err = parseOllamaStreamLine('{"error":"model qwen2.5-coder:7b not found"}');
  assert.equal(err?.error, 'model qwen2.5-coder:7b not found');
});
