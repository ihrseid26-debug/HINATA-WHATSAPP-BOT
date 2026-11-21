import { PinterestClient } from 'pinterest-unofficial';
import { Jimp } from 'jimp';
import { randomInt } from 'node:crypto';
import { sendHinataNativeButtons } from './native-buttons.js';

const TIMEOUT = 15000;
const MAX_SIZE = 12 * 1024 * 1024;
const SIDE = 512;
const GAP = 6;

let client;
let bootstrapPromise;

const recentImages = new Set();
const MAX_RECENT = 80;

const TYPES = {
  'تطقيم_ولد_بنت': {
    label: '👦 ولد × 👧 بنت',
    first: 'safe for work anime boy matching profile picture aesthetic',
    second: 'safe for work anime girl matching profile picture aesthetic'
  },
  'تطقيم_ولد_ولد': {
    label: '👦 ولد × 👦 ولد',
    first: 'safe for work anime boy matching profile picture aesthetic',
    second: 'safe for work anime boy profile picture different character aesthetic'
  },
  'تطقيم_بنت_بنت': {
    label: '👧 بنت × 👧 بنت',
    first: 'safe for work anime girl matching profile picture aesthetic',
    second: 'safe for work anime girl profile picture different character aesthetic'
  }
};

async function getPinterest() {
  if (!client) client = new PinterestClient();

  if (!bootstrapPromise) {
    bootstrapPromise = client.bootstrap().catch(error => {
      client = null;
      bootstrapPromise = null;
      throw error;
    });
  }

  await bootstrapPromise;
  return client;
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

function getPinKey(pin) {
  return String(pin?.id || getPinImage(pin) || '');
}

function rememberImage(key) {
  if (!key) return;

  recentImages.add(key);

  while (recentImages.size > MAX_RECENT) {
    recentImages.delete(recentImages.values().next().value);
  }
}

async function searchPins(query, excluded = new Set()) {
  const pinterest = await getPinterest();

  const gender = /\bboy\b/i.test(query) ? 'boy' : 'girl';

  const queries = [
    query,
    'anime ' + gender + ' profile picture',
    gender + ' anime pfp aesthetic',
    'anime ' + gender + ' aesthetic',
    'anime ' + gender
  ];

  for (const searchQuery of [...new Set(queries)]) {
    try {
      console.log('[ALVARIA COUPLE SEARCH]', searchQuery);

      const result = await pinterest.search.searchPins({
        query: searchQuery,
        pageSize: 20
      });

      const pins = Array.isArray(result?.data?.results)
        ? result.data.results
        : [];

      const valid = pins.filter(pin => {
        const image = getPinImage(pin);
        const key = getPinKey(pin);

        return image && key && !excluded.has(key);
      });

      console.log(
        '[ALVARIA COUPLE RESULTS]',
        searchQuery,
        'total:', pins.length,
        'valid:', valid.length
      );

      if (!valid.length) continue;

      const fresh = valid.filter(pin => !recentImages.has(getPinKey(pin)));
      const pool = fresh.length ? fresh : valid;
      const pin = pool[randomInt(pool.length)];

      rememberImage(getPinKey(pin));
      return pin;
    } catch (error) {
      console.error(
        '[ALVARIA COUPLE SEARCH ERROR]',
        searchQuery,
        error.message
      );
    }
  }

  throw new Error('لم يتم العثور على صور بعد تجربة عبارات البحث البديلة');
}
function detectImageType(buffer) {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) return 'image/jpeg';

  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
    )
  ) return 'image/png';

  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) return 'image/webp';

  return null;
}

async function downloadImage(url) {
  if (!url || !/^https?:\/\//i.test(url)) {
    throw new Error('رابط الصورة غير صالح');
  }

  const response = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36',
      Accept: 'image/webp,image/png,image/jpeg,*/*'
    },
    signal: AbortSignal.timeout(TIMEOUT)
  });

  if (!response.ok) {
    throw new Error(`Image HTTP ${response.status}`);
  }

  const declaredLength = Number(
    response.headers.get('content-length') || 0
  );

  if (declaredLength > MAX_SIZE) {
    throw new Error('حجم الصورة كبير');
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  if (!buffer.length || buffer.length > MAX_SIZE) {
    throw new Error('حجم الصورة غير مناسب');
  }

  const mimetype = detectImageType(buffer);

  if (!mimetype) {
    throw new Error('نوع الصورة غير مدعوم');
  }

  return buffer;
}

async function makeCombinedImage(firstBuffer, secondBuffer) {
  const first = await Jimp.read(firstBuffer);
  const second = await Jimp.read(secondBuffer);

  // توحيد أبعاد الصورتين مع المحافظة على تناسبهما.
  first.cover({ w: SIDE - GAP, h: SIDE });
  second.cover({ w: SIDE - GAP, h: SIDE });

  const output = new Jimp({
    width: SIDE * 2,
    height: SIDE,
    color: 0xff202020
  });

  output.composite(first, 0, 0);
  output.composite(second, SIDE + GAP, 0);

  return output.getBuffer('image/png');
}

async function reply(ctx, message) {
  if (typeof ctx.reply === 'function') {
    return ctx.reply(message);
  }

  return ctx.sock.sendMessage(ctx.jid, { text: message });
}

async function showMenu(ctx) {
  return sendHinataNativeButtons(ctx.sock, ctx.jid, {
    title: '🌸 𝑨𝒍𝒗𝒂𝒓𝒊𝒂',
    text:
      '╭━━━〔 💞 𝑨𝑵𝑰𝑴𝑬 𝑴𝑨𝑻𝑪𝑯 〕━━━╮\n\n' +
      'اختر نوع التطقيم الذي تريده:\n\n' +
      '🌸 سيبحث ALVARIA عن شخصيتين مختلفتين ويجمعهما في صورة واحدة.\n\n' +
      '╰━━━━━━〔 🍁 ALVARIA 〕━━━━━━╯',
    footer: '🍁 MADE BY ALVARIA',
    buttons: [{
      type: 'single_select',
      title: '💞 اختيار التطقيم',
      sections: [{
        title: '🌸 أنواع تطقيم الأنمي',
        rows: [
          {
            title: '👦 ولد × 👧 بنت',
            description: 'شخصيتان مختلفتان من الأنمي',
            id: '.تطقيم_ولد_بنت'
          },
          {
            title: '👦 ولد × 👦 ولد',
            description: 'تطقيم شخصيتين ولد',
            id: '.تطقيم_ولد_ولد'
          },
          {
            title: '👧 بنت × 👧 بنت',
            description: 'تطقيم شخصيتين بنت',
            id: '.تطقيم_بنت_بنت'
          }
        ]
      }]
    }]
  });
}

async function sendCouple(ctx, type) {
  const config = TYPES[type];

  if (!config) return showMenu(ctx);

  try {
    await reply(
      ctx,
      `🔎 جاري تجهيز تطقيم جديد...\n${config.label}\n\n🌸 انتظر قليلًا.`
    );

    // البحث عن صورتين مستقلتين.
    const firstPin = await searchPins(config.first);
    const secondPin = await searchPins(
      config.second,
      new Set([getPinKey(firstPin)])
    );

    const firstUrl = getPinImage(firstPin);
    const secondUrl = getPinImage(secondPin);

    if (!firstUrl || !secondUrl || firstUrl === secondUrl) {
      throw new Error('تعذر العثور على صورتين مختلفتين');
    }

    const [firstBuffer, secondBuffer] = await Promise.all([
      downloadImage(firstUrl),
      downloadImage(secondUrl)
    ]);

    const combined = await makeCombinedImage(
      firstBuffer,
      secondBuffer
    );

    const caption = [
      '╭━━━〔 🌸 𝑨𝒍𝒗𝒂𝒓𝒊𝒂 〕━━━╮',
      '',
      '💞 *تطقيم أنمي جديد!*',
      `🎀 *النوع:* ${config.label}`,
      '',
      '📸 صورتان في صورة واحدة',
      '✨ استمتع بتطقيمك الجديد',
      '',
      '╰━━━〔 🍁 𝐇𝐈𝐍𝐀𝐓𝐀 〕━━━╯',
      '',
      '🍁 *MADE BY ALVARIA*'
    ].join('\n');

    const options = {};

    if (ctx.message) {
      options.quoted = ctx.message;
    }

    await ctx.sock.sendMessage(
      ctx.jid,
      {
        image: combined,
        mimetype: 'image/png',
        caption
      },
      options
    );

    console.log(`[HINATA COUPLE] Sent: ${type}`);
  } catch (error) {
    console.error('[ALVARIA COUPLE ERROR]', error);

    await reply(
      ctx,
      '❌ لم أستطع تجهيز التطقيم الآن.\nحاول مرة أخرى بعد قليل.'
    ).catch(() => {});
  }
}

export function registerCoupleIconCommands(commands) {
  commands.set('تطقيم', {
    description: 'اختيار تطقيم أنمي من قائمة تفاعلية',
    reaction: '💞',
    handler: showMenu
  });

  commands.set('تطقيم_ولد_بنت', {
    description: 'تطقيم أنمي ولد وبنت',
    reaction: '💞',
    handler: ctx => sendCouple(ctx, 'تطقيم_ولد_بنت')
  });

  commands.set('تطقيم_ولد_ولد', {
    description: 'تطقيم أنمي ولدين',
    reaction: '💞',
    handler: ctx => sendCouple(ctx, 'تطقيم_ولد_ولد')
  });

  commands.set('تطقيم_بنت_بنت', {
    description: 'تطقيم أنمي بنتين',
    reaction: '💞',
    handler: ctx => sendCouple(ctx, 'تطقيم_بنت_بنت')
  });
}
