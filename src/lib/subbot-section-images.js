import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { getMessageContextInfo } from './text.js';
import { config } from '../config.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const DB = path.join(config.databaseDir, 'subbots', 'section-images.json');
const MAX_SIZE = 8 * 1024 * 1024;

const sections = [
  {
    key: 'الرئيسية',
    aliases: ['الرئيسية', 'القائمة الرئيسية', 'أقسام ALVARIA', 'اقسام ALVARIA']
  },
  {
    key: 'الحماية',
    aliases: ['الحماية', 'قسم الحماية', 'الحماية والأمان', 'مضاد الحماية']
  },
  {
    key: 'المراسم',
    aliases: ['المراسم', 'مراسم', 'المراسم والترحيب']
  },
  {
    key: 'الإدارة_والتحكم',
    aliases: ['الإدارة_والتحكم', 'الإدارة والتحكم', 'خيارات الإدارة']
  },
  {
    key: 'إدارة_المجموعة',
    aliases: ['إدارة_المجموعة', 'إدارة المجموعة', 'قسم إدارة المجموعة']
  },
  {
    key: 'الأعضاء',
    aliases: ['الأعضاء', 'قسم الأعضاء', 'إدارة الأعضاء']
  },
  {
    key: 'الفعاليات',
    aliases: ['الفعاليات', 'قسم الفعاليات']
  },
  {
    key: 'العشوائيات',
    aliases: ['العشوائيات', 'قسم العشوائيات']
  },
  {
    key: 'الألعاب',
    aliases: ['الألعاب', 'عالم الألعاب', 'قسم الألعاب']
  },
  {
    key: 'تحكم_البوت_الفرعي',
    aliases: [
      'تحكم_البوت_الفرعي',
      'تحكم البوت الفرعي',
      'قسم تحكم البوت الفرعي',
      'البوتات الفرعية',
      'SUBBOT CONTROL'
    ]
  },
  {
    key: 'الميديا',
    aliases: ['الميديا', 'قسم الميديا']
  },
  {
    key: 'الذكاء_الاصطناعي',
    aliases: [
      'الذكاء_الاصطناعي',
      'الذكاء الاصطناعي',
      'قسم الذكاء الاصطناعي',
      'الذكاء'
    ]
  },
  {
    key: 'الملصقات',
    aliases: ['الملصقات', 'استوديو الملصقات', 'قسم الملصقات']
  },
  {
    key: 'عالم_ALVARIA',
    aliases: ['عالم ALVARIA', 'عالم_ALVARIA', 'ALVARIA UNIVERSE', 'النخبة']
  },
  {
    key: 'المعلومات',
    aliases: ['المعلومات', 'معلومات', 'معلومات البوت']
  }
];

function normalize(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/[ًٌٍَُِّْـ]/g, '')
    .replace(/[\s_\-ـ]/g, '')
    .toLowerCase();
}

function unwrap(message) {
  let current = message;

  for (let i = 0; i < 8 && current; i++) {
    const next =
      current.ephemeralMessage?.message ||
      current.viewOnceMessage?.message ||
      current.viewOnceMessageV2?.message ||
      current.documentWithCaptionMessage?.message;

    if (!next) break;
    current = next;
  }

  return current;
}

function getImage(message) {
  return unwrap(message?.message || {})?.imageMessage || null;
}

async function readDB() {
  try {
    const value = JSON.parse(await fs.readFile(DB, 'utf8'));

    return value && typeof value === 'object' && !Array.isArray(value)
      ? value
      : {};
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

async function saveDB(data) {
  await fs.mkdir(path.dirname(DB), { recursive: true });

  const temporary = `${DB}.${process.pid}.tmp`;

  await fs.writeFile(temporary, JSON.stringify(data), 'utf8');
  await fs.rename(temporary, DB);
}

function findSection(sectionTitle) {
  const title = normalize(sectionTitle);

  if (!title) return null;

  const matches = sections
    .map(section => ({
      section,
      length: Math.max(
        0,
        ...section.aliases
          .map(alias => normalize(alias))
          .filter(alias => alias && title.includes(alias))
          .map(alias => alias.length)
      )
    }))
    .filter(item => item.length > 0)
    .sort((a, b) => b.length - a.length);

  return matches[0]?.section || null;
}

async function getImageBuffer(ctx) {
  let source = ctx.message;

  if (!getImage(source)) {
    const info = getMessageContextInfo(ctx.message?.message);

    if (!info?.quotedMessage) return null;

    source = {
      key: {
        remoteJid: ctx.jid,
        id: info.stanzaId,
        participant: info.participant || ctx.quotedParticipant || undefined,
        fromMe: false
      },
      message: info.quotedMessage
    };
  }

  const image = getImage(source);

  if (!image) return null;

  if (Number(image.fileLength) > MAX_SIZE) {
    throw new Error('حجم الصورة أكبر من 8MB.');
  }

  const downloadOptions = {};

  if (typeof ctx.sock?.updateMediaMessage === 'function') {
    downloadOptions.reuploadRequest = message =>
      ctx.sock.updateMediaMessage(message);
  }

  const downloaded = await downloadMediaMessage(
    source,
    'buffer',
    {},
    downloadOptions
  );

  const buffer = Buffer.from(downloaded);

  if (!buffer.length) {
    throw new Error('الصورة فارغة أو تعذر تنزيلها.');
  }

  if (buffer.length > MAX_SIZE) {
    throw new Error('حجم الصورة أكبر من 8MB.');
  }

  return buffer;
}

const AUTHORIZED_IMAGE_OWNER = '22383215406';

function checkSectionImageOwner(ctx) {
  const senders = [
    ctx?.senderJid,
    ctx?.senderAltJid
  ];

  const authorized = Boolean(ctx?.isMainOwner || ctx?.isOwner) ||
    senders.some(sender => {
      if (typeof sender !== 'string') return false;

      const number = sender
        .split('@')[0]
        .split(':')[0]
        .replace(/\D/g, '');

      return number === AUTHORIZED_IMAGE_OWNER;
    });

  if (!authorized) {
    return '⛔ هذا الأمر مخصص للمالك الرئيسي أو الرقم المصرح به.';
  }

  return null;
}

export function registerSubbotSectionImageCommands(commands) {
  commands.set('تبسيط', {
    description: 'إعداد صور أقسام HINATA',
    reaction: '🖼️',
    handler: async ctx => {
      const denied = checkSectionImageOwner(ctx);

      if (denied) return ctx.reply(denied);

      const list = sections.map((section, index) =>
        [
          `*${index + 1}. ${section.key.replace(/_/g, ' ')}*`,
          `رد على صورة بالأمر:`,
          `\`.صورة_قسم_${section.key}\``
        ].join('\n')
      ).join('\n\n');

      return ctx.reply([
        '*❄️ 𝑨𝒍𝒗𝒂𝒓𝒊𝒂 • إعداد صور الأقسام*',
        '',
        '_هذه القائمة مخصصة للرقم المصرح به فقط._',
        '',
        list,
        '',
        '📌 أرسل صورة مع الأمر أو رد على صورة بالأمر المناسب.',
        '',
        '*🎥 إعداد فيديوهات البوتات الفرعية*',
        'رد على فيديو بالأمر:',
        '`.فيديو_اوامر_تحديد` — حفظ الفيديو الدائري للقائمة الرئيسية.',
        '`.فيديو_تست_تحديد` — حفظ فيديو GIF لأمر تست.',
        '',
        '💾 الفيديوهات مشتركة بين البوتات الفرعية فقط.',
        '🍹 أمر `.تست` يعرض فيديو GIF بعد تعيينه.',
        '💾 الصور محفوظة في قاعدة مشتركة بين البوتات الفرعية.',
        '',
        '*❄️ 𝑨𝒍𝒗𝒂𝒓𝒊𝒂*'
      ].join('\n'));
    }
  });

  for (const section of sections) {
    commands.set(`صورة_قسم_${section.key}`, {
      description: 'تعيين صورة أحد أقسام HINATA',
      reaction: '🖼️',
      handler: async ctx => {
        const denied = checkSectionImageOwner(ctx);

        if (denied) return ctx.reply(denied);

        try {
          const buffer = await getImageBuffer(ctx);

          if (!buffer) {
            return ctx.reply(
              '⚠️ أرسل صورة مع الأمر أو رد على صورة بهذا الأمر.'
            );
          }

          const data = await readDB();

          data[section.key] = buffer.toString('base64');

          await saveDB(data);

          return ctx.reply([
            `✅ تم حفظ صورة قسم *${section.key.replace(/_/g, ' ')}* بنجاح.`,
            '💾 تم الاحتفاظ ببقية صور الأقسام دون تغيير.',
            '🌐 الصورة متاحة لجميع البوتات الفرعية.'
          ].join('\n'));
        } catch (error) {
          console.error('[ALVARIA SECTION IMAGE SAVE ERROR]', error);

          return ctx.reply(
            `❌ تعذر حفظ الصورة: ${error.message || 'خطأ غير معروف'}`
          );
        }
      }
    });
  }
}

export async function getSubbotSectionImage(ctx, sectionTitle) {
  if (!ctx?.subbotSessionId) return null;

  const section = findSection(sectionTitle);

  if (!section) return null;

  const data = await readDB();
  const encoded = data[section.key];

  if (typeof encoded !== 'string' || !encoded.length) {
    return null;
  }

  const buffer = Buffer.from(encoded, 'base64');

  if (!buffer.length || buffer.length > MAX_SIZE) {
    throw new Error(`بيانات صورة قسم ${section.key} غير صالحة.`);
  }

  return buffer;
}

export async function sendSubbotSectionImage(ctx, sectionTitle) {
  const buffer = await getSubbotSectionImage(ctx, sectionTitle);

  if (!buffer) return { sent: false };

  await ctx.sock.sendMessage(
    ctx.jid,
    {
      image: buffer,
      caption: `❄️ ${sectionTitle}\n🍹 𝑨𝒍𝒗𝒂𝒓𝒊𝒂`
    },
    { quoted: ctx.message }
  );

  return { sent: true };
}
