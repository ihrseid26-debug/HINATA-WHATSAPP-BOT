import { addHinataStickerMetadata } from './sticker-metadata.js';
import { PinterestClient } from 'pinterest-unofficial';
import { prepareStickerPackMessage } from '@queenanya/baileys';

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';

const run = promisify(execFile);

const PACK_NAME = '❄️ 𝑨𝒍𝒗𝒂𝒓𝒊𝒂 𝑺𝑻𝑰𝑪𝑲𝑬𝑹𝑺';
const PACK_PUBLISHER = '🍁 𝑨𝒍𝒗𝒂𝒓𝒊𝒂 𝑩𝑶𝑻 🍁';

const MAX_STICKERS = 30;
const MAX_IMAGE_SIZE = 12 * 1024 * 1024;
const REQUEST_TIMEOUT = 15000;
const DOWNLOAD_CONCURRENCY = 3;

let pinterestClient;
let bootstrapPromise;

async function getPinterest() {
  if (!pinterestClient) {
    pinterestClient = new PinterestClient();
  }

  if (!bootstrapPromise) {
    bootstrapPromise = pinterestClient.bootstrap().catch(error => {
      bootstrapPromise = null;
      pinterestClient = null;
      throw error;
    });
  }

  await bootstrapPromise;
  return pinterestClient;
}

function getPinImage(pin) {
  const images = pin?.images || {};

  return (
    images.orig?.url ||
    images['736x']?.url ||
    images['474x']?.url ||
    images['236x']?.url ||
    null
  );
}

function isPinterestImageUrl(value) {
  try {
    const url = new URL(value);

    return (
      url.protocol === 'https:' &&
      (
        url.hostname === 'pinimg.com' ||
        url.hostname.endsWith('.pinimg.com')
      )
    );
  } catch {
    return false;
  }
}

async function downloadImage(url) {
  if (!isPinterestImageUrl(url)) {
    throw new Error('رابط الصورة ليس من Pinterest');
  }

  const response = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36'
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT)
  });

  if (!response.ok) {
    throw new Error(`فشل تحميل الصورة: HTTP ${response.status}`);
  }

  const finalUrl = response.url || url;

  if (!isPinterestImageUrl(finalUrl)) {
    throw new Error('تم تحويل رابط الصورة إلى نطاق غير مسموح');
  }

  const length = Number(response.headers.get('content-length') || 0);

  if (length > MAX_IMAGE_SIZE) {
    throw new Error('الصورة أكبر من الحجم المسموح');
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  if (!buffer.length || buffer.length > MAX_IMAGE_SIZE) {
    throw new Error('حجم الصورة غير مناسب');
  }

  return buffer;
}

async function convertToWebP(inputBuffer, tempDir, index) {
  const input = path.join(tempDir, `input-${index}.img`);
  const output = path.join(tempDir, `sticker-${index}.webp`);

  await fs.writeFile(input, inputBuffer);

  await run('ffmpeg', [
    '-hide_banner',
    '-loglevel', 'error',
    '-y',
    '-i', input,
    '-frames:v', '1',
    '-vf',
    'scale=512:512:force_original_aspect_ratio=decrease:flags=lanczos,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000,setsar=1',
    '-c:v', 'libwebp',
    '-preset', 'picture',
    '-quality', '88',
    '-compression_level', '6',
    '-an',
    output
  ], {
    timeout: 25000,
    maxBuffer: 4 * 1024 * 1024
  });

  const webp = await fs.readFile(output);

  if (
    webp.length < 20 ||
    webp.length > 1024 * 1024 ||
    webp.toString('ascii', 0, 4) !== 'RIFF' ||
    webp.toString('ascii', 8, 12) !== 'WEBP'
  ) {
    throw new Error('تعذر إنشاء ملصق WebP صالح');
  }

  return webp;
}

/**
 * تنفيذ المهام بعدد متزامن محدود.
 * يحافظ على ترتيب الصور الأصلي حتى لو انتهت بعض المهام قبل الأخرى.
 */
async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (true) {
        const index = nextIndex++;

        if (index >= items.length) {
          break;
        }

        try {
          results[index] = await mapper(items[index], index);
        } catch (error) {
          console.warn(
            `[HINATA PACK] Skipped image ${index + 1}:`,
            error?.message || error
          );

          results[index] = null;
        }
      }
    }
  );

  await Promise.all(workers);

  return results.filter(Boolean);
}

async function reply(ctx, text) {
  if (typeof ctx.reply === 'function') {
    return ctx.reply(text);
  }

  return ctx.sock.sendMessage(ctx.jid, { text });
}

function getSearchQuery(ctx) {
  const fromArgs = Array.isArray(ctx.args)
    ? ctx.args.join(' ')
    : '';

  const raw = String(
    fromArgs || ctx.query || ctx.text || ''
  ).trim();

  return raw
    .replace(/^\.?\s*(?:حزمة|حزمه)\s*/u, '')
    .trim()
    .slice(0, 100);
}

async function createStickerPack(ctx, query) {
  const client = await getPinterest();

  const result = await client.search.searchPins({
    query,
    pageSize: 50
  });

  const pins = result?.data?.results || [];

  if (!pins.length) {
    throw new Error('لم أعثر على صور لهذا البحث');
  }

  const urls = [
    ...new Set(
      pins
        .map(getPinImage)
        .filter(Boolean)
        .filter(isPinterestImageUrl)
    )
  ].slice(0, MAX_STICKERS);

  if (urls.length < 3) {
    throw new Error('لم أجد صوراً كافية لإنشاء الحزمة');
  }

  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'hinata-sticker-pack-')
  );

  try {
    const stickerBuffers = await mapWithConcurrency(
      urls,
      DOWNLOAD_CONCURRENCY,
      async (url, index) => {
        const image = await downloadImage(url);

        const webp = await convertToWebP(
          image,
          tempDir,
          index
        );

        const webpWithMetadata = await addHinataStickerMetadata(
          webp,
          {
            packName: PACK_NAME,
            publisher: PACK_PUBLISHER,
            emojis: ['🌸']
          }
        );

        return {
          data: webpWithMetadata,
          emojis: ['🌸'],
          accessibilityLabel: '🌸 𝑨𝒍𝒗𝒂𝒓𝒊𝒂 • 𝑯𝑼𝑵𝑰𝑽'
        };
      }
    );

    if (stickerBuffers.length < 3) {
      throw new Error(
        'لم نستطع تجهيز ثلاثة ملصقات صالحة على الأقل'
      );
    }

    if (typeof ctx.sock.waUploadToServer !== 'function') {
      throw new Error(
        'دالة رفع الوسائط غير متاحة في اتصال البوت'
      );
    }

    const stickerPackMessage = await prepareStickerPackMessage(
      {
        name: PACK_NAME,
        publisher: PACK_PUBLISHER,
        cover: stickerBuffers[0].data,
        stickers: stickerBuffers,
        description: '🌸 𝑯𝑼𝑵𝑰𝑽 • 𝑴𝑨𝑫𝑬 𝑩𝒀 𝑨𝒍𝒗𝒂𝒓𝒊𝒂'
      },
      {
        upload: ctx.sock.waUploadToServer.bind(ctx.sock)
      }
    );

    if (!stickerPackMessage) {
      throw new Error('تعذر تجهيز رسالة الحزمة');
    }

    await ctx.sock.relayMessage(
      ctx.jid,
      { stickerPackMessage },
      {}
    );

    return stickerBuffers.length;
  } finally {
    await fs.rm(tempDir, {
      recursive: true,
      force: true
    }).catch(() => {});
  }
}

export function registerStickerPackCommands(commands) {
  const handler = async ctx => {
    const query = getSearchQuery(ctx);

    if (!query) {
      return reply(
        ctx,
        '🌸 اكتب اسم الشخصية أو الموضوع لإنشاء حزمة ملصقات.\n\n' +
        'مثال:\n.حزمة هيناتا\n' +
        '.حزمه ناروتو'
      );
    }

    await reply(
      ctx,
      '🔎 جاري البحث في Pinterest وتجهيز حزمة الملصقات...\n' +
      '🌸 سيتم تجهيز حتى 30 ملصقاً بجودة محسّنة.'
    );

    try {
      const count = await createStickerPack(ctx, query);

      await reply(
        ctx,
        `🌸 تم إرسال حزمة الملصقات!\n\n` +
        `📦 الاسم: ${PACK_NAME}\n` +
        `🖼️ عدد الملصقات: ${count}\n` +
        `✨ الموضوع: ${query}`
      );
    } catch (error) {
      console.error('[ALVARIA STICKER PACK]', error);

      await reply(
        ctx,
        '❌ تعذر إنشاء الحزمة.\n' +
        `السبب: ${String(
          error?.message || 'خطأ غير معروف'
        ).slice(0, 250)}`
      );
    }
  };

  commands.set('حزمة', {
    description: 'إنشاء حزمة من 30 ملصقاً من Pinterest',
    handler,
    reaction: '🌸'
  });

  commands.set('حزمه', {
    description: 'إنشاء حزمة من 30 ملصقاً من Pinterest',
    handler,
    reaction: '🌸'
  });
}
