import { PinterestClient } from 'pinterest-unofficial';
import { prepareStickerPackMessage } from '@queenanya/baileys';

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';

const exec = promisify(execFile);

const PACK_NAME = '🌸 HINATA ANIMATED STICKERS';
const PACK_PUBLISHER = '🌸 HINATA BOT';

const STICKERS_PER_VIDEO = 2;
const MAX_PACK_STICKERS = 30;
const MAX_VIDEOS_PER_PACK = Math.floor(
  MAX_PACK_STICKERS / STICKERS_PER_VIDEO
);

const CONCURRENCY = 5;
const REQUEST_TIMEOUT = 30000;
const FFMPEG_TIMEOUT = 120000;

const MAX_VIDEO_SIZE = 35 * 1024 * 1024;
const MAX_STICKER_SIZE = 500 * 1024;
const MAX_VIDEO_DURATION = 60;

const USER_AGENT =
  'Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36';

let pinterestClient;
let bootstrapPromise;

async function getPinterest() {
  if (!pinterestClient) {
    pinterestClient = new PinterestClient();
  }

  if (!bootstrapPromise) {
    bootstrapPromise = pinterestClient.bootstrap().catch(error => {
      pinterestClient = null;
      bootstrapPromise = null;
      throw error;
    });
  }

  await bootstrapPromise;
  return pinterestClient;
}

function getQuery(ctx) {
  const values = [
    ctx.args,
    ctx.query,
    ctx.text,
    ctx.body
  ];

  for (const value of values) {
    if (Array.isArray(value)) {
      const text = value.join(' ').trim();

      if (text) {
        return text.replace(
          /^\.?(?:حزمة_متحركه|حزمة_متحركة)\s*/i,
          ''
        ).trim();
      }
    }

    if (typeof value === 'string' && value.trim()) {
      return value.trim().replace(
        /^\.?(?:حزمة_متحركه|حزمة_متحركة)\s*/i,
        ''
      ).trim();
    }
  }

  return '';
}

function getPins(result) {
  if (Array.isArray(result)) return result;

  const candidates = [
    result?.results,
    result?.data?.results,
    result?.resource_response?.data?.results,
    result?.resource_response?.data
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }

  return [];
}

function isAllowedPinterestHost(hostname) {
  const host = String(hostname || '').toLowerCase();

  return (
    host === 'pinimg.com' ||
    host.endsWith('.pinimg.com')
  );
}

function isAllowedPinterestVideoUrl(value) {
  try {
    const url = new URL(value);

    if (
      url.protocol !== 'https:' ||
      !isAllowedPinterestHost(url.hostname)
    ) {
      return false;
    }

    return /\.(?:m3u8|mp4)(?:$|[?#])/i.test(
      url.pathname + url.search
    );
  } catch {
    return false;
  }
}

/*
 * Supports:
 * 1. Normal Pin: pin.videos.video_list
 * 2. Story Pin: story_pin_data.pages[].blocks[].video.video_list
 *
 * Only Pinterest-hosted HTTPS video URLs are accepted.
 */
function findVideoUrls(pin) {
  const found = new Set();
  const visited = new Set();

  function walk(value, depth = 0) {
    if (!value || depth > 15) return;

    if (typeof value !== 'object') return;
    if (visited.has(value)) return;

    visited.add(value);

    if (Array.isArray(value)) {
      for (const item of value) {
        walk(item, depth + 1);
      }
      return;
    }

    for (const [key, child] of Object.entries(value)) {
      if (
        key.toLowerCase() === 'video_list' &&
        child &&
        typeof child === 'object'
      ) {
        const variants = Array.isArray(child)
          ? child
          : Object.values(child);

        for (const variant of variants) {
          const url = variant?.url;

          if (
            typeof url === 'string' &&
            isAllowedPinterestVideoUrl(url)
          ) {
            found.add(url);
          }
        }
      }

      if (child && typeof child === 'object') {
        walk(child, depth + 1);
      }
    }
  }

  walk(pin);

  return [...found];
}

function getVideoDurationHint(pin, selectedUrl) {
  const matches = [];

  function walk(value, depth = 0) {
    if (!value || typeof value !== 'object' || depth > 15) return;

    if (Array.isArray(value)) {
      for (const item of value) walk(item, depth + 1);
      return;
    }

    for (const [key, child] of Object.entries(value)) {
      if (
        key.toLowerCase() === 'video_list' &&
        child &&
        typeof child === 'object'
      ) {
        const variants = Array.isArray(child)
          ? child
          : Object.values(child);

        for (const variant of variants) {
          if (variant?.url === selectedUrl) {
            const duration = Number(variant.duration);

            if (Number.isFinite(duration) && duration > 0) {
              matches.push(duration / 1000);
            }
          }
        }
      }

      if (child && typeof child === 'object') {
        walk(child, depth + 1);
      }
    }
  }

  walk(pin);

  return matches[0] || null;
}

async function downloadVideo(url, directory, index) {
  if (!isAllowedPinterestVideoUrl(url)) {
    throw new Error('رابط فيديو Pinterest غير مسموح');
  }

  const output = path.join(
    directory,
    `source-${index}.mp4`
  );

  /*
   * FFmpeg reads the HLS playlist and its segments.
   * The initial URL must belong to pinimg.com.
   * Duration and output size are limited.
   */
  await exec('ffmpeg', [
    '-hide_banner',
    '-loglevel', 'error',
    '-y',

    '-user_agent', USER_AGENT,
    '-protocol_whitelist',
    'https,tls,tcp,crypto,data',

    '-i', url,

    '-t', String(MAX_VIDEO_DURATION),
    '-map', '0:v:0',
    '-an',

    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '28',
    '-pix_fmt', 'yuv420p',

    '-fs', String(MAX_VIDEO_SIZE),
    '-movflags', '+faststart',
    '-f', 'mp4',

    output
  ], {
    timeout: FFMPEG_TIMEOUT,
    maxBuffer: 4 * 1024 * 1024
  });

  const stat = await fs.stat(output).catch(() => null);

  if (
    !stat ||
    !stat.isFile() ||
    stat.size < 1024 ||
    stat.size > MAX_VIDEO_SIZE
  ) {
    await fs.rm(output, { force: true });
    throw new Error('فشل تنزيل الفيديو أو تجاوز الحجم المسموح');
  }

  return output;
}

async function getVideoDuration(file) {
  const { stdout } = await exec('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    file
  ], {
    timeout: 15000,
    maxBuffer: 1024 * 1024
  });

  const duration = Number.parseFloat(stdout.trim());

  if (
    !Number.isFinite(duration) ||
    duration <= 0 ||
    duration > MAX_VIDEO_DURATION + 2
  ) {
    throw new Error('مدة الفيديو غير صالحة');
  }

  return duration;
}

async function convertAnimatedSticker(
  input,
  output,
  start,
  quality = 55
) {
  await exec('ffmpeg', [
    '-hide_banner',
    '-loglevel', 'error',
    '-y',

    '-ss', String(start),
    '-i', input,

    '-t', '2.8',

    '-vf',
    'fps=12,' +
    'scale=320:320:force_original_aspect_ratio=decrease:flags=lanczos,' +
    'pad=320:320:(ow-iw)/2:(oh-ih)/2:color=0x00000000,' +
    'setsar=1',

    '-an',
    '-vsync', '0',

    '-c:v', 'libwebp',
    '-lossless', '0',
    '-q:v', String(quality),
    '-compression_level', '4',
    '-loop', '0',

    output
  ], {
    timeout: 60000,
    maxBuffer: 4 * 1024 * 1024
  });

  let buffer = await fs.readFile(output);

  if (
    buffer.length < 20 ||
    buffer.toString('ascii', 0, 4) !== 'RIFF' ||
    buffer.toString('ascii', 8, 12) !== 'WEBP'
  ) {
    throw new Error('فشل إنشاء WebP');
  }

  if (buffer.length > MAX_STICKER_SIZE) {
    await fs.rm(output, { force: true });

    await exec('ffmpeg', [
      '-hide_banner',
      '-loglevel', 'error',
      '-y',

      '-ss', String(start),
      '-i', input,

      '-t', '2.2',

      '-vf',
      'fps=10,' +
      'scale=256:256:force_original_aspect_ratio=decrease,' +
      'pad=256:256:(ow-iw)/2:(oh-ih)/2:color=0x00000000,' +
      'setsar=1',

      '-an',
      '-vsync', '0',

      '-c:v', 'libwebp',
      '-lossless', '0',
      '-q:v', '38',
      '-compression_level', '4',
      '-loop', '0',

      output
    ], {
      timeout: 60000,
      maxBuffer: 4 * 1024 * 1024
    });

    buffer = await fs.readFile(output);
  }

  if (
    buffer.length > MAX_STICKER_SIZE ||
    buffer.length < 20 ||
    buffer.toString('ascii', 0, 4) !== 'RIFF' ||
    buffer.toString('ascii', 8, 12) !== 'WEBP'
  ) {
    throw new Error('الملصق تجاوز الحجم أو ليس WebP صالحاً');
  }

  return buffer;
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const index = nextIndex++;

      if (index >= items.length) return;

      try {
        results[index] = await mapper(items[index], index);
      } catch (error) {
        results[index] = {
          error: error?.message || 'خطأ غير معروف'
        };
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    () => worker()
  );

  await Promise.all(workers);

  return results;
}

async function processVideo(pin, index, directory) {
  const urls = findVideoUrls(pin);

  if (!urls.length) {
    throw new Error('لا يحتوي Pin على رابط فيديو صالح');
  }

  const videoUrl = urls[0];

  const durationHint = getVideoDurationHint(
    pin,
    videoUrl
  );

  if (durationHint && durationHint <= 0) {
    throw new Error('مدة الفيديو غير صالحة');
  }

  const videoFile = await downloadVideo(
    videoUrl,
    directory,
    index
  );

  try {
    const duration = await getVideoDuration(videoFile);

    const firstStart = 0;

    const secondStart = Math.max(
      0,
      Math.min(duration - 1, duration / 2 - 0.5)
    );

    const outputs = [];

    for (let part = 0; part < STICKERS_PER_VIDEO; part++) {
      const output = path.join(
        directory,
        `sticker-${index}-${part}.webp`
      );

      const start = part === 0
        ? firstStart
        : secondStart;

      const data = await convertAnimatedSticker(
        videoFile,
        output,
        start
      );

      outputs.push({
        data,
        emojis: ['🌸'],
        accessibilityLabel: 'HINATA Animated Sticker'
      });
    }

    return outputs;
  } finally {
    await fs.rm(videoFile, { force: true }).catch(() => {});
  }
}

async function createAnimatedPack(ctx, query) {
  const client = await getPinterest();

  const searchResult = await client.search.searchPins({
    query,
    pageSize: 50
  });

  const pins = getPins(searchResult);

  if (!pins.length) {
    throw new Error('لم يعثر Pinterest على نتائج لهذا البحث');
  }

  /*
   * Collect matching video Pins from the actual user query.
   * No fixed source count such as 10.
   * The single WhatsApp pack is limited to 30 stickers.
   */
  const candidates = [];
  const seenUrls = new Set();

  for (const pin of pins) {
    if (!pin || typeof pin !== 'object') continue;

    const urls = findVideoUrls(pin);

    if (!urls.length) continue;

    const uniqueUrl = urls.find(url => !seenUrls.has(url));

    if (!uniqueUrl) continue;

    seenUrls.add(uniqueUrl);
    candidates.push(pin);

    if (candidates.length >= MAX_VIDEOS_PER_PACK) {
      break;
    }
  }

  if (!candidates.length) {
    throw new Error(
      'لم تظهر في نتائج البحث فيديوهات Pinterest قابلة للمعالجة'
    );
  }

  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'hinata-animated-pack-')
  );

  try {
    const processed = await mapWithConcurrency(
      candidates,
      CONCURRENCY,
      (pin, index) => processVideo(pin, index, directory)
    );

    const stickers = [];
    let successfulSources = 0;
    let failedSources = 0;

    for (const result of processed) {
      if (Array.isArray(result)) {
        stickers.push(...result);
        successfulSources++;
      } else {
        failedSources++;
        console.error(
          '[HINATA ANIMATED VIDEO]',
          result?.error || 'فشل غير معروف'
        );
      }
    }

    if (stickers.length < 3) {
      throw new Error(
        `تم إنشاء ${stickers.length} ملصق فقط؛ لا تكفي لإنشاء الحزمة`
      );
    }

    if (stickers.length > MAX_PACK_STICKERS) {
      stickers.length = MAX_PACK_STICKERS;
    }

    if (typeof ctx.sock?.waUploadToServer !== 'function') {
      throw new Error('دالة رفع الوسائط غير متاحة');
    }

    const packMessage = await prepareStickerPackMessage(
      {
        name: PACK_NAME,
        publisher: PACK_PUBLISHER,
        description: `🌸 HINATA • ${query}`,
        cover: stickers[0].data,
        stickers
      },
      {
        upload: ctx.sock.waUploadToServer.bind(ctx.sock)
      }
    );

    if (!packMessage) {
      throw new Error('تعذر إنشاء رسالة الحزمة');
    }

    await ctx.sock.relayMessage(
      ctx.jid,
      { stickerPackMessage: packMessage },
      {}
    );

    return {
      count: stickers.length,
      sources: successfulSources,
      failed: failedSources,
      found: candidates.length
    };
  } finally {
    await fs.rm(directory, {
      recursive: true,
      force: true
    }).catch(() => {});
  }
}

export function registerAnimatedStickerPackCommands(commands) {
  const handler = async ctx => {
    const query = getQuery(ctx);

    if (!query) {
      await ctx.reply(
        '🌸 اكتب اسم الشخصية أو الموضوع لإنشاء حزمة متحركة.\n\n' +
        'مثال:\n.حزمة_متحركه هيناتا'
      );
      return;
    }

    await ctx.reply(
      '🎞️ HINATA ANIMATED STICKERS\n\n' +
      `🔎 البحث: ${query}\n` +
      '📹 البحث عن الفيديوهات المطابقة\n' +
      '✨ ملصقان متحركان من كل فيديو صالح\n' +
      '⚡ المهام المتزامنة: 5\n\n' +
      '⏳ جاري البحث والمعالجة...'
    );

    try {
      const result = await createAnimatedPack(ctx, query);

      await ctx.reply(
        '🌸 تم تجهيز حزمة الملصقات المتحركة!\n\n' +
        `🔎 البحث: ${query}\n` +
        `📹 الفيديوهات المستخدمة: ${result.sources}\n` +
        `🎞️ عدد الملصقات: ${result.count}\n` +
        `⚠️ الفيديوهات التي تعذر تجهيزها: ${result.failed}\n` +
        `📦 اسم الحزمة: ${PACK_NAME}`
      );
    } catch (error) {
      console.error('[HINATA ANIMATED PACK]', error);

      await ctx.reply(
        '❌ تعذر إنشاء الحزمة المتحركة.\n\n' +
        `السبب: ${String(
          error?.message || 'خطأ غير معروف'
        ).slice(0, 350)}`
      );
    }
  };

  commands.set('حزمة_متحركه', {
    description: 'إنشاء حزمة ملصقات متحركة حسب بحث Pinterest',
    handler,
    reaction: '🎞️'
  });

  commands.set('حزمة_متحركة', {
    description: 'إنشاء حزمة ملصقات متحركة حسب بحث Pinterest',
    handler,
    reaction: '🎞️'
  });
}
