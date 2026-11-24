import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import yts from 'yt-search';

const jobs = new Map();

const MAX_VIDEO = 64 * 1024 * 1024;
const MAX_AUDIO = 15 * 1024 * 1024;
const MAX_INPUT = 64 * 1024 * 1024;
const JOB_TTL = 10 * 60 * 1000;
const MAX_JOBS = 100;
const MAX_DOWNLOADS = 2;

const YT_DLP_PATH = process.env.YT_DLP_PATH || 'yt-dlp';
const FFMPEG_PATH = process.env.FFMPEG_PATH || 'ffmpeg';

let activeDownloads = 0;
let toolsReady = null;

function run(command, args, maxOutput = 8 * 1024 * 1024, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    let child;
    let stdout = '';
    let stderr = '';
    let settled = false;
    let stdoutBytes = 0;
    let stderrBytes = 0;

    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      if (error) reject(error);
      else resolve(result);
    };

    try {
      child = spawn(command, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
      });
    } catch (error) {
      finish(error);
      return;
    }

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(new Error(`${command} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    timer.unref?.();

    child.stdout.on('data', chunk => {
      stdoutBytes += chunk.length;

      if (stdoutBytes > maxOutput) {
        child.kill('SIGKILL');
        finish(new Error(`${command}: output limit exceeded`));
        return;
      }

      stdout += chunk.toString();
    });

    child.stderr.on('data', chunk => {
      stderrBytes += chunk.length;

      if (stderrBytes <= 256 * 1024) {
        stderr += chunk.toString();
      }
    });

    child.on('error', error => finish(error));

    child.on('close', code => {
      if (code === 0) {
        finish(null, stdout.trim());
      } else {
        finish(new Error(
          stderr.slice(-3000) || `${command} exited with code ${code}`
        ));
      }
    });
  });
}

async function ensureTools() {
  if (!toolsReady) {
    toolsReady = (async () => {
      try {
        await run(YT_DLP_PATH, ['--version'], 1024 * 1024, 15000);
        await run(FFMPEG_PATH, ['-version'], 1024 * 1024, 15000);
      } catch (error) {
        toolsReady = null;

        if (error?.code === 'ENOENT') {
          throw new Error(
            'أداة yt-dlp أو FFmpeg غير مثبتة على السيرفر أو غير موجودة في PATH.'
          );
        }

        throw new Error(`تعذر تشغيل أدوات التحميل: ${error.message}`);
      }
    })();
  }

  return toolsReady;
}

function formatDuration(seconds) {
  if (!Number.isFinite(Number(seconds))) return 'غير معروف';

  const n = Number(seconds);
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const s = Math.floor(n % 60);

  return h
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

function validateUrl(value) {
  let parsed;

  try {
    parsed = new URL(String(value).trim());
  } catch {
    throw new Error('الرابط غير صالح.');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('نوع الرابط غير مدعوم.');
  }

  if (parsed.username || parsed.password) {
    throw new Error('الروابط التي تحتوي بيانات دخول غير مدعومة.');
  }

  const host = parsed.hostname.toLowerCase();

  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host.endsWith('.local') ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  ) {
    throw new Error('هذا العنوان غير مسموح.');
  }

  return parsed.href;
}

async function getInfo(url) {
  await ensureTools();

  const raw = await run(YT_DLP_PATH, [
    '--dump-single-json',
    '--skip-download',
    '--no-warnings',
    '--no-playlist',
    '--socket-timeout', '20',
    '--',
    url
  ], 12 * 1024 * 1024, 60000);

  return JSON.parse(raw);
}

async function downloadMedia(url, dir, kind) {
  await ensureTools();

  const output = path.join(dir, 'media.%(ext)s');

  const args = [
    '--no-playlist',
    '--no-warnings',
    '--no-progress',
    '--no-part',
    '--restrict-filenames',
    '--socket-timeout', '25',
    '--retries', '2',
    '--fragment-retries', '2',
    '--extractor-retries', '2',
    '--concurrent-fragments', '4',
    '--buffer-size', '16K',
    '--max-filesize', '64M',
    '-o', output
  ];

  if (kind === 'video') {
    args.push(
      '-f',
      'bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b',
      '--merge-output-format',
      'mp4'
    );
  } else {
    args.push(
      '-f', 'ba/b',
      '-x',
      '--audio-format', 'mp3',
      '--audio-quality', '6'
    );
  }

  args.push('--', url);

  await run(YT_DLP_PATH, args, 1024 * 1024, 180000);

  const files = await fs.readdir(dir);
  const candidates = files
    .filter(name => name.startsWith('media.'))
    .map(name => path.join(dir, name));

  for (const file of candidates) {
    const stat = await fs.stat(file);

    if (!stat.isFile() || stat.size <= 0) continue;

    if (stat.size > MAX_INPUT) {
      throw new Error('حجم الملف الأصلي أكبر من الحد المسموح.');
    }

    return file;
  }

  throw new Error('لم يتم العثور على الملف بعد التحميل.');
}

async function makeVoice(input, output) {
  await run(FFMPEG_PATH, [
    '-hide_banner',
    '-loglevel', 'error',
    '-y',
    '-i', input,
    '-vn',
    '-c:a', 'libopus',
    '-b:a', '64k',
    '-ac', '1',
    '-ar', '48000',
    '-f', 'ogg',
    output
  ], 1024 * 1024, 60000);
}

function getToken() {
  return crypto.randomBytes(8).toString('hex');
}

function cleanupJobs() {
  const now = Date.now();

  for (const [token, job] of jobs) {
    if (!job || job.expires < now) {
      jobs.delete(token);
    }
  }

  while (jobs.size >= MAX_JOBS) {
    jobs.delete(jobs.keys().next().value);
  }
}

function getCommandText(ctx) {
  if (Array.isArray(ctx.args) && ctx.args.length) {
    return ctx.args.join(' ').trim();
  }

  return String(ctx.text || '').trim();
}

async function sendPreview(ctx, info) {
  const url = info.webpage_url || info.original_url || info.url;

  if (!url) {
    throw new Error('تعذر تحديد رابط المحتوى.');
  }

  cleanupJobs();

  const token = getToken();

  jobs.set(token, {
    url: validateUrl(url),
    jid: ctx.jid,
    sender: ctx.senderJid,
    expires: Date.now() + JOB_TTL
  });

  const title = String(info.title || 'بدون عنوان').slice(0, 180);
  const uploader = String(
    info.uploader || info.channel || info.author?.name || 'غير معروف'
  ).slice(0, 100);

  const caption = [
    '*╭━━━━━━━〔 ❄️ 𝑨𝒍𝒗𝒂𝒓𝒊𝒂 ❅ 〕━━━━━━━╮*',
    '',
    '┏━━━━━━━━━━━━━━━━━━━━━━┓',
    '❄️ 𝑨𝒍𝒗𝒂𝒓𝒊𝒂 • 𝑴𝑬𝑫𝑰𝑨',
    '',
    `*_🎬 الــعــنــوان: ${title}_*`,
    `*_👤 الــقــنــاة: ${uploader}_*`,
    `*_⏱️ الــمــدة: ${formatDuration(info.duration || info.seconds)}_*`,
    '',
    '*اختر نوع التحميل من الأزرار بالأسفل.*',
    '┗━━━━━━━━━━━━━━━━━━━━━━┛',
    '',
    '*╰━━━━━━━〔 ❄️ 𝑨𝒍𝒗𝒂𝒓𝒊𝒂 ❅ 〕━━━━━━━╯*',
    '*🍁 𝑴𝑨𝑫𝑬 𝑩𝒀 𝑨𝒍𝒗𝒂𝒓𝒊𝒂 🍁*'
  ].join('\n');

  const { sendHinataNativeButtons } =
    await import('./native-buttons.js');

  await sendHinataNativeButtons(ctx.sock, ctx.jid, {
    text: caption,
    title: '❄️ 𝑨𝒍𝒗𝒂𝒓𝒊𝒂 • 𝑴𝑬𝑫𝑰𝑨',
    footer: '❅ MADE BY ALVARIA',
    imageUrl: info.thumbnail || null,
    buttons: [
      {
        type: 'quick_reply',
        text: '🎬 تحميل فيديو',
        id: `.تحميل_فيديو ${token}`
      },
      {
        type: 'quick_reply',
        text: '🎧 تحميل صوت',
        id: `.تحميل_صوت ${token}`
      }
    ]
  });
}

async function sendSearchResults(ctx, query) {
  const result = await Promise.race([
    yts(query),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Search timed out')), 25000)
    )
  ]);

  const videos = (result?.videos || [])
    .filter(video => video?.url && video?.title)
    .slice(0, 5);

  if (!videos.length) {
    return ctx.reply('❌ لم أعثر على نتائج لهذا البحث.');
  }

  cleanupJobs();

  const token = getToken();

  jobs.set(token, {
    type: 'search',
    videos,
    jid: ctx.jid,
    sender: ctx.senderJid,
    expires: Date.now() + JOB_TTL
  });

  const { sendHinataNativeButtons } =
    await import('./native-buttons.js');

  const buttons = videos.map((video, index) => ({
    type: 'quick_reply',
    text: `🎬 النتيجة ${index + 1}`,
    id: `.تحميل_اختيار ${token} ${index}`
  }));

  const lines = [
    '╭━━〔 ❄️ ALVARIA MEDIA 〕━━╮',
    '',
    `🔎 نتائج البحث عن: ${query.slice(0, 100)}`,
    ''
  ];

  videos.forEach((video, index) => {
    lines.push(
      `${index + 1}. ${String(video.title).slice(0, 120)}`,
      `👤 ${String(video.author?.name || 'غير معروف').slice(0, 70)}`,
      `⏱️ ${video.timestamp || 'غير محددة'}`,
      ''
    );
  });

  lines.push('اختر النتيجة لعرض خيارات الفيديو والصوت.');

  await sendHinataNativeButtons(ctx.sock, ctx.jid, {
    text: lines.join('\n'),
    title: '❄️ 𝑨𝒍𝒗𝒂𝒓𝒊𝒂 • 𝑺𝑬𝑨𝑹𝑪𝑯',
    footer: '🍁 ALVARIA MEDIA',
    buttons
  });
}

async function handleSearchSelection(ctx) {
  const parts = getCommandText(ctx).split(/\s+/);
  const token = parts[0];
  const index = Number(parts[1]);
  const job = jobs.get(token);

  if (!job || job.expires < Date.now()) {
    jobs.delete(token);
    return ctx.reply('⌛ انتهت صلاحية نتائج البحث. أعد البحث من جديد.');
  }

  if (job.jid !== ctx.jid || job.sender !== ctx.senderJid) {
    return ctx.reply('⛔ هذه النتائج ليست خاصة بك.');
  }

  if (!Number.isInteger(index) || !job.videos?.[index]) {
    return ctx.reply('❌ الاختيار غير صالح.');
  }

  const video = job.videos[index];
  jobs.delete(token);

  try {
    await sendPreview(ctx, {
      title: video.title,
      url: video.url,
      webpage_url: video.url,
      thumbnail: video.thumbnail,
      uploader: video.author?.name,
      duration: video.seconds
    });
  } catch (error) {
    console.error('[HINATA DOWNLOAD SELECT]', error);
    await ctx.reply('❌ تعذر تجهيز معاينة هذه النتيجة.');
  }
}

async function handleDownload(ctx, kind) {
  const token = getCommandText(ctx).split(/\s+/)[0];
  const job = jobs.get(token);

  if (!job || job.expires < Date.now()) {
    jobs.delete(token);
    return ctx.reply('⌛ انتهت صلاحية الطلب. أرسل الرابط أو اسم المحتوى مجدداً.');
  }

  if (job.jid !== ctx.jid || job.sender !== ctx.senderJid) {
    return ctx.reply('⛔ هذا الطلب ليس خاصاً بك.');
  }

  if (activeDownloads >= MAX_DOWNLOADS) {
    return ctx.reply('⏳ توجد عمليات تحميل أخرى الآن. حاول بعد قليل.');
  }

  jobs.delete(token);
  activeDownloads++;

  let dir;

  try {
    await ctx.reply(
      kind === 'video'
        ? '🎬 جارٍ تجهيز الفيديو...'
        : '🎧 جارٍ تجهيز الصوت...'
    );

    await ensureTools();

    const info = await getInfo(job.url);

    dir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'hinata-download-')
    );

    const file = await downloadMedia(job.url, dir, kind);
    const stat = await fs.stat(file);

    if (kind === 'video') {
      if (stat.size > MAX_VIDEO) {
        throw new Error('Video exceeds WhatsApp size limit');
      }

      const video = await fs.readFile(file);
      const ext = path.extname(file).toLowerCase();

      const mimetype = {
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
        '.mkv': 'video/x-matroska'
      }[ext] || 'video/mp4';

      await ctx.sock.sendMessage(ctx.jid, {
        video,
        mimetype,
        caption: `❄️ ${String(info.title || 'ALVARIA MEDIA').slice(0, 180)}`
      }, { quoted: ctx.message });

    } else {
      const voicePath = path.join(dir, 'voice.ogg');

      await makeVoice(file, voicePath);

      const voiceStat = await fs.stat(voicePath);

      if (voiceStat.size === 0 || voiceStat.size > MAX_AUDIO) {
        throw new Error('Audio exceeds WhatsApp size limit');
      }

      const audio = await fs.readFile(voicePath);

      await ctx.sock.sendMessage(ctx.jid, {
        audio,
        mimetype: 'audio/ogg; codecs=opus',
        ptt: true
      }, { quoted: ctx.message });
    }

  } catch (error) {
    console.error('[HINATA DOWNLOAD]', error);

    const message = String(error?.message || '');

    if (message.includes('غير مثبت') || message.includes('not found')) {
      await ctx.reply('❌ أدوات التحميل غير متاحة على السيرفر. راجع إعدادات Railway.');
    } else if (message.toLowerCase().includes('max-filesize') || message.includes('أكبر من الحد')) {
      await ctx.reply('⚠️ حجم الملف أكبر من الحد المسموح.');
    } else {
      await ctx.reply('❌ تعذر إكمال التحميل. قد يكون الرابط غير مدعوم أو المحتوى غير متاح حالياً.');
    }

  } finally {
    activeDownloads--;

    if (dir) {
      await fs.rm(dir, {
        recursive: true,
        force: true
      }).catch(() => {});
    }
  }
}

export function registerMediaDownloadCommands(commands) {
  commands.set('تحميل', {
    description: 'تحميل فيديو أو صوت من رابط أو البحث بالاسم',
    reaction: '🔎',
    handler: async ctx => {
      const value = getCommandText(ctx);

      if (!value) {
        return ctx.reply(
          '📥 𝑨𝒍𝒗𝒂𝒓𝒊𝒂 • 𝑫𝑶𝑾𝑵𝑳𝑶𝑨𝑫\n\n' +
          'أرسل رابط فيديو أو اكتب اسم المحتوى للبحث عنه.\n\n' +
          'أمثلة:\n' +
          '.تحميل Naruto AMV\n' +
          '.تحميل https://example.com/video\n\n' +
          'بعدها اختر النتيجة ونوع التحميل.'
        );
      }

      try {
        await ctx.reply('🔎 جارٍ البحث أو قراءة معلومات الرابط...');

        let url = null;

        try {
          url = validateUrl(value);
        } catch {
          // إذا لم يكن رابطاً، نبحث عنه بالاسم.
        }

        if (url) {
          const info = await getInfo(url);

          if (!info?.title) {
            return ctx.reply('❌ لم أستطع قراءة معلومات هذا الرابط.');
          }

          return await sendPreview(ctx, info);
        }

        if (value.length > 150) {
          return ctx.reply('⚠️ عبارة البحث طويلة جداً.');
        }

        await sendSearchResults(ctx, value);

      } catch (error) {
        console.error('[HINATA DOWNLOAD SEARCH]', error);
        await ctx.reply(
          '❌ تعذر البحث أو قراءة الرابط. تحقق من اتصال السيرفر وأدوات التحميل.'
        );
      }
    }
  });

  commands.set('تحميل_اختيار', {
    description: 'اختيار نتيجة من البحث',
    reaction: '🎬',
    handler: handleSearchSelection
  });

  commands.set('تحميل_فيديو', {
    description: 'تحميل الفيديو',
    reaction: '🎬',
    handler: ctx => handleDownload(ctx, 'video')
  });

  commands.set('تحميل_صوت', {
    description: 'تحميل الصوت كتسجيل',
    reaction: '🎧',
    handler: ctx => handleDownload(ctx, 'audio')
  });
}


// HINATA MULTI-SONG SEARCH + PREPARATION
export function registerSongSearchCommand(commands) {
  const songJobs = new Map();
  const MAX_RESULTS = 1;
  const MAX_PARALLEL = 3;
  const SONG_TTL = 10 * 60 * 1000;

  let active = 0;
  const waiting = [];

  async function limited(task) {
    if (active >= MAX_PARALLEL) {
      await new Promise(resolve => waiting.push(resolve));
    }

    active++;

    try {
      return await task();
    } finally {
      active--;
      waiting.shift()?.();
    }
  }

  function commandArgs(ctx, commandName) {
    let value = String(ctx.text || ctx.body || '').trim();

    if (Array.isArray(ctx.args)) {
      value = ctx.args.join(' ').trim();
    }

    const escaped = commandName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    value = value.replace(
      new RegExp(`^[.!/#]?${escaped}\\s*`, 'u'),
      ''
    );

    return value.trim();
  }

  async function prepareExistingSong(video, directory, index) {
    if (!video?.url || typeof video.url !== 'string') {
      throw new Error('Invalid video URL');
    }

    // مجلد مستقل لكل نتيجة لتجنب تداخل تنزيلات yt-dlp.
    const songDirectory = path.join(
      directory,
      `song-${index}`
    );

    await fs.mkdir(songDirectory, { recursive: true });

    // استخدام دالة yt-dlp الموجودة مسبقًا دون تغييرها.
    const downloadedFile = await downloadMedia(
      video.url,
      songDirectory,
      'audio'
    );

    const outputFile = path.join(
      directory,
      `voice-${index}.ogg`
    );

    await makeVoice(downloadedFile, outputFile);

    const outputStat = await fs.stat(outputFile);

    if (
      !outputStat.isFile() ||
      outputStat.size === 0 ||
      outputStat.size > MAX_AUDIO
    ) {
      throw new Error('Invalid prepared voice');
    }

    return outputFile;
  }

  async function sendSongList(ctx, token, entries) {
    const entry = entries[0];

    if (!entry) {
      throw new Error('No song result available');
    }

    // لا نعرض زر التحميل إلا بعد اكتمال تجهيز التسجيل.
    await entry.ready;

    if (!entry.file) {
      throw new Error('Song voice file was not prepared');
    }

    const video = entry.video || {};
    const title = String(video.title || 'بدون عنوان').slice(0, 150);
    const author = String(
      video.author?.name || 'فنان غير معروف'
    ).slice(0, 80);
    const duration = String(video.timestamp || 'غير محددة');
    const views = video.views
      ? Number(video.views).toLocaleString('en-US')
      : 'غير متاحة';

    // مدّد صلاحية الاختيار بعد انتهاء التجهيز.
    const job = songJobs.get(token);
    if (job) {
      job.expires = Date.now() + SONG_TTL;
    }

    const { sendHinataNativeButtons } =
      await import('./native-buttons.js');

    const text = [
      '╭━━━━━━〔 ❄️ 𝑨𝒍𝒗𝒂𝒓𝒊𝒂 ❅ 〕━━━━━━╮',
      '',
      '🎵 تَـمَّ تَـجْـهِـيـزُ الأُغْـنِـيَـة',
      '',
      `🎼 الاسم: ${title}`,
      `🎤 الفنان: ${author}`,
      `⏱️ المدة: ${duration}`,
      `👁️ المشاهدات: ${views}`,
      '',
      '✅ التسجيل الصوتي أصبح جاهزًا.',
      'اضغط الزر بالأسفل لإرساله كتسجيل صوتي.',
      '',
      '╰━━━━━━〔 ❄️ MADE BY ALVARIA 〕━━━━━━╯'
    ].join('\n');

    return sendHinataNativeButtons(ctx.sock, ctx.jid, {
      text,
      title: '❄️ 𝑨𝒍𝒗𝒂𝒓𝒊𝒂 • 𝑴𝑼𝑺𝑰𝑪',
      footer: '🎧 ALVARIA MUSIC',
      imageUrl: video.thumbnail || null,
      buttons: [{
        type: 'quick_reply',
        text: '🎧 تحميل الأغنية',
        id: `.اغنيه_اختيار ${token} 0`
      }]
    });
  }

  async function searchHandler(ctx) {
    const query = commandArgs(ctx, 'اغنيه')
      .replace(/^أغنية\s*/u, '')
      .replace(/^اغنية\s*/u, '')
      .trim();

    if (!query) {
      return ctx.reply(
        '🎵 أرسل اسم الأغنية أو الفنان.\n\n' +
        'مثال:\n.اغنيه Naruto Blue Bird'
      );
    }

    if (query.length > 150) {
      return ctx.reply('⚠️ عبارة البحث طويلة جدًا.');
    }

    let directory = null;
    let token = null;

    try {
      await ctx.reply('🔎 جارٍ البحث عن عدة أغنيات...');

      const result = await yts(query);

      const videos = (result?.videos || [])
        .filter(video => video?.videoId && video?.url)
        .slice(0, MAX_RESULTS);

      if (!videos.length) {
        return ctx.reply('❌ لم أعثر على نتائج مناسبة.');
      }

      directory = await fs.mkdtemp(
        path.join(os.tmpdir(), 'hinata-songs-')
      );

      token = getToken();

      const entries = videos.map((video, index) => {
        const entry = {
          video,
          file: null,
          error: null,
          ready: null
        };

        entry.ready = limited(async () => {
          try {
            entry.file = await prepareExistingSong(
              video,
              directory,
              index
            );

            return entry.file;
          } catch (error) {
            entry.error = error;
            throw error;
          }
        });

        // منع رفض Promise غير المعالجة أثناء التجهيز الخلفي.
        entry.ready.catch(() => {});

        return entry;
      });

      const job = {
        jid: ctx.jid,
        sender: ctx.senderJid,
        entries,
        directory,
        expires: Date.now() + SONG_TTL
      };

      songJobs.set(token, job);

      while (songJobs.size > 100) {
        const oldest = songJobs.keys().next().value;
        const oldJob = songJobs.get(oldest);

        songJobs.delete(oldest);

        if (oldJob?.directory) {
          await fs.rm(oldJob.directory, {
            recursive: true,
            force: true
          }).catch(() => {});
        }
      }

      // بدأ التجهيز بالفعل قبل إرسال قائمة الاختيار.
      await sendSongList(ctx, token, entries);

      const timer = setTimeout(async () => {
        if (songJobs.get(token) === job) {
          songJobs.delete(token);

          await fs.rm(directory, {
            recursive: true,
            force: true
          }).catch(() => {});
        }
      }, SONG_TTL);

      timer.unref?.();

    } catch (error) {
      console.error('[ALVARIA SONG SEARCH]', error);

      if (token) {
        songJobs.delete(token);
      }

      if (directory) {
        await fs.rm(directory, {
          recursive: true,
          force: true
        }).catch(() => {});
      }

      await ctx.reply(
        '❌ تعذّر البحث أو إرسال قائمة الأغاني.\n' +
        'تحقق من الإنترنت وyt-search.'
      );
    }
  }

  async function selectSongHandler(ctx) {
    const raw = commandArgs(ctx, 'اغنيه_اختيار');
    const parts = raw.split(/\s+/);

    const token = parts[0];
    const index = Number(parts[1]);

    if (
      !token ||
      !Number.isInteger(index) ||
      index < 0
    ) {
      return ctx.reply('❌ اختيار الأغنية غير صالح.');
    }

    const job = songJobs.get(token);

    if (!job || job.expires < Date.now()) {
      songJobs.delete(token);
      return ctx.reply('⌛ انتهت صلاحية القائمة. أرسل البحث مجددًا.');
    }

    if (
      job.jid !== ctx.jid ||
      job.sender !== ctx.senderJid
    ) {
      return ctx.reply('⛔ هذا الطلب ليس خاصًا بك.');
    }

    const entry = job.entries[index];

    if (!entry) {
      return ctx.reply('❌ الأغنية المختارة غير موجودة.');
    }

    try {
      if (!entry.file) {
        await ctx.reply('⏳ جارٍ إنهاء تجهيز الأغنية المختارة...');

        // انتظار نفس عملية التجهيز، دون تكرارها.
        await entry.ready;
      }

      const audio = await fs.readFile(entry.file);

      await ctx.sock.sendMessage(
        ctx.jid,
        {
          audio,
          mimetype: 'audio/ogg; codecs=opus',
          ptt: true
        },
        {
          quoted: ctx.message
        }
      );

    } catch (error) {
      console.error('[ALVARIA SONG SELECT]', error);

      return ctx.reply(
        '❌ التسجيل الصوتي غير متاح لهذه النتيجة حاليًا.'
      );
    }
  }

  const searchCommand = {
    description: 'البحث عن عدة أغنيات واختيار تسجيل صوتي',
    reaction: '🎵',
    handler: searchHandler
  };

  for (const name of ['اغنيه', 'أغنية', 'اغنية']) {
    commands.set(name, searchCommand);
  }

  commands.set('اغنيه_اختيار', {
    description: 'إرسال الأغنية المختارة كرسالة صوتية',
    reaction: '🎧',
    handler: selectSongHandler
  });
}
