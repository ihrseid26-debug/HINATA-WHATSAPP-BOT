
import {
  findNewsletterPost
} from '../lib/newsletter-post-cache.js';

const ALLOWED_OWNER = '22383215406';

function normalizeNumber(value = '') {
  return String(value)
    .split('@')[0]
    .split(':')[0]
    .replace(/\D/g, '');
}

function isAuthorized(ctx) {
  return Boolean(ctx?.isMainOwner || ctx?.isOwner) ||
    [ctx?.senderJid, ctx?.senderAltJid]
      .some(jid => normalizeNumber(jid) === ALLOWED_OWNER);
}

function extractEmoji(input = '') {
  const value = String(input).trim();
  if (!value) return null;

  const emoji = value.split(/\s+/u)[0];

  if (!emoji || emoji.length > 24) return null;

  return emoji;
}

function getQuotedMessage(message) {
  const visited = new Set();

  function walk(value, depth = 0) {
    if (
      !value ||
      typeof value !== 'object' ||
      depth > 15 ||
      visited.has(value)
    ) {
      return null;
    }

    visited.add(value);

    if (Array.isArray(value)) {
      for (const item of value) {
        const result = walk(item, depth + 1);
        if (result) return result;
      }
      return null;
    }

    for (const child of Object.values(value)) {
      if (!child || typeof child !== 'object') continue;

      if (child.quotedMessage && typeof child.quotedMessage === 'object') {
        return child.quotedMessage;
      }

      const result = walk(child, depth + 1);
      if (result) return result;
    }

    return null;
  }

  return walk(message);
}

export default {
  name: 'رشق',
  command: 'رشق',
  category: 'owner',
  ownerOnly: true,
  description: 'التفاعل مع منشور قناة بعد إعادة توجيهه',

  async handler(ctx) {
    try {
      if (!isAuthorized(ctx)) {
        return ctx.reply('⛔ هذا الأمر مخصص للرقم المصرح به فقط.');
      }

      const sock = ctx.sock;

      if (typeof sock?.newsletterReactMessage !== 'function') {
        return ctx.reply('❌ هذه الجلسة لا تدعم تفاعلات منشورات القنوات.');
      }

      let input = String(
        ctx.text || ctx.args?.join(' ') || ''
      ).trim();

      input = input.replace(/^[.!/#]رشق\s*/u, '');

      const emoji = extractEmoji(input);

      if (!emoji) {
        return ctx.reply(
          '🌸 طريقة الاستخدام:\n\n' +
          '1. أعد توجيه منشور القناة إلى البوت.\n' +
          '2. اضغط رد على المنشور المعاد توجيهه.\n' +
          '3. أرسل: .رشق ❄️'
        );
      }

      const currentMessage = ctx.message?.message;

      if (!currentMessage) {
        return ctx.reply('❌ لم أتمكن من قراءة رسالة الأمر.');
      }

      const quotedMessage = getQuotedMessage(currentMessage);

      if (!quotedMessage) {
        return ctx.reply(
          '❌ لم أجد المنشور المقتبس.\n' +
          'أعد توجيه منشور القناة ثم رد عليه بالأمر.'
        );
      }

      const result = findNewsletterPost(sock, quotedMessage);

      if (result.status === 'empty') {
        return ctx.reply(
          '⚠️ ذاكرة منشورات القنوات فارغة.\n' +
          'انتظر حتى يستقبل البوت منشورًا من القناة بعد تشغيله، ثم جرّب مجددًا.'
        );
      }

      if (result.status === 'no-text') {
        return ctx.reply('❌ المنشور المقتبس لا يحتوي نصًا يمكن مطابقته.');
      }

      if (result.status === 'not-found') {
        return ctx.reply(
          '❌ لم أجد هذا المنشور في ذاكرة القنوات.\n' +
          'تأكد أن البوت استقبل المنشور بعد تشغيله، ثم أعد المحاولة.'
        );
      }

      if (result.status === 'ambiguous') {
        return ctx.reply(
          '⚠️ وجدت أكثر من منشور يحمل النص نفسه.\n' +
          'لا يمكنني تحديد المنشور الأصلي بأمان.'
        );
      }

      const post = result.post;

      await sock.newsletterReactMessage(
        post.jid,
        post.serverId,
        emoji
      );

      return ctx.reply(
        '✅ تم إرسال التفاعل ' + emoji + ' إلى منشور القناة.'
      );
    } catch (error) {
      console.error('[HINATA REACT ERROR]', error?.stack || error);

      return ctx.reply(
        '❌ تعذر إرسال التفاعل.\n' +
        String(error?.message || error).slice(0, 400)
      );
    }
  }
};
