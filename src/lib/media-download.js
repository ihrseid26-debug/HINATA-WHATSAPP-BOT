import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import yts from 'yt-search';

const jobs = new Map();
const MAX_VIDEO = 64 * 1024 * 1024;
const MAX_AUDIO = 15 * 1024 * 1024;

function run(command, args, maxOutput = 8 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args);
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', chunk => {
      stdout += chunk.toString();
      if (stdout.length > maxOutput) {
        child.kill();
        reject(new Error('Output too large'));
      }
    });

    child.stderr.on('data', chunk => {
      stderr += chunk.toString();
    });

    child.on('error', reject);

    child.on('close', code => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr.slice(-3000) || `${command}: ${code}`));
    });
  });
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

async function getInfo(url) {
  const raw = await run('yt-dlp', [
    '--dump-single-json',
    '--skip-download',
    '--no-warnings',
    '--no-playlist',
    '--',
    url
  ]);

  return JSON.parse(raw);
}

async function downloadMedia(url, dir, kind) {
  const output = path.join(dir, 'media.%(ext)s');

  const args = [
    '--no-playlist',
    '--no-warnings',
    '--no-progress',
    '--socket-timeout', '25',
    '--retries', '3',
    '--fragment-retries', '3',
    '--extractor-retries', '2',
    '--concurrent-fragments', '8',
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
      '--audio-quality', '5'
    );
  }

  args.push('--', url);

  await run('yt-dlp', args, 1024 * 1024);

  const files = await fs.readdir(dir);

  const candidates = files
    .filter(name => name.startsWith('media.'))
    .map(name => path.join(dir, name));

  for (const file of candidates) {
    const stat = await fs.stat(file);

    if (stat.isFile() && stat.size > 0) {
      return file;
    }
  }

  throw new Error('Downloaded media file not found');
}

async function makeVoice(input, output) {
  await run('ffmpeg', [
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
  ]);
}

function getToken() {
  return crypto.randomBytes(7).toString('hex');
}

async function sendPreview(ctx, info) {
  const caption = [
    '*╭━━━━━━━〔 ❄️ 𝑨𝒍𝒗𝒂𝒓𝒊𝒂 ❅ 〕━━━━━━━╮*',
    '',
    '┏━━━━━━━━━━━━━━━━━━━━━━┓',
    '❄️ 𝑨𝒍𝒗𝒂𝒓𝒊𝒂 • 𝑴𝑬𝑫𝑰𝑨',
    '',
    `*_🎬 الــعــنــوان: ${info.title || 'بدون عنوان'}_*`,
    `*_👤 الــقــنــاة: ${info.uploader || info.channel || 'غير معروف'}_*`,
    `*_⏱️ الــمــدة: ${formatDuration(info.duration)}_*`,
    '',
    '*اخــتــر نــوع الــتــحــمــيــل مــنَ الأَزْرَارِ بِالْأَسْفَل.*',
    '┗━━━━━━━━━━━━━━━━━━━━━━┛',
    '',
    '*╰━━━━━━━〔 ❄️ 𝑨𝒍𝒗𝒂𝒓𝒊𝒂 ❅ 〕━━━━━━━╯*',
    '*🍁 𝑴𝑨𝑫𝑬 𝑩𝒀 𝑨𝒍𝒗𝒂𝒓𝒊𝒂 🍁*'
  ].join('\n');

  const token = getToken();

  jobs.set(token, {
    url: info.webpage_url || info.original_url,
    jid: ctx.jid,
    sender: ctx.senderJid,
    expires: Date.now() + 10 * 60 * 1000
  });

  while (jobs.size > 100) {
    jobs.delete(jobs.keys().next().value);
  }

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
        text: '🎬 تحميل فيديو كامل',
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

async function handleDownload(ctx, kind) {
  const token = String(ctx.text || '').trim().split(/\s+/)[0];
  const job = jobs.get(token);

  if (!job || job.expires < Date.now()) {
    jobs.delete(token);
    return ctx.reply('⌛ انتهت صلاحية الطلب. أرسل رابط التحميل من جديد.');
  }

  if (job.jid !== ctx.jid || job.sender !== ctx.senderJid) {
    return ctx.reply('هذا الطلب ليس خاصًا بك.');
  }

  jobs.delete(token);

  let dir;

  try {
    await ctx.reply(
      kind === 'video'
        ? '🎬 جارٍ تجهيز الفيديو...'
        : '🎧 جارٍ تجهيز التسجيل الصوتي...'
    );

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

      await ctx.sock.sendMessage(ctx.jid, {
        video,
        mimetype: ext === '.mp4' ? 'video/mp4' : 'video/webm',
        caption: `❄️ ${info.title || 'ALVARIA MEDIA'}`
      }, { quoted: ctx.message });

    } else {
      if (stat.size > MAX_AUDIO) {
        throw new Error('Audio exceeds size limit');
      }

      const voicePath = path.join(dir, 'voice.ogg');

      await makeVoice(file, voicePath);

      const audio = await fs.readFile(voicePath);

      await ctx.sock.sendMessage(ctx.jid, {
        audio,
        mimetype: 'audio/ogg; codecs=opus',
        ptt: true
      }, { quoted: ctx.message });
    }

  } catch (error) {
    console.error('[ALVARIA DOWNLOAD]', error);
    await ctx.reply(
      '❌ تعذّر إكمال التحميل. تحقق من الرابط وأدوات yt-dlp وFFmpeg.'
    );
  } finally {
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
    description: 'عرض خيارات تحميل الوسائط من رابط',
    reaction: '🔎',
    handler: async ctx => {
      const url = String(ctx.text || '').trim();

      if (!url) {
        return ctx.reply('📥 𝑨𝒍𝒗𝒂𝒓𝒊𝒂 • 𝑫𝑶𝑾𝑵𝑳𝑶𝑨𝑫\n\nأرسل رابط الفيديو أو المحتوى بعد الأمر.\nسأعرض لك صورة مصغرة ومعلومات الرابط، ثم تختار:\n🎬 تحميل فيديو كامل\n🎧 تحميل صوت\n\nمثال: .تحميل https://example.com/media');
      }

      let parsed;

      try {
        parsed = new URL(url);
      } catch {
        return ctx.reply('❌ الرابط غير صالح.');
      }

      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return ctx.reply('❌ نوع الرابط غير مدعوم.');
      }

      try {
        await ctx.reply('🔎 جارٍ قراءة معلومات الرابط...');

        const info = await getInfo(url);

        if (!info || !info.title) {
          return ctx.reply('❌ لم أستطع قراءة معلومات هذا الرابط.');
        }

        await sendPreview(ctx, info);

      } catch (error) {
        console.error('[ALVARIA PREVIEW]', error);
        await ctx.reply(
          '❌ تعذّر قراءة الرابط. تأكد من تثبيت yt-dlp وأن الرابط متاح.'
        );
      }
    }
  });

  commands.set('تحميل_فيديو', {
    description: 'إرسال الفيديو',
    reaction: '🎬',
    handler: ctx => handleDownload(ctx, 'video')
  });

  commands.set('تحميل_صوت', {
    description: 'إرسال الصوت كتسجيل',
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
