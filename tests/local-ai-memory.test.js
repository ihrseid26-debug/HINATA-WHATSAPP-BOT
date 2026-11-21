import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getConversationContext,
  rememberConversationTurn
} from '../src/lib/local-ai/conversation-memory.js';

test('keeps context isolated by sender', () => {
  const sock = {};
  rememberConversationTurn(sock, 'group@g.us', 'one@s.whatsapp.net', 'ترحيب');
  rememberConversationTurn(sock, 'group@g.us', 'two@s.whatsapp.net', 'روابط');

  assert.deepEqual(
    getConversationContext(sock, 'group@g.us', 'one@s.whatsapp.net'),
    ['ترحيب']
  );

  assert.deepEqual(
    getConversationContext(sock, 'group@g.us', 'two@s.whatsapp.net'),
    ['روابط']
  );
});

test('keeps context isolated by chat', () => {
  const sock = {};
  rememberConversationTurn(sock, 'first@g.us', 'user@s.whatsapp.net', 'ترحيب');

  assert.deepEqual(
    getConversationContext(sock, 'second@g.us', 'user@s.whatsapp.net'),
    []
  );
});

test('keeps context isolated by socket', () => {
  const firstSock = {};
  const secondSock = {};

  rememberConversationTurn(firstSock, 'group@g.us', 'user@s.whatsapp.net', 'ترحيب');

  assert.deepEqual(
    getConversationContext(secondSock, 'group@g.us', 'user@s.whatsapp.net'),
    []
  );
});

test('limits stored turns', () => {
  const sock = {};

  for (let i = 1; i <= 12; i++) {
    rememberConversationTurn(sock, 'group@g.us', 'user@s.whatsapp.net', `رسالة ${i}`);
  }

  const context = getConversationContext(sock, 'group@g.us', 'user@s.whatsapp.net');

  assert.equal(context.length, 4);
  assert.equal(context.at(-1), 'رسالة 12');
});
