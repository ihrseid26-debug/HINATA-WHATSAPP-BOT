import { PinterestClient } from 'pinterest-unofficial';

const REQUEST_TIMEOUT = 15000;
const MAX_IMAGE_SIZE = 12 * 1024 * 1024;

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

function detectImageType(buffer) {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return 'image/jpeg';
  }

  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
    )
  ) {
    return 'image/png';
  }

  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }

  return null;
}

async function downloadPinterestImage(url) {
  if (!url || !/^https?:\/\//i.test(url)) {
    throw new Error('رابط الصورة غير صالح');
  }

  const response = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36',
      Accept: 'image/avif,image/webp,image/png,image/jpeg,*/*'
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT)
  });

  if (!response.ok) {
    throw new Error(`Pinterest image HTTP ${response.status}`);
  }

  const declaredLength = Number(response.headers.get('content-length') || 0);

  if (declaredLength > MAX_IMAGE_SIZE) {
    throw new Error('حجم الصورة كبير جدًا');
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  if (!buffer.length || buffer.length > MAX_IMAGE_SIZE) {
    throw new Error('الصورة فارغة أو حجمها غير مناسب');
  }

  const mimetype = detectImageType(buffer);

  if (!mimetype) {
    throw new Error('صيغة الصورة غير مدعومة');
  }

  return { buffer, mimetype };
}

async function sendReply(ctx, text) {
  if (typeof ctx.reply === 'function') {
    return ctx.reply(text);
  }

  return ctx.sock.sendMessage(ctx.jid, { text });
}

async function sendOneImage(ctx, pin, image) {
  const title = String(pin?.title || 'Pinterest Image')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);

  const caption = [
    '🌸 𝑨𝒍𝒗𝒂𝒓𝒊𝒂 • 𝑷𝑰𝑵𝑻𝑬𝑹𝑬𝑺𝑻',
    '',
    `🖼️ ${title || 'صورة من Pinterest'}`,
    '',
    '╰━━━〔 🌸 ALVARIA 〕━━━╯'
  ].join('\n');

  const options = {};

  if (ctx.message) {
    options.quoted = ctx.message;
  }

  return ctx.sock.sendMessage(
    ctx.jid,
    {
      image: image.buffer,
      mimetype: image.mimetype,
      caption
    },
    options
  );
}

export function registerPinterestImageCommands(commands) {
  const handler = async ctx => {
    const query = String(
      ctx.args?.join(' ') ||
      ctx.query ||
      ctx.text ||
      ''
    ).trim();

    if (!query) {
      return sendReply(
        ctx,
        '🖼️ اكتب اسم الصورة التي تريد البحث عنها.\n\nمثال:\n.صورة Hinata Hyuga'
      );
    }

    try {
      await sendReply(ctx, '🔎 جاري البحث عن صورة...');

      const client = await getPinterest();

      const result = await client.search.searchPins({
        query,
        pageSize: 8
      });

      const pins = result?.data?.results || [];
      const pin = pins.find(item => getPinImage(item));

      if (!pin) {
        return sendReply(ctx, '❌ لم أجد صورة لهذا البحث، جرّب اسمًا آخر.');
      }

      const imageUrl = getPinImage(pin);
      const image = await downloadPinterestImage(imageUrl);

      await sendOneImage(ctx, pin, image);

      console.log(`[HINATA PINTEREST] Sent one image: ${query}`);
    } catch (error) {
      console.error('[ALVARIA PINTEREST ERROR]', error);

      await sendReply(
        ctx,
        '❌ تعذّر إرسال الصورة حاليًا.\nجرّب البحث مرة أخرى بعد قليل.'
      ).catch(() => {});
    }
  };

  commands.set('صورة', {
    description: 'البحث عن صورة واحدة في Pinterest',
    handler,
    reaction: '🖼️'
  });

  commands.set('صوره', {
    description: 'البحث عن صورة واحدة في Pinterest',
    handler,
    reaction: '🖼️'
  });
}
