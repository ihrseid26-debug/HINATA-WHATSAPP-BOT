import yts from 'yt-search';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

import {
  proto,
  prepareWAMessageMedia,
  generateWAMessageFromContent
} from '@whiskeysockets/baileys';

const YT_DLP_PATH = process.env.YT_DLP_PATH || 'yt-dlp';
const FFMPEG_PATH = process.env.FFMPEG_PATH || 'ffmpeg';

const MAX_CARDS = 5;
const MAX_DURATION = 180;
const MAX_VIDEO_SIZE = 12 * 1024 * 1024;
const MAX_SOURCE_SIZE = 80 * 1024 * 1024;

const activeChats = new Set();

function run(
  command,
  args,
  maxOutput = 2 * 1024 * 1024,
  timeoutMs = 120000
) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      fail(new Error(`${command} timed out`));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);
    }

    function fail(error) {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    }

    child.stdout.on('data', chunk => {
      stdout += chunk.toString();

      if (stdout.length > maxOutput) {
        child.kill('SIGKILL');
        fail(new Error('Command output too large'));
      }
    });

    child.stderr.on('data', chunk => {
      stderr += chunk.toString();

      if (stderr.length > 12000) {
        stderr = stderr.slice(-12000);
      }
    });

    child.on('error', fail);

    child.on('close', code => {
      if (settled) return;

      if (code === 0) {
        settled = true;
        cleanup();
        resolve(stdout.trim());
      } else {
        fail(
          new Error(
            stderr.slice(-2500) ||
            `${command} exited with code ${code}`
          )
        );
      }
    });
  });
}

function getUrl(video) {
  return video?.url ||
    (video?.videoId
      ? `https://www.youtube.com/watch?v=${video.videoId}`
      : '');
}

function isYouTubeUrl(value) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();

    return (
      hostname === 'youtube.com' ||
      hostname.endsWith('.youtube.com') ||
      hostname === 'youtu.be'
    );
  } catch {
    return false;
  }
}

function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;

  return Promise.all(
    Array.from(
      { length: Math.min(limit, items.length) },
      async () => {
        while (true) {
          const index = next++;

          if (index >= items.length) break;

          try {
            results[index] = await worker(items[index], index);
          } catch (error) {
            console.error('[HINATA EDIT WORKER]', error);
            results[index] = null;
          }
        }
      }
    )
  ).then(() => results);
}

async function getInfo(url) {
  const raw = await run(YT_DLP_PATH, [
    '--dump-single-json',
    '--skip-download',
    '--no-warnings',
    '--no-playlist',
    '--socket-timeout', '15',
    '--retries', '1',
    '--',
    url
  ], 4 * 1024 * 1024, 45000);

  return JSON.parse(raw);
}

function getPublishedDate(info) {
  const date = String(
    info.upload_date ||
    info.release_date ||
    ''
  );

  if (/^\d{8}$/.test(date)) {
    const year = Number(date.slice(0, 4));
    const month = Number(date.slice(4, 6)) - 1;
    const day = Number(date.slice(6, 8));

    const parsed = new Date(Date.UTC(year, month, day));

    if (
      parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() === month &&
      parsed.getUTCDate() === day
    ) {
      return parsed;
    }
  }

  const timestamp =
    Number(info.release_timestamp) ||
    Number(info.timestamp);

  if (Number.isFinite(timestamp) && timestamp > 0) {
    return new Date(timestamp * 1000);
  }

  return null;
}

function getVideoAge(info) {
  const published = getPublishedDate(info);

  if (!published) return 'حديث';

  const days = Math.floor(
    (Date.now() - published.getTime()) /
    (24 * 60 * 60 * 1000)
  );

  return days <= 0 ? 'اليوم' : `منذ ${days} يوم`;
}

function isVertical(info) {
  const width = Number(info.width);
  const height = Number(info.height);

  return (
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    height > width
  );
}

async function findVideos(candidates) {
  const checked = await mapLimit(
    candidates.slice(0, 50),
    3,
    async video => {
      const url = getUrl(video);

      if (!url || !isYouTubeUrl(url)) {
        return null;
      }

      const info = await getInfo(url);
      const duration = Number(info.duration ?? video.seconds);

      if (
        Number.isFinite(duration) &&
        (duration <= 0 || duration > MAX_DURATION)
      ) {
        return null;
      }

      const vertical = isVertical(info);
      const published = getPublishedDate(info);

      return {
        video,
        info,
        url,
        publishedAt: published ? published.getTime() : 0,
        vertical
      };
    }
  );

  return checked
    .filter(Boolean)
    .sort((a, b) => {
      // المقاطع العمودية أولاً، ثم الأحدث
      if (a.vertical !== b.vertical) {
        return Number(b.vertical) - Number(a.vertical);
      }

      return b.publishedAt - a.publishedAt;
    });
}

async function downloadVideo(item, index) {
  const dir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'hinata-edits-')
  );

  try {
    const output = path.join(
      dir,
      `clip-${index}.%(ext)s`
    );

    await run(YT_DLP_PATH, [
      '--no-playlist',
      '--no-warnings',
      '--no-progress',
      '--socket-timeout', '20',
      '--retries', '1',
      '--fragment-retries', '1',
      '--concurrent-fragments', '4',
      '--max-filesize', '80M',
      '-f',
      'bv*[height<=1080]+ba/b[height<=1080]/b',
      '--merge-output-format', 'mp4',
      '-o', output,
      '--',
      item.url
    ], 512 * 1024, 240000);

    const names = await fs.readdir(dir);
    let file = null;

    for (const name of names) {
      if (
        name.endsWith('.part') ||
        name.endsWith('.ytdl') ||
        name.endsWith('.json') ||
        name === 'hinata-video.mp4'
      ) {
        continue;
      }

      const candidate = path.join(dir, name);
      const stat = await fs.stat(candidate);

      if (
        stat.isFile() &&
        stat.size > 0 &&
        stat.size <= MAX_SOURCE_SIZE
      ) {
        file = candidate;
        break;
      }
    }

    if (!file) {
      throw new Error('Downloaded video not found or too large');
    }

    const normalized = path.join(
      dir,
      'hinata-video.mp4'
    );

    await run(FFMPEG_PATH, [
      '-y',
      '-hide_banner',
      '-loglevel', 'error',
      '-i', file,
      '-map', '0:v:0',
      '-map', '0:a:0?',
      '-sn',
      '-dn',
      '-vf',
      'scale=w=min(1280\\,iw):h=min(1280\\,ih):force_original_aspect_ratio=decrease:force_divisible_by=2,fps=30,setsar=1',
      '-c:v', 'libx264',
      '-preset', 'medium',
      '-crf', '22',
      '-maxrate', '1200k',
      '-bufsize', '2400k',
      '-profile:v', 'high',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '96k',
      '-ac', '2',
      '-ar', '44100',
      '-movflags', '+faststart',
      '-max_muxing_queue_size', '1024',
      normalized
    ], 512 * 1024, 180000);

    const stat = await fs.stat(normalized);

    if (!stat.isFile() || stat.size === 0) {
      throw new Error('FFmpeg produced an invalid video');
    }

    if (stat.size > MAX_VIDEO_SIZE) {
      throw new Error('Video exceeds 12 MB after conversion');
    }

    await fs.rm(file, { force: true });

    return {
      ...item,
      file: normalized,
      dir
    };

  } catch (error) {
    await fs.rm(dir, {
      recursive: true,
      force: true
    }).catch(() => {});

    throw error;
  }
}

function cleanTitle(value) {
  return String(value || 'HINATA EDIT')
    .replace(/\s+/g, ' ')
    .slice(0, 85);
}

async function prepareVideoCard(sock, item, index) {
  const media = await prepareWAMessageMedia(
    {
      video: { url: item.file },
      mimetype: 'video/mp4'
    },
    {
      upload: sock.waUploadToServer.bind(sock)
    }
  );

  if (!media?.videoMessage) {
    throw new Error('Baileys video upload failed');
  }

  const title = cleanTitle(item.info.title);
  const url = item.url;

  return proto.Message.InteractiveMessage.fromObject({
    header: {
      title: `🎬 المقطع ${index + 1}`,
      hasMediaAttachment: true,
      ...media
    },

    body: {
      text:
        `🎞️ ${title}\n\n` +
        `📺 القناة: ${item.info.uploader || item.info.channel || 'YouTube'}\n` +
        `⏱️ المدة: ${item.info.duration || 'غير معروفة'} ثانية\n` +
        `📅 النشر: ${getVideoAge(item.info)}\n` +
        `🌸 HINATA • EDITS`
    },

    footer: {
      text: '🌸 HINATA BOT'
    },

    nativeFlowMessage: {
      buttons: [
        {
          name: 'cta_url',
          buttonParamsJson: JSON.stringify({
            display_text: '▶️ فتح الفيديو الأصلي',
            url,
            merchant_url: url
          })
        }
      ]
    }
  });
}

async function sendSingleVideo(ctx, item) {
  const buffer = await fs.readFile(item.file);

  await ctx.sock.sendMessage(
    ctx.jid,
    {
      video: buffer,
      mimetype: 'video/mp4',
      caption:
        `🌸 HINATA • EDITS\n\n` +
        `🎬 ${cleanTitle(item.info.title)}\n` +
        `📅 ${getVideoAge(item.info)}\n` +
        `🔗 ${item.url}`
    },
    { quoted: ctx.message }
  );
}

async function sendVideoCarousel(ctx, items, query) {
  if (items.length === 1) {
    return sendSingleVideo(ctx, items[0]);
  }

  const sock = ctx.sock;
  const jid = ctx.jid;

  const cards = await mapLimit(
    items,
    2,
    (item, index) => prepareVideoCard(sock, item, index)
  );

  if (cards.some(card => !card)) {
    throw new Error('Could not prepare every video card');
  }

  const userJid =
    sock.user?.id ||
    sock.authState?.creds?.me?.id;

  if (!userJid) {
    throw new Error('HINATA socket identity unavailable');
  }

  const interactive = proto.Message.InteractiveMessage.fromObject({
    header: {
      title: '🌸 HINATA • EDITS',
      hasMediaAttachment: false
    },

    body: {
      text:
        `🎬 نتائج Edits عن: ${query}\n\n` +
        `📅 نتائج متنوعة بدون تقييد بتاريخ النشر.\n` +
        'اسحب البطاقات لمشاهدة المقاطع.'
    },

    footer: {
      text: '🌸 HINATA BOT'
    },

    carouselMessage: {
      cards,
      messageVersion: 1
    }
  });

  const generated = generateWAMessageFromContent(
    jid,
    {
      viewOnceMessage: {
        message: {
          messageContextInfo: {
            deviceListMetadata: {},
            deviceListMetadataVersion: 2
          },
          interactiveMessage: interactive
        }
      }
    },
    {
      userJid,
      quoted: ctx.message
    }
  );

  const additionalNodes = [
    {
      tag: 'biz',
      attrs: {},
      content: [
        {
          tag: 'interactive',
          attrs: { type: 'native_flow', v: '1' },
          content: [
            {
              tag: 'native_flow',
              attrs: { v: '9', name: 'mixed' }
            }
          ]
        }
      ]
    }
  ];

  if (!String(jid).endsWith('@g.us')) {
    additionalNodes.push({
      tag: 'bot',
      attrs: { biz_bot: '1' }
    });
  }

  await sock.relayMessage(jid, generated.message, {
    messageId: generated.key.id,
    additionalNodes
  });
}

async function handleEditSearch(ctx) {
  let query = String(ctx.text || '').trim();

  query = query
    .replace(/funk\s*edit/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!query) {
    return ctx.reply(
      '🌸 *HINATA • EDITS*\n\n' +
      'أرسل اسم الشخصية أو الموضوع للبحث عن Edits.\n\n' +
      'أمثلة:\n' +
      '.ايديت Funk\n' +
      '.ايديت Naruto\n' +
      '.ايديت Gojo\n' +
      '.ايديت Anime'
    );
  }

  if (query.length > 100) {
    return ctx.reply('⚠️ عبارة البحث طويلة جداً.');
  }

  if (activeChats.has(ctx.jid)) {
    return ctx.reply('⏳ يوجد بحث آخر جارٍ في هذه المحادثة.');
  }

  activeChats.add(ctx.jid);

  const downloaded = [];

  try {
    const searchTerms = [
      query,
      `${query} edit`,
      `${query} shorts`,
      `${query} amv`,
      `${query} edit shorts`
    ];

    const uniqueTerms = [...new Set(
      searchTerms
        .map(term => term.replace(/\\s+/g, ' ').trim())
        .filter(Boolean)
    )];

    const candidateMap = new Map();

    for (const term of uniqueTerms) {
      try {
        console.log('[HINATA EDITS] Searching:', term);

        const result = await yts(term);
        const found = result?.videos || [];

        console.log(
          '[HINATA EDITS] Search results:',
          term,
          found.length
        );

        for (const video of found) {
          const url = getUrl(video);

          if (!url || !isYouTubeUrl(url)) continue;

          const seconds = Number(video.seconds);

          if (
            Number.isFinite(seconds) &&
            seconds > MAX_DURATION
          ) {
            continue;
          }

          const key = url.split('&')[0];

          if (!candidateMap.has(key)) {
            candidateMap.set(key, video);
          }
        }

        // يكفي جمع مجموعة جيدة من النتائج
        if (candidateMap.size >= 40) break;

      } catch (searchError) {
        console.error(
          '[HINATA EDITS] Search attempt failed:',
          term,
          searchError.message
        );
      }
    }

    const candidates = [...candidateMap.values()].slice(0, 50);

    console.log(
      '[HINATA EDITS] Unique candidates:',
      candidates.length
    );

    if (!candidates.length) {
      return ctx.reply(
        '❌ لم أجد نتائج من YouTube لهذه العبارة.\\n' +
        'جرّب اسماً آخر أو أضف كلمة Edit.'
      );
    }

    const videos = await findVideos(candidates);

    if (!videos.length) {
      return ctx.reply(
        '❌ لم أجد مقاطع قابلة للمعالجة لهذه العبارة.\\n' +
        'جرّب اسماً آخر أو أعد المحاولة لاحقاً.'
      );
    }

    console.log(
      '[HINATA EDITS] Valid videos:',
      videos.length
    );

    // تنزيل أفضل النتائج، مع تجاوز الفيديو الذي يفشل تنزيله
    for (const video of videos) {
      if (downloaded.length >= MAX_CARDS) break;

      try {
        console.log(
          '[HINATA EDITS] Trying:',
          video.info.title
        );

        const item = await downloadVideo(
          video,
          downloaded.length
        );

        downloaded.push(item);

        console.log(
          '[HINATA EDITS] Download successful:',
          video.info.title
        );

      } catch (error) {
        console.error(
          '[HINATA EDITS] Skipping failed video:',
          video.url,
          error.message
        );
      }
    }

    if (!downloaded.length) {
      return ctx.reply(
        '❌ تعذّر تنزيل الفيديوهات المتاحة حالياً.'
      );
    }

    console.log(
      `[HINATA EDITS] Downloaded ${downloaded.length} videos`
    );

    

await sendVideoCarousel(ctx, downloaded, query);

  } catch (error) {
    console.error('[HINATA EDITS]', error);

    await ctx.reply(
      '❌ تعذّر البحث أو تجهيز فيديوهات الإيديت حالياً.\n' +
      'تحقق من اتصال الإنترنت وتوفر yt-dlp وFFmpeg.'
    );

  } finally {
    for (const item of downloaded) {
      if (item?.dir) {
        await fs.rm(item.dir, {
          recursive: true,
          force: true
        }).catch(() => {});
      }
    }

    activeChats.delete(ctx.jid);
  }
}

export function registerYoutubeEditCommands(commands) {
  for (const name of ['ايديت', 'ايدت']) {
    commands.set(name, {
      description: 'البحث عن Edits حديثة من YouTube Shorts',
      reaction: '🎬',
      handler: handleEditSearch
    });
  }
}
