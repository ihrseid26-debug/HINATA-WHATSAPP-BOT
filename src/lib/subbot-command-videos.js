import fs from 'node:fs/promises';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import path from 'node:path';
import { getMessageContextInfo } from './text.js';
import { config } from '../config.js';

const DB = path.join(config.databaseDir, 'subbots', 'command-videos.json');

const MAX_VIDEO_SIZE = 16 * 1024 * 1024;

const VIDEO_KEYS = Object.freeze({
  menu: 'menuVideo',
  test: 'testVideo'
});

function unwrapMessage(message) {
  let current = message || {};

  const wrappers = [
    'ephemeralMessage',
    'viewOnceMessage',
    'viewOnceMessageV2',
    'viewOnceMessageV2Extension',
    'documentWithCaptionMessage',
    'deviceSentMessage',
    'editedMessage'
  ];

  for (let i = 0; i < 10 && current; i += 1) {
    let next = null;

    for (const key of wrappers) {
      if (current[key]?.message) {
        next = current[key].message;
        break;
      }
    }

    if (!next) break;
    current = next;
  }

  return current || {};
}

function getVideoNode(message) {
  return unwrapMessage(message?.message || {}).videoMessage || null;
}

async function readDB() {
  try {
    const parsed = JSON.parse(await fs.readFile(DB, 'utf8'));

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    return parsed;
  } catch (error) {
    if (error?.code === 'ENOENT') return {};
    throw error;
  }
}

async function saveDB(data) {
  await fs.mkdir(path.dirname(DB), { recursive: true });

  const temporary = `${DB}.${process.pid}.${Date.now()}.tmp`;

  try {
    await fs.writeFile(
      temporary,
      JSON.stringify(data),
      { encoding: 'utf8', mode: 0o600 }
    );

    await fs.rename(temporary, DB);
  } catch (error) {
    await fs.rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

function checkSubbotOwner(ctx) {
  if (!ctx.subbotSessionId) {
    return 'هذا الأمر متاح في البوتات الفرعية فقط.';
  }

  if (!ctx.isSubbotOwner) {
    return 'هذا الأمر مخصص لمالك البوت الفرعي فقط.';
  }

  return null;
}

function makeQuotedSource(ctx, info) {
  if (!info?.quotedMessage || !info?.stanzaId) {
    return null;
  }

  return {
    key: {
      remoteJid: ctx.jid,
      id: info.stanzaId,
      participant: info.participant || ctx.quotedParticipant || undefined,
      fromMe: false
    },
    message: info.quotedMessage
  };
}

async function getVideoBuffer(ctx) {
  let source = ctx.message;

  if (!getVideoNode(source)) {
    const info = getMessageContextInfo(ctx.message?.message || {});
    source = makeQuotedSource(ctx, info);
  }

  if (!source || !getVideoNode(source)) {
    return null;
  }

  const videoNode = getVideoNode(source);
  const declaredSize = Number(videoNode.fileLength || 0);

  if (Number.isFinite(declaredSize) && declaredSize > MAX_VIDEO_SIZE) {
    throw new Error('حجم الفيديو أكبر من 16MB.');
  }

  const options = {};

  if (typeof ctx.sock?.updateMediaMessage === 'function') {
    options.reuploadRequest = message =>
      ctx.sock.updateMediaMessage(message);
  }

  const downloaded = await downloadMediaMessage(
    source,
    'buffer',
    {},
    options
  );

  const buffer = Buffer.from(downloaded || []);

  if (!buffer.length) {
    throw new Error('الفيديو فارغ أو تعذر تنزيله.');
  }

  if (buffer.length > MAX_VIDEO_SIZE) {
    throw new Error('حجم الفيديو بعد التنزيل أكبر من 16MB.');
  }

  return buffer;
}

async function saveSelectedVideo(ctx, type) {
  const denied = checkSubbotOwner(ctx);

  if (denied) {
    return ctx.reply(denied);
  }

  try {
    const buffer = await getVideoBuffer(ctx);

    if (!buffer) {
      return ctx.reply(
        '⚠️ أرسل فيديو مع الأمر أو رد على فيديو بالأمر المطلوب.'
      );
    }

    const data = await readDB();

    data[VIDEO_KEYS[type]] = buffer.toString('base64');
    data.version = 1;
    data.updatedAt = new Date().toISOString();

    await saveDB(data);

    const label = type === 'menu'
      ? 'الفيديو الدائري للقائمة الرئيسية'
      : 'فيديو أمر تست';

    return ctx.reply([
      `✅ تم حفظ *${label}* بنجاح.`,
      '🌐 الفيديو محفوظ في قاعدة مشتركة بين البوتات الفرعية.',
      '🔒 لن يظهر في البوت الرئيسي.',
      `📦 الحجم: ${(buffer.length / 1024 / 1024).toFixed(2)} MB`
    ].join('\n'));
  } catch (error) {
    console.error('[ALVARIA SUBBOT VIDEO SAVE ERROR]', error);

    return ctx.reply(
      `❌ تعذر حفظ الفيديو: ${error?.message || 'خطأ غير معروف'}`
    );
  }
}

export function registerSubbotCommandVideoCommands(commands) {
  commands.set('فيديو_اوامر_تحديد', {
    description: 'تحديد الفيديو الدائري للقائمة الرئيسية',
    reaction: '🎥',
    handler: ctx => saveSelectedVideo(ctx, 'menu')
  });

  commands.set('فيديو_تست_تحديد', {
    description: 'تحديد فيديو GIF لأمر تست',
    reaction: '🎥',
    handler: ctx => saveSelectedVideo(ctx, 'test')
  });

  commands.set('تست', {
    description: 'عرض فيديو الاختبار',
    reaction: '🍹',
    handler: async ctx => {
      if (!ctx.subbotSessionId) {
        return ctx.reply('هذا الأمر متاح في البوتات الفرعية فقط.');
      }

      try {
        const buffer = await getSubbotCommandVideo(ctx, 'test');

        if (!buffer) {
          return ctx.reply(
            '⚠️ لم يتم تعيين فيديو أمر تست بعد.\n' +
            'يمكن لمالك البوت الفرعي تعيينه عبر الرد على فيديو بالأمر `.فيديو_تست_تحديد`.'
          );
        }

        const result = await ctx.sock.sendMessage(
          ctx.jid,
          {
            video: buffer,
            mimetype: 'video/mp4',
            gifPlayback: true
          },
          { quoted: ctx.message }
        );

        return result;
      } catch (error) {
        console.error('[ALVARIA SUBBOT TEST VIDEO ERROR]', error);

        return ctx.reply(
          '❌ تعذر إرسال فيديو الاختبار. تحقق من الفيديو المحفوظ واتصال البوت.'
        );
      }
    }
  });
}


export async function getSubbotCommandVideo(ctx, type) {
  if (!ctx?.subbotSessionId) return null;

  const key = VIDEO_KEYS[type];

  if (!key) return null;

  const data = await readDB();
  const encoded = data[key];

  if (typeof encoded !== 'string' || !encoded.length) {
    return null;
  }

  const buffer = Buffer.from(encoded, 'base64');

  if (
    !buffer.length ||
    buffer.length > MAX_VIDEO_SIZE ||
    buffer.toString('base64') !== encoded
  ) {
    throw new Error('بيانات الفيديو المحفوظ غير صالحة.');
  }

  return buffer;
}
