import { addHinataStickerMetadata } from './sticker-metadata.js';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const exec = promisify(execFile);
const MAX_SIZE = 15 * 1024 * 1024;
const SAVE_DIR = path.resolve('data/stickers');

function unwrap(message) {
  let current = message || {};

  for (let i = 0; i < 8; i++) {
    const wrapper =
      current.ephemeralMessage ||
      current.viewOnceMessage ||
      current.viewOnceMessageV2 ||
      current.documentWithCaptionMessage;

    if (!wrapper?.message) break;
    current = wrapper.message;
  }

  return current || {};
}

function quotedInfo(ctx) {
  const current = unwrap(ctx.message?.message);
  const info =
    current.extendedTextMessage?.contextInfo ||
    current.imageMessage?.contextInfo ||
    current.videoMessage?.contextInfo;

  if (!info?.quotedMessage) return null;

  return {
    message: unwrap(info.quotedMessage),
    key: {
      remoteJid: ctx.jid,
      id: info.stanzaId,
      participant: info.participant,
      fromMe: false
    }
  };
}

function mediaType(message, types) {
  for (const type of types) {
    if (message?.[type]) return type;
  }
  return null;
}

async function getMedia(ctx, types) {
  const quoted = quotedInfo(ctx);

  let message;
  let selectedType;

  if (quoted) {
    selectedType = mediaType(quoted.message, types);

    if (selectedType) {
      message = {
        key: quoted.key,
        message: quoted.message
      };
    }
  }

  if (!message) {
    const current = unwrap(ctx.message?.message);
    selectedType = mediaType(current, types);

    if (selectedType) message = ctx.message;
  }

  if (!message) return null;

  const buffer = await downloadMediaMessage(
    message,
    'buffer',
    {},
    {}
  );

  const result = Buffer.from(buffer);

  if (!result.length || result.length > MAX_SIZE) {
    throw new Error('MEDIA_SIZE');
  }

  return {
    buffer: result,
    type: selectedType
  };
}

async function ffmpeg(inputBuffer, extension, args) {
  const dir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'hinata-')
  );

  const input = path.join(dir, 'input');
  const output = path.join(dir, `output.${extension}`);

  try {
    await fs.writeFile(input, inputBuffer);

    await exec(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel', 'error',
        '-y',
        '-i', input,
        ...args,
        output
      ],
      {
        timeout: 45000,
        maxBuffer: 4 * 1024 * 1024
      }
    );

    const data = await fs.readFile(output);

    if (!data.length || data.length > MAX_SIZE) {
      throw new Error('OUTPUT_SIZE');
    }

    return data;
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

async function sendSticker(ctx, buffer, caption, options = {}) {
  let stickerBuffer = buffer;

  if (options.metadata !== false) {
    stickerBuffer = await addHinataStickerMetadata(
      buffer,
      options.metadataOptions || {}
    );
  }

  const stickerMessage = { sticker: stickerBuffer };

  if (options.stickerAudio) {
    stickerMessage.stickerAudio = options.stickerAudio;
  }

  await ctx.sock.sendMessage(
    ctx.jid,
    stickerMessage,
    { quoted: ctx.message }
  );

  if (caption) await ctx.reply(caption);
}

async function sendImage(ctx, buffer, caption = '') {
  await ctx.sock.sendMessage(
    ctx.jid,
    {
      image: buffer,
      caption
    },
    { quoted: ctx.message }
  );
}

async function stickerInput(ctx) {
  const media = await getMedia(ctx, ['stickerMessage']);

  if (!media) {
    await ctx.reply('📌 ردّ على ملصق لتنفيذ هذا الأمر.');
    return null;
  }

  return media.buffer;
}

async function imageInput(ctx) {
  const media = await getMedia(ctx, ['imageMessage']);

  if (!media) {
    await ctx.reply('🖼️ أرسل صورة أو ردّ على صورة بهذا الأمر.');
    return null;
  }

  return media.buffer;
}

async function transformSticker(ctx, filters, extra = []) {
  const input = await stickerInput(ctx);
  if (!input) return;

  const output = await ffmpeg(
    input,
    'webp',
    [
      '-vf',
      filters,
      '-vcodec', 'libwebp',
      '-lossless', '0',
      '-q:v', '75',
      '-loop', '0',
      '-an',
      ...extra
    ]
  );

  await sendSticker(ctx, output);
}

async function imageToSticker(ctx, filters = null) {
  const input = await imageInput(ctx);
  if (!input) return;

  const output = await ffmpeg(
    input,
    'webp',
    [
      '-vf',
      filters ||
      'scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000',
      '-vcodec', 'libwebp',
      '-lossless', '1',
      '-q:v', '80',
      '-an'
    ]
  );

  await sendSticker(ctx, output);
}

function argumentNumber(ctx, fallback = 90) {
  const value = Array.isArray(ctx.args)
    ? ctx.args[0]
    : String(ctx.text || '').trim().split(/\s+/)[0];

  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
}

function safeUserId(ctx) {
  return String(ctx.senderJid || 'unknown')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 100);
}

async function userStickerDir(ctx) {
  const dir = path.join(SAVE_DIR, safeUserId(ctx));
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

async function savedFiles(ctx) {
  const dir = await userStickerDir(ctx);

  return (await fs.readdir(dir))
    .filter(name => /^sticker-\d+\.webp$/.test(name))
    .sort();
}

async function saveSticker(ctx) {
  const input = await stickerInput(ctx);
  if (!input) return;

  const dir = await userStickerDir(ctx);
  const files = await savedFiles(ctx);
  const name = `sticker-${Date.now()}.webp`;

  await fs.writeFile(path.join(dir, name), input);

  await ctx.reply(
    `💾 تم حفظ الملصق بنجاح.\n` +
    `📁 ملصقاتك المحفوظة: ${files.length + 1}`
  );
}

async function listStickers(ctx) {
  const files = await savedFiles(ctx);

  await ctx.reply(
    files.length
      ? '❄️ ملصقاتك المحفوظة:\n\n' +
        files.map((f, i) => `${i + 1}. ${f}`).join('\n')
      : '📭 لم تحفظ أي ملصق بعد. استخدم .حفظ_الملصق بالرد على ملصق.'
  );
}

async function countStickers(ctx) {
  const files = await savedFiles(ctx);
  await ctx.reply(`🎨 عدد ملصقاتك المحفوظة: ${files.length}`);
}

async function sendSavedSticker(ctx, index = 0) {
  const dir = await userStickerDir(ctx);
  const files = await savedFiles(ctx);

  if (!files.length) {
    await ctx.reply('📭 لا توجد ملصقات محفوظة.');
    return;
  }

  const file = files[Math.max(0, Math.min(index, files.length - 1))];
  const buffer = await fs.readFile(path.join(dir, file));

  await sendSticker(ctx, buffer);
}

async function duplicateSticker(ctx) {
  const input = await stickerInput(ctx);
  if (!input) return;

  await sendSticker(ctx, input);
  await sendSticker(ctx, input);
}

async function previewSticker(ctx) {
  const input = await stickerInput(ctx);
  if (!input) return;

  const png = await ffmpeg(
    input,
    'png',
    ['-frames:v', '1']
  );

  await sendImage(ctx, png, '🔍 معاينة الملصق • ALVARIA');
}

async function stickerInfo(ctx) {
  const input = await stickerInput(ctx);
  if (!input) return;

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hinata-info-'));
  const file = path.join(dir, 'sticker.webp');

  try {
    await fs.writeFile(file, input);

    const { stdout } = await exec(
      'ffprobe',
      [
        '-v', 'error',
        '-select_streams', 'v:0',
        '-show_entries', 'stream=width,height,codec_name,duration',
        '-of', 'default=noprint_wrappers=1',
        file
      ],
      { timeout: 15000 }
    );

    await ctx.reply(
      '╭━━〔 📊 معلومات الملصق 〕━━╮\n' +
      `📦 الحجم: ${(input.length / 1024).toFixed(1)} KB\n` +
      `🧩 الصيغة: WebP\n` +
      `${stdout.trim() || 'تعذر قراءة تفاصيل الصورة.'}\n` +
      '╰━━〔 ❄️ ALVARIA 〕━━╯'
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

function getRequestedStickerEmojis(ctx) {
  const args = Array.isArray(ctx.args) ? ctx.args.join(' ') : '';
  const raw = `${String(ctx.text || '')} ${args}`.trim();

  const segmenter = new Intl.Segmenter('und', {
    granularity: 'grapheme'
  });

  const found = [];

  for (const item of segmenter.segment(raw)) {
    const emoji = item.segment;

    if (/\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20E3/u.test(emoji)) {
      if (!found.includes(emoji)) found.push(emoji);
    }

    if (found.length >= 20) break;
  }

  return found.length ? found : ['❄️'];
}

async function rights(ctx) {
  const input = await stickerInput(ctx);

  if (!input) {
    await ctx.reply(
      '🌸 ردّ على ملصق بالأمر .حقوق ثم اكتب الإيموجيات التي تريدها.\\n' +
      'مثال: .حقوق ✨❓🌸💤'
    );
    return;
  }

  const emojis = getRequestedStickerEmojis(ctx);

  await sendSticker(
    ctx,
    input,
    `🍹 تم تحديث حقوق الملصق\n` +
    `👑 الصانع: ❄️ 𝑨𝒍𝒗𝒂𝒓𝒊𝒂 𝑩𝑶𝑻\n` +
    `✨ الإيموجيات: ${emojis.join(' ')}`,
    {
      metadataOptions: {
        packId: 'com.hinata.stickers',
        packName: '❄️ 𝑨𝒍𝒗𝒂𝒓𝒊𝒂 𝑺𝑻𝑰𝑪𝑲𝑬𝑹𝑺',
        publisher: '❄️ 𝑨𝒍𝒗𝒂𝒓𝒊𝒂 𝑩𝑶𝑻 ❅',
        emojis
      }
    }
  );
}



async function circularSticker(ctx) {
  const filter =
    'scale=512:512:force_original_aspect_ratio=decrease,' +
    'pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000,' +
    'format=rgba,' +
    "geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':" +
    "a='if(lte((X-W/2)*(X-W/2)+(Y-H/2)*(Y-H/2),(min(W,H)/2)*(min(W,H)/2)),alpha(X,Y),0)'";

  const input = await imageInput(ctx);
  if (!input) return;

  const output = await ffmpeg(input, 'webp', [
    '-vf', filter,
    '-c:v', 'libwebp',
    '-lossless', '1',
    '-q:v', '80',
    '-an'
  ]);

  await sendSticker(ctx, output, '⭕ ملصق دائري • ALVARIA');
}



async function shadowSticker(ctx) {
  const input = await stickerInput(ctx);
  if (!input) return;

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hinata-shadow-'));
  const source = path.join(dir, 'source.webp');
  const output = path.join(dir, 'shadow.webp');

  try {
    await fs.writeFile(source, input);

    const graph =
      '[0:v]format=rgba,' +
      'scale=420:420:force_original_aspect_ratio=decrease,' +
      'pad=420:420:(ow-iw)/2:(oh-ih)/2:color=0x00000000,' +
      'split=2[fg][src];' +
      '[src]colorchannelmixer=rr=0:gg=0:bb=0:aa=0.55,' +
      'gblur=sigma=8:steps=2,' +
      'pad=512:512:46:46:color=0x00000000[sh];' +
      '[sh][fg]overlay=46:46:format=auto,format=rgba[out]';

    await exec('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-i', source,
      '-filter_complex', graph,
      '-map', '[out]',
      '-frames:v', '1',
      '-c:v', 'libwebp',
      '-lossless', '0',
      '-q:v', '75',
      '-an',
      output
    ], { timeout: 30000, maxBuffer: 4 * 1024 * 1024 });

    const result = await fs.readFile(output);
    if (
      result.length < 12 ||
      result.length > MAX_SIZE ||
      result.toString('ascii', 0, 4) !== 'RIFF' ||
      result.toString('ascii', 8, 12) !== 'WEBP'
    ) {
      throw new Error('INVALID_SHADOW_STICKER');
    }

    await sendSticker(ctx, result, '🌑 ملصق بظل • ALVARIA');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}


async function textSticker(ctx) {
  const text = String(ctx.text || '')
    .normalize('NFC')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .trim()
    .slice(0, 180);

  if (!text) {
    await ctx.reply('✍️ اكتب النص بعد الأمر. مثال: .ستيكر_نص مرحبًا');
    return;
  }

  const font = process.env.HINATA_STICKER_FONT ||
    `${process.env.PREFIX || '/data/data/com.termux/files/usr'}/share/fonts/TTF/DejaVuSans.ttf`;

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hinata-text-'));
  const textFile = path.join(dir, 'text.txt');
  const output = path.join(dir, 'sticker.webp');

  try {
    const lines = [];
    let line = '';

    for (const word of text.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (candidate.length > 20 && line) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);

    await fs.writeFile(textFile, lines.join('\n'), 'utf8');

    await exec('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'lavfi',
      '-i', 'color=c=white:s=512x512:r=1',
      '-vf',
      `drawtext=fontfile='${font}':textfile='${textFile}':text_shaping=1:fontcolor=0x222222:fontsize=38:line_spacing=14:x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=white@1:boxborderw=28`,
      '-frames:v', '1',
      '-c:v', 'libwebp',
      '-lossless', '1',
      '-q:v', '80',
      '-an',
      output
    ], { timeout: 30000, maxBuffer: 4 * 1024 * 1024 });

    const webp = await fs.readFile(output);
    if (
      webp.length < 12 ||
      webp.length > MAX_SIZE ||
      webp.toString('ascii', 0, 4) !== 'RIFF' ||
      webp.toString('ascii', 8, 12) !== 'WEBP'
    ) {
      throw new Error('INVALID_TEXT_STICKER');
    }

    await sendSticker(ctx, webp, '✍️ ملصق نصي • ALVARIA');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}



async function videoSticker(ctx) {
  const media = await getMedia(ctx, ['videoMessage']);
  if (!media) {
    await ctx.reply('🎞️ ردّ على فيديو بالأمر .ستيكر_فيديو');
    return;
  }

  const webp = await ffmpeg(media.buffer, 'webp', [
    '-t', '5',
    '-vf',
    'fps=12,scale=320:320:force_original_aspect_ratio=decrease,' +
    'pad=320:320:(ow-iw)/2:(oh-ih)/2:color=0x00000000',
    '-c:v', 'libwebp',
    '-lossless', '0',
    '-q:v', '65',
    '-loop', '0',
    '-an'
  ]);

  if (
    webp.length < 12 ||
    webp.length > MAX_SIZE ||
    webp.toString('ascii', 0, 4) !== 'RIFF' ||
    webp.toString('ascii', 8, 12) !== 'WEBP'
  ) {
    throw new Error('INVALID_ANIMATED_STICKER');
  }

  await sendSticker(ctx, webp, '🎞️ ملصق متحرك • ALVARIA');
}


async function hatSticker(ctx) {
  const media = await getMedia(ctx, ['videoMessage']);

  if (!media) {
    await ctx.reply('🎧 ردّ على فيديو يحتوي صوتًا، ثم اكتب .هات');
    return;
  }

  const MAX_DURATION = 25;
  const MAX_STICKER_SIZE = 500 * 1024;

  let audio;

  try {
    audio = await ffmpeg(media.buffer, 'ogg', [
      '-map', '0:a:0',
      '-vn',
      '-t', String(MAX_DURATION),
      '-ac', '1',
      '-ar', '48000',
      '-c:a', 'libopus',
      '-b:a', '64k',
      '-application', 'audio',
      '-f', 'ogg'
    ]);

    if (!audio?.length) throw new Error('EMPTY_AUDIO');
  } catch (error) {
    await ctx.reply(
      '⚠️ تعذّر استخراج الصوت. تأكد أن الفيديو يحتوي على صوت.'
    );
    return;
  }

  const attempts = [
    { fps: 12, quality: 50 },
    { fps: 10, quality: 42 },
    { fps: 8, quality: 35 },
    { fps: 6, quality: 30 }
  ];

  let webp = null;

  for (const attempt of attempts) {
    try {
      const candidate = await ffmpeg(media.buffer, 'webp', [
        '-map', '0:v:0',
        '-an',
        '-t', String(MAX_DURATION),
        '-vf',
        `fps=${attempt.fps},` +
          'scale=320:320:force_original_aspect_ratio=decrease:flags=lanczos,' +
          'pad=320:320:(ow-iw)/2:(oh-ih)/2:color=0x00000000,format=yuva420p',
        '-c:v', 'libwebp',
        '-lossless', '0',
        '-q:v', String(attempt.quality),
        '-loop', '0',
        '-vsync', '0'
      ]);

      const validWebP =
        candidate.length >= 12 &&
        candidate.toString('ascii', 0, 4) === 'RIFF' &&
        candidate.toString('ascii', 8, 12) === 'WEBP';

      if (validWebP && candidate.length <= MAX_STICKER_SIZE) {
        webp = candidate;
        break;
      }
    } catch {
      // تجربة إعداد الضغط التالي.
    }
  }

  if (!webp) {
    await ctx.reply(
      '⚠️ تعذّر إنشاء ملصق متحرك بالحجم المناسب. جرّب فيديو أقل حركة.'
    );
    return;
  }

  try {
    await sendSticker(ctx, webp, null, {
      stickerAudio: audio,
      metadataOptions: {
        packId: 'com.hinata.soundstickers',
        packName: '♔༻ HINATA • SOUND STICKER ༺♔',
        publisher: '♔༻ 𝑯𝑰𝑵𝑨𝑻𝑨 • 𝑩𝑶𝑻 ༺♔ 🌸✨🎞️🎧',
        emojis: ['🎵', '🌸', '✨', '🎧']
      }
    });
  } catch (error) {
    console.error('[HINATA HAT STICKER]', error);
    await ctx.reply(
      '⚠️ فشل إرسال الملصق الصوتي. راجع سجل البوت لمعرفة السبب.'
    );
  }
}
async function extractVideoFrame(ctx) {
  const media = await getMedia(ctx, ['videoMessage']);
  if (!media) {
    await ctx.reply('🎞️ ردّ على فيديو لاستخراج أول صورة منه.');
    return;
  }

  const png = await ffmpeg(
    media.buffer,
    'png',
    ['-frames:v', '1']
  );

  await sendImage(ctx, png, '🖼️ إطار مستخرج بواسطة ALVARIA');
}

async function mergeStickers(ctx) {
  const quoted = quotedInfo(ctx);
  if (!quoted) {
    await ctx.reply('🧩 ردّ على ملصق، ثم أرفق ملصقًا ثانيًا في رسالتك.');
    return;
  }

  const first = await stickerInput(ctx);
  if (!first) return;

  const secondMedia = await getMedia(ctx, ['stickerMessage']);

  if (!secondMedia) {
    await ctx.reply('أرسل الملصق الثاني مع الأمر، أو أرفقه في الرسالة.');
    return;
  }

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hinata-merge-'));
  const a = path.join(dir, 'a.webp');
  const b = path.join(dir, 'b.webp');
  const out = path.join(dir, 'merged.webp');

  try {
    await fs.writeFile(a, first);
    await fs.writeFile(b, secondMedia.buffer);

    await exec('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-i', a, '-i', b,
      '-filter_complex',
      '[0:v]scale=256:256[a];[1:v]scale=256:256[b];[a][b]hstack=inputs=2,scale=512:512',
      '-vcodec', 'libwebp', '-lossless', '0', '-q:v', '75',
      out
    ], { timeout: 30000 });

    await sendSticker(ctx, await fs.readFile(out));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

async function unsupportedMetadata(ctx, label) {
  const input = await stickerInput(ctx);
  if (!input) return;

  await ctx.reply(
    `ℹ️ ${label}\\n` +
    'هذه النسخة لا تعدّل بيانات EXIF المضمّنة في WebP.\\n' +
    'لم أغيّر الملف أو أدّعِ تغيير بياناته.'
  );
}

async function removeExif(ctx) {
  const input = await stickerInput(ctx);
  if (!input) return;

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hinata-exif-'));
  const source = path.join(dir, 'in.webp');
  const output = path.join(dir, 'out.webp');

  try {
    await fs.writeFile(source, input);

    await exec('webpmux', [
      '-strip', 'exif',
      source,
      '-o', output
    ], { timeout: 15000 });

    await sendSticker(
      ctx,
      await fs.readFile(output),
      undefined,
      { metadata: false }
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

const operations = {
  'ستيكر_دائري': circularSticker,

  'ستيكر_شفاف': async ctx => imageToSticker(ctx),

  'ستيكر_عكسي': async ctx => transformSticker(
    ctx,
    'hflip'
  ),

  'ستيكر_قص': async ctx => transformSticker(
    ctx,
    'crop=iw*0.8:ih*0.8,scale=512:512:force_original_aspect_ratio=decrease'
  ),

  'إطار_الملصق': async ctx => transformSticker(
    ctx,
    'scale=460:460:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=white'
  ),

  'خلفية_الملصق': async ctx => transformSticker(
    ctx,
    'scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=white'
  ),

  'ظل_الملصق': shadowSticker,

  'حجم_الملصق': async ctx => transformSticker(
    ctx,
    'scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000'
  ),

  'جودة_الملصق': async ctx => transformSticker(
    ctx,
    'scale=512:512:force_original_aspect_ratio=decrease',
    ['-q:v', '90']
  ),

  'تدوير_الملصق': async ctx => {
    const angle = argumentNumber(ctx, 90);
    const valid = [90, 180, 270, -90, -180, -270];

    if (!valid.includes(angle)) {
      await ctx.reply('استخدم زاوية 90 أو 180 أو 270. مثال: .تدوير_الملصق 90');
      return;
    }

    const filter = angle === 90 ? 'transpose=1'
      : angle === 270 || angle === -90 ? 'transpose=2'
      : 'hflip,vflip';

    await transformSticker(ctx, filter);
  },

  'تكبير_الملصق': async ctx => transformSticker(
    ctx,
    'scale=512:512:force_original_aspect_ratio=increase,crop=512:512'
  ),

  'تصغير_الملصق': async ctx => transformSticker(
    ctx,
    'scale=350:350:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000'
  ),

  'تعتيم_الملصق': async ctx => transformSticker(
    ctx,
    'eq=brightness=-0.20'
  ),

  'ألوان_الملصق': async ctx => transformSticker(
    ctx,
    'eq=saturation=1.8'
  ),

  'أبيض_أسود': async ctx => transformSticker(
    ctx,
    'hue=s=0'
  ),

  'تأثير_ملصق': async ctx => transformSticker(
    ctx,
    'eq=contrast=1.35:saturation=1.35'
  ),

  'تمويه_الملصق': async ctx => transformSticker(
    ctx,
    'boxblur=5:2'
  ),

  'ضغط_الملصق': async ctx => transformSticker(
    ctx,
    'scale=384:384:force_original_aspect_ratio=decrease',
    ['-q:v', '45']
  ),

  'حذف_حقوق': removeExif,

  'إعادة_الحقوق': rights,

  'معاينة_الملصق': previewSticker,

  'معلومات_الملصق': stickerInfo,

  'حفظ_الملصق': saveSticker,

  'نسخ_الملصق': async ctx => sendSavedSticker(ctx, 0),

  'ملصقاتي': listStickers,

  'عدد_ملصقاتي': countStickers,

  'دمج_ملصقين': mergeStickers,

  'استخراج_ملصق': extractVideoFrame,

  'تكرار_ملصق': duplicateSticker,

  'إزالة_الخلفية': async ctx => {
    await ctx.reply(
      'ℹ️ إزالة الخلفية التلقائية تحتاج نموذج إزالة خلفية متخصصًا. ' +
      'لم أغيّر الصورة بطريقة قد تفسدها.'
    );
  },

  'زخرفة_الملصق': async ctx => transformSticker(
    ctx,
    'eq=contrast=1.25:saturation=1.5'
  ),

  'ستيكر_متحرك': videoSticker,

  'ستيكر_فيديو': videoSticker,

  'هات': hatSticker,

  'ستيكر_نص': textSticker,

  'ستيكر_رابط': async ctx => {
    await ctx.reply(
      '🔗 هذه الوظيفة تحتاج إضافة جلب روابط آمنة. ' +
      'استخدم .ستيكر مع صورة مرفقة حاليًا.'
    );
  },

  'اسم_الملصق': async ctx => unsupportedMetadata(ctx, 'اسم الحزمة'),

  'مؤلف_الملصق': async ctx => unsupportedMetadata(ctx, 'اسم المؤلف'),

  'حقوقي': rights
};

export function registerStickerCommands(commands) {
  const entries = [
    ['ستيكر', 'تحويل صورة إلى ملصق', imageToSticker, '🖼️'],
    ['تحويل', 'تحويل ملصق إلى صورة', async ctx => {
      const input = await stickerInput(ctx);
      if (!input) return;
      const png = await ffmpeg(input, 'png', ['-frames:v', '1']);
      await sendImage(ctx, png, '❄️ ALVARIA Sticker Studio');
    }, '🔄'],
    ['حقوق', 'تحديث حقوق الملصق وإضافة إيموجياته', rights, '©️'],
    ['مساعدة_الملصقات', 'مساعدة قسم الملصقات', async ctx => {
      const groups = [
        {
          title: '🖼️ إنشاء الملصقات والتحويل',
          commands: ['ستيكر', 'تحويل', 'ستيكر_دائري', 'ستيكر_نص']
        },
        {
          title: '🎞️ الملصقات المتحركة والفيديو',
          commands: ['ستيكر_متحرك', 'ستيكر_فيديو', 'هات', 'استخراج_ملصق']
        },
        {
          title: '✂️ القص والحجم والجودة',
          commands: [
            'ستيكر_قص',
            'حجم_الملصق',
            'جودة_الملصق',
            'تدوير_الملصق',
            'تكبير_الملصق',
            'تصغير_الملصق',
            'ضغط_الملصق',
            'ستيكر_عكسي'
          ]
        },
        {
          title: '🎨 الألوان والتأثيرات والخلفيات',
          commands: [
            'زخرفة_الملصق',
            'ألوان_الملصق',
            'أبيض_أسود',
            'تأثير_ملصق',
            'تمويه_الملصق',
            'تعتيم_الملصق',
            'إطار_الملصق',
            'خلفية_الملصق',
            'ظل_الملصق',
            'ستيكر_شفاف',
            'إزالة_الخلفية',
            'دمج_ملصقين'
          ]
        },
        {
          title: '©️ الحقوق وبيانات الملصقات',
          commands: [
            'حقوق',
            'حقوقي',
            'إعادة_الحقوق',
            'حذف_حقوق',
            'اسم_الملصق',
            'مؤلف_الملصق'
          ]
        },
        {
          title: '📦 الحفظ والمكتبة والمعلومات',
          commands: [
            'حفظ_الملصق',
            'نسخ_الملصق',
            'ملصقاتي',
            'عدد_ملصقاتي',
            'معلومات_الملصق',
            'معاينة_الملصق',
            'تكرار_ملصق',
            'ستيكر_رابط'
          ]
        }
      ];

      const shown = new Set([
        'ستيكر',
        'تحويل',
        'حقوق',
        'مساعدة_الملصقات'
      ]);

      for (const group of groups) {
        for (const name of group.commands) {
          shown.add(name);
        }
      }

      // إضافة أي أداة موجودة في operations ولم تُدرج أعلاه.
      const extraCommands = Object.keys(operations)
        .filter(name => !shown.has(name));

      if (extraCommands.length) {
        groups.push({
          title: '🧩 أدوات إضافية',
          commands: extraCommands
        });
      }

      const helpLines = [
        '*╭━━━━━━━━━━━━━━━━━━━━╮*',
        '*❄️ 𝑨𝑳𝑽𝑨𝑹𝑰𝑨 • 𝑺𝑻𝑼𝑫𝑰𝑶*',
        '*╰━━━━━━━━━━━━━━━━━━━━╯*',
        '',
        '*🎨 مَـرْكَـزُ اسْـتُـودِيـو الـمُـلْـصَـقَـات*',
        '*『 𝑺𝑻𝑰𝑪𝑲𝑬𝑹 𝑺𝑻𝑼𝑫𝑰𝑶 』*',
        '',
        '❅ دليل شامل لجميع أدوات الملصقات.',
        '❅ كل أمر مستقل وتحته وصف وظيفته.',
        '',
        ...groups.flatMap(group => [
          `*━━━━━━━━ ${group.title} ━━━━━━━━*`,
          '',
          ...group.commands.flatMap(name => {
            const description =
              name === 'ستيكر'
                ? 'تحويل صورة إلى ملصق.'
                : name === 'تحويل'
                  ? 'تحويل ملصق إلى صورة.'
                  : name === 'حقوق'
                    ? 'تحديث حقوق الملصق وإضافة إيموجياته.'
                    : name === 'مساعدة_الملصقات'
                      ? 'عرض دليل استوديو الملصقات.'
                      : descriptions[name] ||
                        'أداة من أدوات استوديو الملصقات.';

            return [
              `*•┆❄️〖 .${name} 〗*`,
              `⟞ ${description}`,
              ''
            ];
          })
        ]),
        '*━━━━━━━━ 📌 طريقة الاستخدام ━━━━━━━━*',
        '',
        '⟞ أرسل صورة أو ملصقًا أو فيديو حسب الأداة.',
        '⟞ استخدم الرد على الوسيط عندما يتطلب الأمر ذلك.',
        '⟞ اقرأ وصف الأمر لمعرفة وظيفته.',
        '',
        '*━━━━━━━━━━━━━━━━━━━━*',
        '*❄️ 𝑨𝑳𝑽𝑨𝑹𝑰𝑨 • 𝑺𝑻𝑰𝑪𝑲𝑬𝑹𝑺*',
        '*━━━━━━━━━━━━━━━━━━━━*'
      ];

      const helpText = helpLines.join('\n');

      await ctx.reply(helpText);
    }, '🎨']
  ];

  for (const [name, description, handler, reaction] of entries) {
    commands.set(name, { description, handler, reaction });
  }

  const descriptions = {
    'ستيكر_دائري': 'إنشاء ملصق دائري بخلفية شفافة',
    'ستيكر_متحرك': 'إنشاء ملصق متحرك من فيديو',
    'ستيكر_فيديو': 'تحويل فيديو إلى ملصق متحرك',
    'هات': 'ملصق مربع متحرك مع الصوت داخل نفس رسالة الملصق',
    'ستيكر_نص': 'إنشاء ملصق من نص',
    'ستيكر_رابط': 'مساعدة استخدام الصور من الروابط',
    'ستيكر_شفاف': 'تحويل صورة إلى ملصق بخلفية شفافة إن توفرت',
    'ستيكر_عكسي': 'قلب الملصق أفقيًا',
    'ستيكر_قص': 'قص الملصق',
    'حقوقي': 'عرض حقوق ALVARIA',
    'اسم_الملصق': 'عرض حالة دعم بيانات اسم الحزمة',
    'مؤلف_الملصق': 'عرض حالة دعم بيانات المؤلف',
    'زخرفة_الملصق': 'تحسين ألوان الملصق',
    'إطار_الملصق': 'إضافة إطار أبيض',
    'خلفية_الملصق': 'إضافة خلفية بيضاء',
    'ظل_الملصق': 'إضافة ظل ناعم للملصق',
    'حجم_الملصق': 'ضبط الحجم',
    'جودة_الملصق': 'تحويل الملصق بجودة مرتفعة',
    'تدوير_الملصق': 'تدوير الملصق بزاوية محددة',
    'تكبير_الملصق': 'تكبير وقص الملصق',
    'تصغير_الملصق': 'تصغير الملصق',
    'تعتيم_الملصق': 'تعتيم الملصق',
    'ألوان_الملصق': 'زيادة تشبع الألوان',
    'أبيض_أسود': 'تحويل إلى أبيض وأسود',
    'تأثير_ملصق': 'تطبيق تأثير لوني',
    'تمويه_الملصق': 'تمويه الملصق',
    'ضغط_الملصق': 'تقليل حجم الملصق',
    'معلومات_الملصق': 'عرض معلومات الملصق',
    'حفظ_الملصق': 'حفظ الملصق في مكتبتك',
    'نسخ_الملصق': 'إرسال أول ملصق محفوظ',
    'حذف_حقوق': 'إزالة بيانات EXIF من الملصق',
    'إعادة_الحقوق': 'عرض حقوق ALVARIA',
    'معاينة_الملصق': 'عرض الملصق كصورة',
    'ملصقاتي': 'عرض ملصقاتك المحفوظة',
    'عدد_ملصقاتي': 'حساب الملصقات المحفوظة',
    'دمج_ملصقين': 'دمج ملصقين في صورة واحدة',
    'إزالة_الخلفية': 'معلومات عن إزالة الخلفية',
    'استخراج_ملصق': 'استخراج إطار من فيديو',
    'تكرار_ملصق': 'إرسال الملصق مرتين'
  };

  for (const [name, description] of Object.entries(descriptions)) {
    commands.set(name, {
      description,
      reaction: '🎨',
      handler: operations[name]
    });
  }
}
