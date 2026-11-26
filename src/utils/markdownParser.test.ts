import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveSessionTitle,
  parseInlineSegments,
  parseMarkdownBlocks,
} from './markdownParser';

test('parseMarkdownBlocks parses fenced code blocks, headings, and bullet lists', () => {
  const sample = [
    '### Summary',
    'Here is a **grounded** function:',
    '```ts',
    'const x = 42;',
    '```',
    '• First finding',
    '• Second finding',
  ].join('\n');

  const blocks = parseMarkdownBlocks(sample);
  assert.equal(blocks[0].type, 'heading');
  assert.equal(blocks[1].type, 'paragraph');
  assert.equal(blocks[2].type, 'code');
  if (blocks[2].type === 'code') {
    assert.equal(blocks[2].language, 'ts');
    assert.equal(blocks[2].code, 'const x = 42;');
  }
  assert.equal(blocks[3].type, 'list');
  if (blocks[3].type === 'list') {
    assert.equal(blocks[3].items.length, 2);
  }
});

test('parseInlineSegments splits bold and inline code cleanly', () => {
  const segs = parseInlineSegments('Use `ollama run` for **local** speed.');
  assert.deepEqual(segs, [
    { type: 'text', value: 'Use ' },
    { type: 'code', value: 'ollama run' },
    { type: 'text', value: ' for ' },
    { type: 'bold', value: 'local' },
    { type: 'text', value: ' speed.' },
  ]);
});

test('deriveSessionTitle truncates long prompts cleanly', () => {
  assert.equal(deriveSessionTitle('Hello'), 'Hello');
  const long = deriveSessionTitle(
    'Summarize all thermal risks and operational metrics across the three documents'
  );
  assert.ok(long.length <= 42);
  assert.ok(long.endsWith('...'));
});
