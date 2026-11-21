import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const MAX_SIZE = 15 * 1024 * 1024;

function ffmpeg(input, output) {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-i', input,
      '-vn',
      '-c:a', 'libopus',
      '-b:a', '64k',
      '-ac', '1',
      '-ar', '48000',
      '-f', 'ogg',
      output
    ]);

    let error = '';
    p.stderr.on('data', d => error += d.toString());
    p.on('error', reject);
    p.on('close', code => {
      code === 0 ? resolve() : reject(new Error(error));
    });
  });
}

export async function sendMusicVoice(ctx, source) {
  let dir;

  try {
    if (!/^https?:\/\//i.test(source)) {
      throw new Error('مصدر الصوت غير صالح');
    }

    dir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'hinata-music-')
    );

    const input = path.join(dir, 'input.audio');
    const output = path.join(dir, 'voice.ogg');

    const response = await fetch(source, {
      signal: AbortSignal.timeout(30000)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || '';

    if (!contentType.startsWith('audio/')) {
      throw new Error('المصدر لا يعيد ملفًا صوتيًا');
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    if (!buffer.length || buffer.length > MAX_SIZE) {
      throw new Error('حجم الملف غير صالح');
    }

    await fs.writeFile(input, buffer);
    await ffmpeg(input, output);

    const audio = await fs.readFile(output);

    await ctx.sock.sendMessage(ctx.jid, {
      audio,
      mimetype: 'audio/ogg; codecs=opus',
      ptt: true
    }, {
      quoted: ctx.message
    });

    return true;
  } finally {
    if (dir) {
      await fs.rm(dir, {
        recursive: true,
        force: true
      }).catch(() => {});
    }
  }
}
