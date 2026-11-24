import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import SoundCloud from '@zibot/scdl';

const soundcloud = new SoundCloud({ init: true });

const songJobs = new Map();

const MAX_RESULTS = 10;
const MAX_SOURCE_SIZE = 64 * 1024 * 1024;
const MAX_AUDIO_SIZE = 15 * 1024 * 1024;
const SONG_TTL = 10 * 60 * 1000;
const MAX_JOBS = 100;

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
  job.timer = setTimeout(() => {
    if (songJobs.get(token) === job) {
      removeJob(token).catch(() => {});
    }
  }, SONG_TTL);

  job.timer.unref?.();
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
      '-ac', '1',
      '-ar', '48000',
      '-f', 'ogg',
      output
    ]);

    let stderr = '';

    child.stderr.on('data', chunk => {
      stderr += chunk.toString();

      if (stderr.length > 5000) {
        stderr = stderr.slice(-5000);
      }
    });

    child.on('error', reject);

    child.on('close', code => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(stderr || `ffmpeg exited with code ${code}`));
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
      await ctx.reply('🔎 جارٍ البحث في SoundCloud...');

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
        return ctx.reply('❌ لم أعثر على نتائج مناسبة في SoundCloud.');
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
        timer: null
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
        const title = String(track.title).replace(/\s+/g, ' ').trim();

        return {
          title: `${index + 1}. ${title}`.slice(0, 24),
          description: `${artist} • ${formatDuration(track.duration)}`.slice(0, 72),
          id: `.اغنيه_اختيار ${token} ${index}`
        };
      });

      const { sendHinataNativeButtons } =
        await import('./native-buttons.js');

      const text = [
        '╭━━〔 🌸 HINATA MUSIC 〕━━╮',
        '',
        '🎵 نتائج البحث في SoundCloud',
        `🔎 البحث: ${query}`,
        `📀 عدد النتائج: ${tracks.length}`,
        '',
        'اختر الأغنية من القائمة بالأسفل.',
        'سيتم تجهيز التسجيل بعد اختيارك.',
        '',
        '╰━━〔 HINATA BOT 〕━━╯'
      ].join('\n');

      await sendHinataNativeButtons(ctx.sock, ctx.jid, {
        text,
        title: '🎧 HINATA • SOUNDCLOUD',
        footer: '🌸 اختر الأغنية المناسبة',
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
        'قد تكون الخدمة غير متاحة مؤقتًا، حاول لاحقًا.'
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
      return ctx.reply('⌛ انتهت صلاحية القائمة. أرسل البحث مجددًا.');
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

    const title = String(track.title || 'بدون عنوان').slice(0, 150);
    const artist = String(
      track.user?.username || 'فنان غير معروف'
    ).slice(0, 100);

    const caption = [
      '╭━━〔 🌸 HINATA MUSIC 〕━━╮',
      '',
      `🎼 الأغنية: ${title}`,
      `🎤 الفنان: ${artist}`,
      `⏱️ المدة: ${formatDuration(track.duration)}`,
      '',
      '🎧 للاستماع إلى المقطع:',
      track.permalink_url,
      '',
      '╰━━〔 HINATA BOT 〕━━╯'
    ].join('\n');

    await sendTrackArtwork(ctx, track, caption);
  }

  const searchCommand = {
    description: 'البحث عن الأغاني في SoundCloud',
    reaction: '🎵',
    handler: searchHandler
  };

  for (const name of ['اغنيه', 'أغنية', 'اغنية']) {
    commands.set(name, searchCommand);
  }

  commands.set('اغنيه_اختيار', {
    description: 'اختيار أغنية من نتائج SoundCloud',
    reaction: '🎧',
    handler: selectSongHandler
  });
}
