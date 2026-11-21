import test from 'node:test';
import assert from 'node:assert/strict';
import { answerLocalMessage } from '../src/lib/local-ai/assistant.js';

const commands = new Map([
  ['قفل_الروابط', {
    description: 'منع إرسال الروابط داخل المجموعة'
  }],
  ['ترحيب_تشغيل', {
    description: 'تفعيل رسالة الترحيب'
  }],
  ['وداع_إيقاف', {
    description: 'إيقاف رسالة الوداع'
  }]
]);

test('ignores messages not addressed to HINATA', () => {
  assert.equal(answerLocalMessage('مرحبا', commands), null);
});

test('answers a direct greeting', () => {
  assert.match(answerLocalMessage('يا هيناتا مرحبا', commands), /أهلًا/);
});

test('suggests a registered command for a link request', () => {
  const answer = answerLocalMessage('هيناتا كيف أمنع الروابط؟', commands);
  assert.match(answer, /\.قفل_الروابط/);
  assert.match(answer, /لم أنفّذ/);
});

test('does not invent a command when no match exists', () => {
  const answer = answerLocalMessage('هيناتا أريد شيئًا غير موجود', commands);
  assert.match(answer, /لم أجد أمرًا مطابقًا/);
});

test('keeps suggestions limited to registered commands', () => {
  const answer = answerLocalMessage('هيناتا الروابط', commands);
  assert.ok(answer.includes('.قفل_الروابط'));
  assert.ok(!answer.includes('.أمر_غير_موجود'));
});

test('uses previous context when matching a follow-up request', () => {
  const answer = answerLocalMessage(
    'هيناتا كيف أفعلها؟',
    commands,
    '.',
    ['أريد تفعيل الترحيب']
  );

  assert.match(answer, /\.ترحيب_تشغيل/);
});
