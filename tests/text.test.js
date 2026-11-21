import test from 'node:test';
import assert from 'node:assert/strict';
import { decorateText, extractMessageText, normalizeText, parseCommand } from '../src/lib/text.js';

test('normalizes Arabic tashkeel and case', () => {
  assert.equal(normalizeText('أَهْلًا PING'), 'أهلا ping');
});

test('parses prefixed command and preserves remaining text', () => {
  assert.deepEqual(parseCommand('.زخرفة HINATA BOT'), {
    name: 'زخرفة', args: ['HINATA', 'BOT'], text: 'HINATA BOT', rawName: 'زخرفة'
  });
});

test('ignores messages without the configured prefix', () => {
  assert.equal(parseCommand('ping'), null);
  assert.equal(parseCommand('.'), null);
});

test('extracts normal, caption and interactive response text', () => {
  assert.equal(extractMessageText({ conversation: '.ping' }), '.ping');
  assert.equal(extractMessageText({ imageMessage: { caption: '.منيو' } }), '.منيو');
  assert.equal(extractMessageText({ interactiveResponseMessage: { nativeFlowResponseMessage: { paramsJson: '{"id":".ping"}' } } }), '.ping');
});

test('decorates without deleting Arabic words', () => {
  assert.match(decorateText('مرحبا HINATA'), /مرحبا/);
  assert.notEqual(decorateText('HINATA'), 'HINATA');
  assert.equal(Array.from(decorateText('ABCDEFGHIJKLMNOPQRSTUVWXYZ', 1)).length, 26);
});
