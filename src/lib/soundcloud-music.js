import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import SoundCloud from '@zibot/scdl';

const soundcloud = new SoundCloud({ init: true });
const songJobs = new Map();

const MAX_RESULTS = 10;
const MAX_SOURCE_SIZE = 64 * 1024 * 1024;
const MAX_AUDIO_SIZE = 15 * 1024 * 1024;
const SONG_TTL = 10 * 60 * 1000;
const MAX_JOBS = 100;
const DOWNLOAD_TIMEOUT = 180000;
const FFMPEG_TIMEOUT = 180000;

function getToken() {
  return crypto.randomBytes(8).toString('hex');
}

function formatDuration(milliseconds) {
  const total = Math.floor(Number(milliseconds) / 1000);

  if (!Number.isFinite(total) || total < 0) {
    return 'غير معروفة';
  }

  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;

  return hours
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${minutes}:${String(seconds).padStart(2, '0')}`;
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

async function removeJob(token) {
  const job = songJobs.get(token);
  if (!job) return;

  songJobs.delete(token);

  if (job.timer) {
    clearTimeout(job.timer);
  }

  if (job.directory) {
    await fs.rm(job.directory, {
      recursive: true,
      force: true
    }).catch(() => {});
  }
}

function scheduleCleanup(token, job) {
  if (job.timer) clearTimeout(job.timer);

  job.timer = setTimeout(() => {
    if (songJobs.get(token) === job) {
      removeJob(token).catch(() => {});
    }
  }, SONG_TTL);

  job.timer.unref?.();
}

async function downloadTrackToFile(track, outputFile) {
  const controller = new AbortController();

  const timer = setTimeout(() => {
    controller.abort(new Error('SoundCloud download timed out'));
  }, DOWNLOAD_TIMEOUT);

  timer.unref?.();

  let totalBytes = 0;

  const limiter = new Transform({
    transform(chunk, encoding, callback) {
      totalBytes += chunk.length;

      if (totalBytes > MAX_SOURCE_SIZE) {
        callback(new Error('SoundCloud source exceeded size limit'));
        return;
      }

      callback(null, chunk);
    }
  });

  try {
    const stream = await soundcloud.downloadTrack(
      track.permalink_url,
      {
        seek: 0,
        signal: controller.signal
      }
    );

    if (!stream || typeof stream.pipe !== 'function') {
      throw new Error('SoundCloud did not return an audio stream');
    }

    await pipeline(
      stream,
      limiter,
      createWriteStream(outputFile),
      { signal: controller.signal }
    );

    const stat = await fs.stat(outputFile);

    if (!stat.isFile() || stat.size === 0) {
      throw new Error('Downloaded audio is empty');
    }

    return outputFile;

  } finally {
    clearTimeout(timer);
  }
}

async function makeVoice(input, output) {
  await new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', [
      '-hide_banner',
      '-loglevel', 'error',
      '-y',
      '-i', input,
      '-vn',
      '-c:a', 'libopus',
      '-b:a', '64k',
      '-vbr', 'on',
      '-application', 'voip',
      '-ac', '1',
      '-ar', '48000',
      '-f', 'ogg',
      output
    ], {
      stdio: ['ignore', 'ignore', 'pipe']
    });

    let stderr = '';
    let settled = false;

    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      if (error) reject(error);
      else resolve();
    };

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(new Error('FFmpeg conversion timed out'));
    }, FFMPEG_TIMEOUT);

    timer.unref?.();

    child.stderr.on('data', chunk => {
      stderr += chunk.toString();

      if (stderr.length > 5000) {
        stderr = stderr.slice(-5000);
      }
    });

    child.on('error', finish);

    child.on('close', code => {
      if (code === 0) {
        finish();
      } else {
        finish(new Error(
          stderr || `FFmpeg exited with code ${code}`
        ));
      }
    });
  });

  const stat = await fs.stat(output);

  if (
    !stat.isFile() ||
    stat.size === 0 ||
    stat.size > MAX_AUDIO_SIZE
  ) {
    throw new Error('Prepared audio is invalid or too large');
  }

  return output;
}

async function prepareTrack(job, index) {
  const existing = job.audioFiles.get(index);

  if (existing) {
    try {
      await fs.access(existing);
      return existing;
    } catch {
      job.audioFiles.delete(index);
    }
  }

  const pending = job.downloads.get(index);
  if (pending) return pending;

  const task = (async () => {
    const track = job.tracks[index];

    if (!track) {
      throw new Error('Selected SoundCloud track was not found');
    }

    const sourceFile = path.join(
      job.directory,
      `source-${index}.audio`
    );

    const voiceFile = path.join(
      job.directory,
      `voice-${index}.ogg`
    );

    await downloadTrackToFile(track, sourceFile);
    await makeVoice(sourceFile, voiceFile);

    job.audioFiles.set(index, voiceFile);

    await fs.unlink(sourceFile).catch(() => {});

    return voiceFile;
  })();

  job.downloads.set(index, task);

  try {
    return await task;
  } catch (error) {
    job.downloads.delete(index);
    throw error;
  }
}

async function sendTrackArtwork(ctx, track, caption) {
  if (track?.artwork_url) {
    try {
      return await ctx.sock.sendMessage(
        ctx.jid,
        {
          image: { url: track.artwork_url },
          caption
        },
        { quoted: ctx.message }
      );
    } catch (error) {
      console.warn('[HINATA SOUNDCLOUD ARTWORK]', error);
    }
  }

  return ctx.reply(caption);
}

export function registerSoundCloudSongCommand(commands) {
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
      // البحث بصمت وإرسال رسالة النتائج فقط.

      const results = await soundcloud.search({
        query,
        type: 'tracks',
        limit: MAX_RESULTS
      });

      const tracks = (Array.isArray(results) ? results : [])
        .filter(track =>
          track?.id &&
          track?.title &&
          track?.permalink_url &&
          Number(track.duration) > 0
        )
        .slice(0, MAX_RESULTS);

      if (!tracks.length) {
        return ctx.reply(
          '❌ لم أعثر على نتائج مناسبة في SoundCloud.'
        );
      }

      directory = await fs.mkdtemp(
        path.join(os.tmpdir(), 'hinata-soundcloud-')
      );

      token = getToken();

      const job = {
        jid: ctx.jid,
        sender: ctx.senderJid,
        tracks,
        directory,
        timer: null,
        audioFiles: new Map(),
        downloads: new Map()
      };

      songJobs.set(token, job);
      scheduleCleanup(token, job);

      while (songJobs.size > MAX_JOBS) {
        const oldestToken = songJobs.keys().next().value;

        if (oldestToken === token && songJobs.size === 1) {
          break;
        }

        await removeJob(oldestToken);
      }

      const rows = tracks.map((track, index) => {
        const artist = track.user?.username || 'فنان غير معروف';
        const title = String(track.title)
          .replace(/\s+/g, ' ')
          .trim();

        return {
          title: `${index + 1}. ${title}`.slice(0, 24),
          description: `${artist} • ${formatDuration(track.duration)}`.slice(0, 72),
          id: `.اغنيه_اختيار ${token} ${index}`
        };
      });

      const { sendHinataNativeButtons } =
        await import('./native-buttons.js');

      const text = [
        '❃⋅━̊━̊━̊---━̊━̊━̊━̊❄️━̊━̊━̊━̊━̊━̊━̊⋅❃',
        '',
        '❃ الـبـحـث ˼‏📌˹ ⇣',
        '',
        `- •「 ${query} 」•`,
        '',
        '❃ عـدد الـنـتـائـج ˼‏📊˹ ⇣',
        '',
        `- •「 ${tracks.length} 」•`,
        '',
        '❃ الـتـحـمـيـل ˼‏👇˹ ⇣',
        '',
        '- •「 اخـتـر الأغـنـيـة مـن الـزر وهـتـتـحـمـل لـوحـدهـا 」•',
        '',
        '❃⋅━̊━̊━̊---━̊━̊━̊━̊❄️━̊━̊━̊━̊━̊━̊━̊⋅❃'
      ].join('\n');

      const thumbnail = tracks.find(track => track.artwork_url)?.artwork_url || null;

      await sendHinataNativeButtons(ctx.sock, ctx.jid, {
        text,
        title: '〘 نـتـائـج بـحـث SoundCloud ۪ ۫۫ 〙',
        footer: '❄️ 𝑨𝒍𝒗𝒂𝒓𝒊𝒂',
        imageUrl: thumbnail,
        buttons: [{
          type: 'single_select',
          title: '🎵 عرض الأغاني',
          sections: [{
            title: 'نتائج البحث',
            rows
          }]
        }]
      });

    } catch (error) {
      console.error('[HINATA SOUNDCLOUD SEARCH]', error);

      if (token) {
        await removeJob(token);
      } else if (directory) {
        await fs.rm(directory, {
          recursive: true,
          force: true
        }).catch(() => {});
      }

      await ctx.reply(
        '❌ تعذّر البحث في SoundCloud حاليًا.\n' +
        'حاول مرة أخرى لاحقًا.'
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

    if (!job) {
      return ctx.reply(
        '⌛ انتهت صلاحية القائمة. أرسل البحث مجددًا.'
      );
    }

    if (
      job.jid !== ctx.jid ||
      job.sender !== ctx.senderJid
    ) {
      return ctx.reply('⛔ هذا الطلب ليس خاصًا بك.');
    }

    const track = job.tracks[index];

    if (!track) {
      return ctx.reply('❌ الأغنية المختارة غير موجودة.');
    }

    try {
      const voiceFile = await prepareTrack(job, index);
      const audio = await fs.readFile(voiceFile);

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

      scheduleCleanup(token, job);

    } catch (error) {
      console.error('[HINATA SOUNDCLOUD SELECT]', error);

      await ctx.reply(
        '❌ تعذّر تجهيز أو إرسال التسجيل الصوتي.\n' +
        'قد لا يكون التدفق الصوتي متاحًا حاليًا لهذه النتيجة.'
      );
    }
  }

  const searchCommand = {
    description: 'البحث عن الأغاني في SoundCloud وإرسالها كتسجيل صوتي',
    reaction: '🎵',
    handler: searchHandler
  };

  for (const name of ['اغنيه', 'أغنية', 'اغنية']) {
    commands.set(name, searchCommand);
  }

  commands.set('اغنيه_اختيار', {
    description: 'تنزيل وإرسال الأغنية المختارة من SoundCloud',
    reaction: '🎧',
    handler: selectSongHandler
  });
}
