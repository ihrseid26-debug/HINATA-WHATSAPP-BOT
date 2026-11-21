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

const MAX_CARDS = 3;
const MAX_DURATION = 90;
const MAX_VIDEO_SIZE = 12 * 1024 * 1024;

const activeChats = new Set();

function run(command, args, maxOutput = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const fail = error => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    child.stdout.on('data', chunk => {
      stdout += chunk.toString();

      if (stdout.length > maxOutput) {
        child.kill();
        fail(new Error('Output too large'));
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
        resolve(stdout.trim());
      } else {
        fail(new Error(stderr.slice(-2500) || `${command}: ${code}`));
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
            console.error('[ALVARIA EDIT WORKER]', error);
            results[index] = null;
          }
        }
      }
    )
  ).then(() => results);
}

async function getInfo(url) {
  const raw = await run('yt-dlp', [
    '--dump-single-json',
    '--skip-download',
    '--no-warnings',
    '--no-playlist',
    '--socket-timeout', '15',
    '--retries', '1',
    '--',
    url
  ]);

  return JSON.parse(raw);
}

async function findVideos(candidates) {
  const checked = await mapLimit(candidates, 4, async video => {
    const url = getUrl(video);

    if (!url) return null;

    const info = await getInfo(url);

    const duration = Number(info.duration ?? video.seconds);

    // لا تستبعد الفيديو إذا كانت المدة غير متاحة في بيانات البحث.
    // ارفض فقط الفيديو الذي ثبت أن مدته تتجاوز الحد.
    if (Number.isFinite(duration) && duration > MAX_DURATION) {
      return null;
    }

    return { video, info, url };
  });

  return checked.filter(Boolean).slice(0, MAX_CARDS);
}

async function downloadVideo(item, index) {
  const dir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'hinata-edit-')
  );

  try {
    const output = path.join(dir, `clip-${index}.%(ext)s`);

    await run('yt-dlp', [
      '--no-playlist',
      '--no-warnings',
      '--no-progress',
      '--socket-timeout', '20',
      '--retries', '1',
      '--fragment-retries', '1',
      '--concurrent-fragments', '4',
      '--max-filesize', '12M',
      '-f',
      'bv*[height<=360]+ba/b[height<=360]/b',
      '--merge-output-format', 'mp4',
      '-o', output,
      '--',
      item.url
    ], 512 * 1024);

    const names = await fs.readdir(dir);

    let file = null;

    for (const name of names) {
      if (
        name.endsWith('.part') ||
        name.endsWith('.ytdl') ||
        name.endsWith('.json')
      ) continue;

      const candidate = path.join(dir, name);
      const stat = await fs.stat(candidate);

      if (stat.isFile() && stat.size > 0) {
        file = candidate;
        break;
      }
    }

    if (!file) {
      throw new Error('Downloaded video not found');
    }

    // توحيد ترميز الفيديو ليعمل بشكل طبيعي على WhatsApp.
    const normalized = path.join(dir, 'hinata-normalized.mp4');

    await run('ffmpeg', [
      '-y',
      '-hide_banner',
      '-loglevel', 'error',
      '-i', file,
      '-map', '0:v:0',
      '-map', '0:a:0?',
      '-sn',
      '-dn',
      '-vf',
      'scale=640:360:force_original_aspect_ratio=decrease:force_divisible_by=2,fps=30,setsar=1',
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-crf', '28',
      '-profile:v', 'baseline',
      '-level', '3.0',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '96k',
      '-ac', '2',
      '-ar', '44100',
      '-movflags', '+faststart',
      '-max_muxing_queue_size', '1024',
      normalized
    ], 512 * 1024);

    const normalizedStat = await fs.stat(normalized);

    if (!normalizedStat.isFile() || normalizedStat.size === 0) {
      throw new Error('FFmpeg produced an invalid video');
    }

    if (normalizedStat.size > MAX_VIDEO_SIZE) {
      throw new Error('Normalized video exceeds 12 MB');
    }

    await fs.rm(file, { force: true });
    file = normalized;

    return {
      ...item,
      file,
      dir
    };

  } catch (error) {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

function cleanTitle(value) {
  return String(value || 'ALVARIA EDIT')
    .replace(/\s+/g, ' ')
    .slice(0, 85);
}

async function prepareVideoCard(sock, item, index) {
  const ext = path.extname(item.file).toLowerCase();

  const mimetype = ext === '.webm'
    ? 'video/webm'
    : 'video/mp4';

  const media = await prepareWAMessageMedia(
    {
      video: { url: item.file },
      mimetype
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
      title: `🎬 الفيديو ${index + 1}`,
      hasMediaAttachment: true,
      ...media
    },

    body: {
      text:
        `🎞️ ${title}\n\n` +
        `👤 القناة: ${item.info.uploader || item.info.channel || 'YouTube'}\n` +
        `⏱️ المدة: ${item.info.duration || 'غير معروفة'} ثانية\n` +
        `🍁 ALVARIA • EDITS`
    },

    footer: {
      text: '🍁 ALVARIA • EDITS'
    },

    nativeFlowMessage: {
      buttons: [
        {
          name: 'cta_url',
          buttonParamsJson: JSON.stringify({
            display_text: '▶️ فتح المصدر',
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
  const ext = path.extname(item.file).toLowerCase();

  await ctx.sock.sendMessage(
    ctx.jid,
    {
      video: buffer,
      mimetype: ext === '.webm' ? 'video/webm' : 'video/mp4',
      caption:
        `🍁 ALVARIA • EDITS\n\n` +
        `🎬 ${cleanTitle(item.info.title)}\n` +
        `🌸 MADE BY ALVARIA`
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

  // تجهيز البطاقات بحد أقصى عملي لتخفيف الضغط على الهاتف.
  const cards = await mapLimit(items, 2, (item, index) =>
    prepareVideoCard(sock, item, index)
  );

  if (cards.some(card => !card)) {
    throw new Error('Could not prepare every video card');
  }

  const userJid =
    sock.user?.id ||
    sock.authState?.creds?.me?.id;

  if (!userJid) {
    throw new Error('ALVARIA socket identity unavailable');
  }

  const interactive = proto.Message.InteractiveMessage.fromObject({
    header: {
      title: '🍁 ALVARIA • VIDEO EDITS',
      hasMediaAttachment: false
    },

    body: {
      text:
        `🎬 نتائج البحث عن: ${query}\n\n` +
        'اسحب الفيديوهات يمينًا ويسارًا لمشاهدة المقاطع.'
    },

    footer: {
      text: '🌸 MADE BY ALVARIA'
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
  const query = String(ctx.text || '').trim();

  if (!query) {
    return ctx.reply(
      '🍁 *ALVARIA • VIDEO EDITS*\n\n' +
      'أرسل اسم الشخصية أو الأنمي.\n\n' +
      'مثال:\n' +
      '.ايديت Naruto\n' +
      '.ايديت Gojo\n' +
      '.ايديت Hinata Hyuga'
    );
  }

  if (query.length > 100) {
    return ctx.reply('⚠️ عبارة البحث طويلة جدًا.');
  }

  if (activeChats.has(ctx.jid)) {
    return ctx.reply('⏳ يوجد بحث فيديو جارٍ في هذه المحادثة.');
  }

  activeChats.add(ctx.jid);

  const downloaded = [];

  try {
    await ctx.reply('🔎 جارٍ البحث عن فيديوهات قصيرة...');

    const result = await yts(`${query} shorts`);

    const candidates = (result?.videos || [])
      .filter(video => {
        const seconds = Number(video.seconds);

        return (
          Boolean(getUrl(video)) &&
          (
            !Number.isFinite(seconds) ||
            seconds <= 0 ||
            seconds <= MAX_DURATION
          )
        );
      })
      .slice(0, 8);

    if (!candidates.length) {
      return ctx.reply('❌ لم أعثر على مقاطع قصيرة مناسبة.');
    }

    await ctx.reply('⚡ جارٍ تجهيز الفيديوهات...');

    const videos = await findVideos(candidates);

    if (!videos.length) {
      return ctx.reply(
        '❌ لم أعثر على فيديوهات مناسبة.\n' +
        'جرّب اسمًا آخر.'
      );
    }

    // تنزيل فيديوهين في الوقت نفسه لتقليل الضغط على الهاتف.
    const results = await mapLimit(
      videos,
      2,
      (item, index) => downloadVideo(item, index)
    );

    downloaded.push(...results.filter(Boolean));

    if (!downloaded.length) {
      return ctx.reply(
        '❌ تعذّر تنزيل المقاطع المناسبة.\n' +
        'تحقق من الإنترنت ومساحة التخزين.'
      );
    }

    await ctx.reply('📤 تم تجهيز الفيديوهات، جارٍ إرسالها...');

    await sendVideoCarousel(ctx, downloaded, query);

  } catch (error) {
    console.error('[ALVARIA VIDEO EDITS]', error);

    await ctx.reply(
      '❌ تعذّر تجهيز فيديوهات الإيديت.\n' +
      'تحقق من اتصال الإنترنت وتحديث yt-dlp وFFmpeg.'
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
      description: 'البحث عن فيديوهات قصيرة وعرضها في بطاقات فيديو أفقية',
      reaction: '🎬',
      handler: handleEditSearch
    });
  }
}
