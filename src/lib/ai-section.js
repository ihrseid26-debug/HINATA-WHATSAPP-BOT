import { runChatTask, clearChatMemory } from './chat-command.js';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const exec = promisify(execFile);

const AI_SECTION_ITEMS = [
  {
    command: 'شات',
    title: '🤖 المحادثة الذكية',
    description: 'التحدث مع مساعد ALVARIA وطرح الأسئلة والحصول على إجابات.'
  },
  {
    command: 'كتابة',
    title: '✍️ مساعد الكتابة',
    description: 'إنشاء النصوص وإعادة صياغتها.'
  },
  {
    command: 'تصحيح',
    title: '📝 تصحيح النصوص',
    description: 'تصحيح الأخطاء الإملائية والنحوية.'
  },
  {
    command: 'تلخيص',
    title: '📚 تلخيص النصوص',
    description: 'تلخيص الرسائل والنصوص.'
  },
  {
    command: 'اشرح',
    title: '💡 الشرح والتوضيح',
    description: 'شرح المواضيع والمفاهيم.'
  },
  {
    command: 'اسأل_خبير',
    title: '🎓 المساعد المتخصص',
    description: 'إجابات منظمة عن الأسئلة المتخصصة.'
  },
  {
    command: 'أفكار',
    title: '💭 توليد الأفكار',
    description: 'اقتراح أفكار جديدة ومتنوعة.'
  },
  {
    command: 'خطة',
    title: '📋 إنشاء خطة',
    description: 'إنشاء خطة منظمة لتحقيق هدف.'
  },
  {
    command: 'اختبرني',
    title: '🧠 الاختبار التعليمي',
    description: 'اختبار تعليمي بسؤال واحد في كل مرة.'
  },
  {
    command: 'اسم_مشروع',
    title: '🏷️ أسماء المشاريع',
    description: 'اقتراح أسماء مميزة للمشاريع.'
  },
  {
    command: 'صمم_شعار',
    title: '🎨 تصور تصميم شعار',
    description: 'إنشاء تصور نصي احترافي للشعار.'
  },
  {
    command: 'تحسين',
    title: '✨ تحسين الصور والفيديو',
    description: 'تحسين الوسائط محلياً وتكبير الدقة حتى 4K.'
  }
];

const SECTION_TEXT = [
  '*╭━━〔 ❄️ 𝑨𝑳𝑽𝑨𝑹𝑰𝑨 〕━━╮*',
  '',
  '*🤖 قِـسْـمُ الـذَّكَـاءِ الاصْـطِـنَـاعِـي*',
  '*『 𝑨𝑳𝑽𝑨𝑹𝑰𝑨 • 𝑨𝑰 』*',
  '',
  '*❅ دَلِـيـلُ الأَوَامِـر ❅*',
  ...AI_SECTION_ITEMS.flatMap(item => [
    `*•┆🤖〖 .${item.command} 〗*`,
    `⟞ ${item.description}`,
    ''
  ]),
  '*•┆🎨〖 .صنع_صورة 〗*',
  '⟞ إنشاء صورة من وصفك باستخدام الذكاء الاصطناعي.',
  '',
  '*•┆💡〖 .شرح_شات 〗*',
  '⟞ شرح طريقة استخدام مساعد ALVARIA الذكي.',
  '',
  '❅ اختر الأمر من القائمة التفاعلية بالأسفل.',
  '',
  '*╰━━〔 ❄️ 𝑨𝑳𝑽𝑨𝑹𝑰𝑨 • 𝑨𝑰 〕━━╯*'
].join('\n');

const CHAT_HELP_TEXT = [
  '*╭━━〔 ❄️ 𝑨𝑳𝑽𝑨𝑹𝑰𝑨 〕━━╮*',
  '',
  '*🤖 شَـرْحُ أَمْـرِ الـمُـسَـاعِـدِ الـذَّكِـي*',
  '*『 𝑨𝑳𝑽𝑨𝑹𝑰𝑨 • 𝑪𝑯𝑨𝑻 』*',
  '',
  '*•┆🤖〖 .شات 〗*',
  '⟞ التحدث مع مساعد ALVARIA الذكي وطرح الأسئلة.',
  '',
  '*❅ طريقة الاستخدام:*',
  '⟞ اكتب `.شات` ثم سؤالك.',
  '⟞ مثال: `.شات ما عاصمة اليابان؟`',
  '⟞ يمكنك الرد على رسالة وكتابة `.شات` للتعامل مع النص المقتبس.',
  '',
  '*❅ ملاحظات:*',
  '⟞ يحتفظ المساعد بسياق محادثة قصير.',
  '⟞ قد تتغير حدود الخدمة المجانية.',
  '⟞ لا ترسل كلمات مرور أو معلومات خاصة.',
  '',
  '*╰━━〔 ❄️ 𝑨𝑳𝑽𝑨𝑹𝑰𝑨 • 𝑨𝑰 〕━━╯*'
].join('\n');

function unwrapMessage(message) {
  let current = message || {};

  for (let i = 0; i < 8; i++) {
    const wrapper =
      current.ephemeralMessage ||
      current.viewOnceMessage ||
      current.viewOnceMessageV2 ||
      current.viewOnceMessageV2Extension ||
      current.documentWithCaptionMessage;

    if (!wrapper?.message) break;
    current = wrapper.message;
  }

  return current || {};
}

function getQuotedMedia(ctx) {
  const current = unwrapMessage(ctx.message?.message);

  const info =
    current.extendedTextMessage?.contextInfo ||
    current.imageMessage?.contextInfo ||
    current.videoMessage?.contextInfo;

  if (!info?.quotedMessage || !info.stanzaId) {
    return null;
  }

  const quoted = unwrapMessage(info.quotedMessage);

  if (quoted.imageMessage) {
    return {
      type: 'image',
      message: {
        key: {
          remoteJid: ctx.jid,
          id: info.stanzaId,
          participant: info.participant,
          fromMe: false
        },
        message: quoted
      }
    };
  }

  if (quoted.videoMessage) {
    return {
      type: 'video',
      message: {
        key: {
          remoteJid: ctx.jid,
          id: info.stanzaId,
          participant: info.participant,
          fromMe: false
        },
        message: quoted
      }
    };
  }

  return null;
}

const SCALE_FILTER =
  "scale='if(gte(iw,ih),min(3840,iw*2),-2)':'if(gte(iw,ih),-2,min(3840,ih*2))':flags=lanczos,unsharp=5:5:0.5:3:3:0.0";

async function enhanceMedia(buffer, type) {
  const dir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'alvaria-enhance-')
  );

  const input = path.join(
    dir,
    type === 'image' ? 'input.jpg' : 'input.mp4'
  );

  const output = path.join(
    dir,
    type === 'image' ? 'enhanced.jpg' : 'enhanced.mp4'
  );

  try {
    await fs.writeFile(input, buffer);

    const common = [
      '-y',
      '-hide_banner',
      '-loglevel', 'error',
      '-i', input,
      '-vf', SCALE_FILTER
    ];

    if (type === 'image') {
      await exec(
        'ffmpeg',
        [
          ...common,
          '-frames:v', '1',
          '-q:v', '2',
          output
        ],
        {
          timeout: 120000,
          maxBuffer: 4 * 1024 * 1024
        }
      );
    } else {
      await exec(
        'ffmpeg',
        [
          ...common,
          '-map', '0:v:0',
          '-map', '0:a?',
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-crf', '23',
          '-pix_fmt', 'yuv420p',
          '-threads', '2',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-movflags', '+faststart',
          output
        ],
        {
          timeout: 180000,
          maxBuffer: 4 * 1024 * 1024
        }
      );
    }

    const result = await fs.readFile(output);
    const maxOutput = type === 'image'
      ? 20 * 1024 * 1024
      : 64 * 1024 * 1024;

    if (!result.length) {
      throw new Error('EMPTY_OUTPUT');
    }

    if (result.length > maxOutput) {
      throw new Error('OUTPUT_TOO_LARGE');
    }

    return result;
  } finally {
    await fs.rm(dir, {
      recursive: true,
      force: true
    }).catch(() => {});
  }
}

async function enhanceCommand(ctx) {
  const selected = getQuotedMedia(ctx);

  if (!selected) {
    return ctx.reply(
      '⚠️ رد على صورة أو فيديو بالأمر `.تحسين` حتى أتمكن من تحسينه.'
    );
  }

  const maxInput = selected.type === 'image'
    ? 20 * 1024 * 1024
    : 64 * 1024 * 1024;

  try {
    await ctx.reply(
      '⏳ جارٍ تجهيز الوسائط وتحسين الجودة محلياً باستخدام FFmpeg...\n' +
      '❄️ قد تستغرق معالجة الفيديو بعض الوقت.'
    );

    const downloaded = await downloadMediaMessage(
      selected.message,
      'buffer',
      {},
      {}
    );

    const input = Buffer.from(downloaded);

    if (!input.length) {
      return ctx.reply('❌ الملف المستلم فارغ.');
    }

    if (input.length > maxInput) {
      return ctx.reply(
        selected.type === 'image'
          ? '⚠️ حجم الصورة أكبر من الحد المسموح (20MB).'
          : '⚠️ حجم الفيديو أكبر من الحد المسموح (64MB).'
      );
    }

    const enhanced = await enhanceMedia(input, selected.type);

    const caption = [
      '✨ *تم تحسين الوسائط بنجاح!*',
      '',
      '❄️ المعالجة: FFmpeg محلي',
      '🍹 تكبير الأبعاد مع تحسين الحدة',
      '📌 الحد الأقصى للضلع الأطول: 3840px',
      '',
      '_ملاحظة: تكبير الدقة لا يستعيد كل التفاصيل المفقودة من المصدر._',
      '',
      '❄️ 𝑨𝒍𝒗𝒂𝒓𝒊𝒂'
    ].join('\n');

    if (selected.type === 'image') {
      await ctx.sock.sendMessage(
        ctx.jid,
        {
          image: enhanced,
          caption
        },
        { quoted: ctx.message }
      );
    } else {
      await ctx.sock.sendMessage(
        ctx.jid,
        {
          video: enhanced,
          mimetype: 'video/mp4',
          caption
        },
        { quoted: ctx.message }
      );
    }

  } catch (error) {
    console.error('[ALVARIA MEDIA ENHANCE ERROR]', error);

    let message = '❌ تعذر تحسين الملف. حاول بملف أصغر أو أقصر.';

    if (error.message === 'OUTPUT_TOO_LARGE') {
      message = '⚠️ حجم الملف بعد التحسين تجاوز الحد المسموح للإرسال.';
    } else if (error.message === 'MEDIA_SIZE') {
      message = '⚠️ حجم الملف غير مناسب للمعالجة.';
    }

    return ctx.reply(message);
  }
}



const imageCooldown = new Map();
const activeImageRequests = new Set();

const HORDE_API = 'https://aihorde.net/api/v2';

const HORDE_HEADERS = {
  apikey: '0000000000',
  'Client-Agent': 'HINATA-WhatsApp-Bot:1.1',
  'Content-Type': 'application/json'
};

const waitForImage = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

async function translateImagePrompt(prompt) {
  try {
    const url = new URL(
      'https://translate.googleapis.com/translate_a/single'
    );

    url.searchParams.set('client', 'gtx');
    url.searchParams.set('sl', 'auto');
    url.searchParams.set('tl', 'en');
    url.searchParams.set('dt', 't');
    url.searchParams.set('q', prompt);

    const response = await fetch(url, {
      signal: AbortSignal.timeout(12000)
    });

    if (!response.ok) return prompt;

    const data = await response.json();
    const translated = Array.isArray(data?.[0])
      ? data[0].map(part => part?.[0] || '').join('').trim()
      : '';

    return translated || prompt;
  } catch {
    return prompt;
  }
}

async function getHordeImageBuffer(imageValue) {
  if (typeof imageValue !== 'string' || !imageValue.trim()) {
    throw new Error('Empty image result');
  }

  const image = imageValue.trim();
  const maxSize = 12 * 1024 * 1024;

  if (/^https:\/\//i.test(image)) {
    const response = await fetch(image, {
      signal: AbortSignal.timeout(60000)
    });

    if (!response.ok) {
      throw new Error(`Image download failed: ${response.status}`);
    }

    const contentType = String(
      response.headers.get('content-type') || ''
    ).toLowerCase();

    if (!contentType.startsWith('image/')) {
      throw new Error('Downloaded content is not an image');
    }

    if (Number(response.headers.get('content-length') || 0) > maxSize) {
      throw new Error('Image exceeds size limit');
    }

    const reader = response.body.getReader();
    const chunks = [];
    let totalSize = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalSize += value.length;

      if (totalSize > maxSize) {
        await reader.cancel();
        throw new Error('Image exceeds size limit');
      }

      chunks.push(Buffer.from(value));
    }

    return Buffer.concat(chunks);
  }

  const base64 = image.replace(
    /^data:image\/[a-zA-Z0-9.+-]+;base64,/i,
    ''
  );

  if (!/^[A-Za-z0-9+/=\s]+$/.test(base64)) {
    throw new Error('Unsupported image result format');
  }

  const buffer = Buffer.from(base64, 'base64');

  if (!buffer.length || buffer.length > maxSize) {
    throw new Error('Invalid image size');
  }

  return buffer;
}


class ImageProviderError extends Error {
  constructor(message, fallbackAllowed = true) {
    super(message);
    this.name = 'ImageProviderError';
    this.fallbackAllowed = fallbackAllowed;
  }
}

const GEMINI_IMAGE_MODEL = 'gemini-nano-banana-2.1';
const GEMINI_INTERACTIONS_API =
  'https://generativelanguage.googleapis.com/v1beta/interactions';

async function generateGeminiImageBuffer(prompt) {
  const apiKey = String(
    process.env.GEMINI_API_KEY || ''
  ).trim();

  if (!apiKey) {
    throw new ImageProviderError('GEMINI_KEY_MISSING', true);
  }

  let response;

  try {
    response = await fetch(GEMINI_INTERACTIONS_API, {
      method: 'POST',
      headers: {
        'x-goog-api-key': apiKey,
        'Content-Type': 'application/json',
        'Api-Revision': '2026-05-20'
      },
      body: JSON.stringify({
        model: GEMINI_IMAGE_MODEL,
        input: [
          {
            type: 'text',
            text:
              'Create one high-quality image based on this description. ' +
              'Follow the requested subject, composition, colors and style. ' +
              'Do not add unrelated elements.\n\n' +
              'Image description: ' + prompt
          }
        ],
        response_format: {
          type: 'image',
          mime_type: 'image/jpeg',
          aspect_ratio: '1:1',
          image_size: '1K'
        }
      }),
      signal: AbortSignal.timeout(180000)
    });
  } catch (error) {
    throw new ImageProviderError(
      error?.name === 'TimeoutError'
        ? 'GEMINI_TIMEOUT'
        : 'GEMINI_NETWORK_ERROR',
      true
    );
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const status = response.status;

    const temporary =
      status === 408 ||
      status === 429 ||
      status === 500 ||
      status === 502 ||
      status === 503 ||
      status === 504;

    const reason = String(
      data?.error?.message || 'Gemini request failed'
    ).slice(0, 300);

    throw new ImageProviderError(
      `GEMINI_HTTP_${status}: ${reason}`,
      temporary
    );
  }

  let generated = data?.output_image;

  if (!generated?.data && Array.isArray(data?.steps)) {
    for (const step of data.steps) {
      const imagePart = Array.isArray(step?.content)
        ? step.content.find(part => part?.type === 'image' && part?.data)
        : null;

      if (imagePart) {
        generated = imagePart;
        break;
      }
    }
  }

  if (!generated?.data) {
    // لا نحاول تجاوز رفض المحتوى بإرساله إلى مزود آخر.
    throw new ImageProviderError(
      'GEMINI_RETURNED_NO_IMAGE',
      false
    );
  }

  const base64 = String(generated.data).trim();

  if (
    !base64 ||
    !/^[A-Za-z0-9+/=\s]+$/.test(base64)
  ) {
    throw new ImageProviderError(
      'GEMINI_INVALID_IMAGE_DATA',
      false
    );
  }

  const buffer = Buffer.from(base64, 'base64');

  if (!buffer.length || buffer.length > 20 * 1024 * 1024) {
    throw new ImageProviderError(
      'GEMINI_IMAGE_SIZE_INVALID',
      false
    );
  }

  const mimeType = String(
    generated.mime_type || 'image/jpeg'
  ).toLowerCase();

  if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
    throw new ImageProviderError(
      'GEMINI_UNSUPPORTED_IMAGE_TYPE',
      false
    );
  }

  return {
    buffer,
    mimeType
  };
}

async function generateHordeImageBuffer(prompt) {
  const translatedPrompt = await translateImagePrompt(prompt);

  const submitResponse = await fetch(
    `${HORDE_API}/generate/async`,
    {
      method: 'POST',
      headers: HORDE_HEADERS,
      body: JSON.stringify({
        prompt:
          translatedPrompt +
          ', high quality, detailed scene, clear composition, ' +
          'professional lighting, sharp focus, faithful to the description' +
          '### blurry, low quality, distorted objects, text, watermark',
        params: {
          n: 1,
          width: 512,
          height: 512,
          steps: 20
        },
        allow_downgrade: true,
        nsfw: false,
        censor_nsfw: true,
        r2: true
      }),
      signal: AbortSignal.timeout(60000)
    }
  );

  const submitted = await submitResponse.json().catch(() => ({}));

  if (!submitResponse.ok || !submitted.id) {
    throw new Error(`HORDE_SUBMIT_FAILED_${submitResponse.status}`);
  }

  const requestId = submitted.id;
  const deadline = Date.now() + 8 * 60 * 1000;
  let completed = false;
  let lastProgressMessage = Date.now();

  while (Date.now() < deadline) {
    await waitForImage(5000);

    const checkResponse = await fetch(
      `${HORDE_API}/generate/check/${encodeURIComponent(requestId)}`,
      {
        headers: HORDE_HEADERS,
        signal: AbortSignal.timeout(30000)
      }
    );

    if (!checkResponse.ok) {
      throw new Error(`HORDE_CHECK_FAILED_${checkResponse.status}`);
    }

    const check = await checkResponse.json();

    if (check.faulted) {
      throw new Error('HORDE_GENERATION_FAULTED');
    }

    if (check.is_possible === false) {
      throw new Error('HORDE_NO_AVAILABLE_WORKERS');
    }

    if (
      check.done === true ||
      Number(check.finished || 0) >= 1
    ) {
      completed = true;
      break;
    }

    if (Date.now() - lastProgressMessage >= 120000) {
      lastProgressMessage = Date.now();

      const position = Number(check.queue_position || 0);

      await ctx.reply(
        position > 0
          ? `⏳ ما زال الطلب ينتظر دوره لدى AI Horde. ترتيبه التقريبي: ${position}`
          : '⏳ ما زالت الصورة قيد الإنشاء.'
      ).catch(() => {});
    }
  }

  if (!completed) {
    await fetch(
      `${HORDE_API}/generate/status/${encodeURIComponent(requestId)}`,
      {
        method: 'DELETE',
        headers: HORDE_HEADERS,
        signal: AbortSignal.timeout(8000)
      }
    ).catch(() => {});

    throw new Error('HORDE_GENERATION_TIMEOUT');
  }

  const statusResponse = await fetch(
    `${HORDE_API}/generate/status/${encodeURIComponent(requestId)}`,
    {
      headers: HORDE_HEADERS,
      signal: AbortSignal.timeout(30000)
    }
  );

  if (!statusResponse.ok) {
    throw new Error(`HORDE_STATUS_FAILED_${statusResponse.status}`);
  }

  const status = await statusResponse.json();
  const imageValue = status?.generations?.[0]?.img;

  if (!imageValue) {
    throw new Error('HORDE_NO_IMAGE_RETURNED');
  }

  return {
    buffer: await getHordeImageBuffer(imageValue),
    mimeType: 'image/jpeg'
  };
}

async function generateImageCommand(ctx) {
  const prompt = String(ctx.text || '').trim();

  if (!prompt) {
    return ctx.reply(
      '🎨 اكتب وصف الصورة بعد الأمر.\n\n' +
      'مثال:\n.صنع_صورة قطة بيضاء في حديقة بأسلوب كرتوني'
    );
  }

  if (prompt.length > 1500) {
    return ctx.reply('⚠️ اختصر الوصف إلى 1500 حرف أو أقل.');
  }

  const userId = String(ctx.senderJid || ctx.jid);
  const now = Date.now();
  const previous = imageCooldown.get(userId) || 0;

  if (now - previous < 30000) {
    return ctx.reply('⏳ انتظر قليلاً قبل طلب صورة جديدة.');
  }

  if (activeImageRequests.has(userId)) {
    return ctx.reply('⏳ لديك طلب صورة قيد التنفيذ بالفعل.');
  }

  imageCooldown.set(userId, now);
  activeImageRequests.add(userId);

  try {
    await ctx.reply(
      '*❃⋅━̊━̊━̊---━̊━̊━̊━̊❄️━̊━̊━̊━̊━̊━̊━̊⋅❃*\n\n' +
      '┏━━━━━━━━━━━━━━━━━━━━━━┓\n' +
      '❃ *_🎨 جــاري إنــشــاء صــورتــك..._*\n' +
      '┗━━━━━━━━━━━━━━━━━━━━━━┛\n\n' +
      '*❃⋅━̊━̊━̊---━̊━̊━̊━̊❄️━̊━̊━̊━̊━̊━̊━̊⋅❃*\n\n' +
      '`❄️ 𝑨𝒍𝒗𝒂𝒓𝒊𝒂`'
    );

    let result;
    let provider = 'Gemini';

    try {
      result = await generateGeminiImageBuffer(prompt);
    } catch (geminiError) {
      console.warn(
        '[HINATA GEMINI IMAGE FALLBACK]',
        String(geminiError?.message || 'Unknown error').slice(0, 350)
      );

      if (!geminiError?.fallbackAllowed) {
        throw geminiError;
      }

      provider = 'AI Horde';

      await ctx.reply(
        '⏳ Gemini غير متاح مؤقتاً. ' +
        'جارٍ تجربة مزود الصور الاحتياطي AI Horde...'
      );

      result = await generateHordeImageBuffer(prompt);
    }

    if (!result?.buffer?.length) {
      throw new Error('EMPTY_GENERATED_IMAGE');
    }

    await ctx.sock.sendMessage(
      ctx.jid,
      {
        image: result.buffer,
        mimetype: result.mimeType || 'image/jpeg',
        caption:
          '🎨 تم إنشاء صورتك بنجاح!\n' +
          '🤖 مزود الصور: ' + provider + '\n' +
          '❄️ HINATA AI'
      },
      { quoted: ctx.message }
    );

  } catch (error) {
    console.error(
      '[HINATA IMAGE GENERATION ERROR]',
      String(error?.message || 'Unknown error').slice(0, 500)
    );

    const errorText = String(error?.message || '');

    let message =
      '❌ تعذر إنشاء الصورة حالياً. حاول مرة أخرى لاحقاً.';

    if (errorText.includes('GEMINI_HTTP_401')) {
      message =
        '🔑 مفتاح Gemini غير مقبول. تحقق من المفتاح وإعدادات المشروع.';
    } else if (errorText.includes('GEMINI_HTTP_403')) {
      message =
        '🔒 مشروع Gemini لا يملك صلاحية استخدام النموذج حالياً.';
    } else if (errorText.includes('GEMINI_HTTP_429')) {
      message =
        '⏳ انتهت حصة Gemini المتاحة حالياً، وتعذر إكمال الطلب عبر المزود الاحتياطي.';
    } else if (errorText.includes('GEMINI_RETURNED_NO_IMAGE')) {
      message =
        '⚠️ لم يُرجع Gemini صورة لهذا الطلب. جرّب وصفاً آخر.';
    } else if (errorText.includes('HORDE_NO_AVAILABLE_WORKERS')) {
      message =
        '⏳ Gemini غير متاح حالياً، ولا توجد أجهزة AI Horde متاحة. حاول لاحقاً.';
    } else if (errorText.includes('HORDE_GENERATION_TIMEOUT')) {
      message =
        '⌛ استغرق إنشاء الصورة وقتاً أطول من المسموح. حاول لاحقاً.';
    }

    await ctx.reply(message).catch(() => {});
  } finally {
    activeImageRequests.delete(userId);
  }
}

async function sendAISection(ctx) {
  const text = SECTION_TEXT;

  try {
    const { sendHinataNativeButtons } =
      await import('./native-buttons.js');

    let imageBuffer = null;

    try {
      const { getSubbotSectionImage } =
        await import('./subbot-section-images.js');

      imageBuffer = await getSubbotSectionImage(
        ctx,
        'الذكاء الاصطناعي'
      );
    } catch (error) {
      console.error('[ALVARIA AI SECTION IMAGE ERROR]', error);
    }

    return await sendHinataNativeButtons(ctx.sock, ctx.jid, {
      imageBuffer,
      text,
      title: '❄️ 𝑨𝒍𝒗𝒂𝒓𝒊𝒂',
      footer: '❄️ 𝑨𝑳𝑽𝑨𝑹𝑰𝑨 • 𝑨𝑰',
      buttons: [
        {
          type: 'single_select',
          title: '🤖 اختيار أمر الذكاء الاصطناعي',
          sections: [
            {
              title: '❄️ أوامر الذكاء الاصطناعي',
              rows: [
                ...AI_SECTION_ITEMS.map(item => ({
                  title: item.title,
                  id: `.${item.command}`,
                  description: item.description
                })),
                {
                  title: '🤖 شرح أمر الشات',
                  id: '.شرح_شات',
                  description: 'شرح طريقة استخدام المساعد الذكي'
                },
                {
                  title: '↩️ رجوع للقائمة الرئيسية',
                  id: '.اوامر',
                  description: 'العودة إلى قائمة ALVARIA الرئيسية'
                }
              ]
            }
          ]
        }
      ]
    });
  } catch (error) {
    console.error('[ALVARIA AI SECTION BUTTONS ERROR]', error);
    return ctx.reply(text);
  }
}

export function registerAISectionCommands(commands) {
  if (!(commands instanceof Map)) {
    throw new TypeError('AI section requires a Map registry');
  }

  if (!commands.has('شات')) {
    throw new Error(
      'AI section cannot register: command شات is not registered'
    );
  }

  for (const name of [
    'قسم_الذكاء',
    'شرح_شات',
    'تحسين',
    'كتابة',
    'تصحيح',
    'تلخيص',
    'اشرح',
    'اسأل_خبير',
    'أفكار',
    'خطة',
    'اختبرني',
    'اسم_مشروع',
    'صمم_شعار',
    'مسح_ذاكرة'
  ]) {
    if (commands.has(name)) {
      throw new Error(`AI section command already exists: ${name}`);
    }
  }

  commands.set('قسم_الذكاء', {
    description: 'قسم الذكاء الاصطناعي',
    reaction: '🤖',
    handler: sendAISection
  });

  commands.set('شرح_شات', {
    description: 'شرح استخدام مساعد الشات',
    reaction: '💡',
    handler: async ctx => ctx.reply(CHAT_HELP_TEXT)
  });

  commands.set('تحسين', {
    description: 'تحسين جودة صورة أو فيديو بالمعالجة المحلية',
    reaction: '✨',
    handler: enhanceCommand
  });


  // HINATA AI shared text tasks.
  commands.set('كتابة', {
    description: 'مساعد الكتابة',
    reaction: '🤖',
    handler: ctx => runChatTask(
      ctx, 'كتابة', 'مساعد الكتابة',
      'اكتب النص المطلوب أو أعد صياغته مع مراعاة النبرة والجمهور.'
    )
  });

  commands.set('تصحيح', {
    description: 'تصحيح النصوص',
    reaction: '🤖',
    handler: ctx => runChatTask(
      ctx, 'تصحيح', 'تصحيح النصوص',
      'صحح الأخطاء الإملائية والنحوية وعلامات الترقيم مع الحفاظ على المعنى.'
    )
  });

  commands.set('تلخيص', {
    description: 'تلخيص النصوص',
    reaction: '🤖',
    handler: ctx => runChatTask(
      ctx, 'تلخيص', 'تلخيص النصوص',
      'لخص المحتوى واستخرج أهم الأفكار دون اختلاق معلومات.'
    )
  });

  commands.set('اشرح', {
    description: 'الشرح والتوضيح',
    reaction: '🤖',
    handler: ctx => runChatTask(
      ctx, 'اشرح', 'الشرح والتوضيح',
      'اشرح الموضوع بوضوح وبالتدريج مع أمثلة مناسبة.'
    )
  });

  commands.set('اسأل_خبير', {
    description: 'المساعد المتخصص',
    reaction: '🤖',
    handler: ctx => runChatTask(
      ctx, 'اسأل_خبير', 'المساعد المتخصص',
      'قدم إجابة منظمة ومتعمقة، ووضح حدود معرفتك عند الحاجة.'
    )
  });

  commands.set('أفكار', {
    description: 'توليد الأفكار',
    reaction: '🤖',
    handler: ctx => runChatTask(
      ctx, 'أفكار', 'توليد الأفكار',
      'اقترح أفكاراً متنوعة وقابلة للتطوير واشرح فائدتها.'
    )
  });

  commands.set('خطة', {
    description: 'إنشاء خطة',
    reaction: '🤖',
    handler: ctx => runChatTask(
      ctx, 'خطة', 'إنشاء خطة',
      'حوّل الهدف إلى خطة واضحة بمراحل وخطوات وأولويات واقعية.'
    )
  });

  commands.set('اختبرني', {
    description: 'الاختبار التعليمي',
    reaction: '🤖',
    handler: ctx => runChatTask(
      ctx, 'اختبرني', 'الاختبار التعليمي',
      'أنشئ اختباراً تفاعلياً بسؤال واحد في كل مرة وانتظر إجابة المستخدم ثم قيّمها.'
    )
  });

  commands.set('اسم_مشروع', {
    description: 'اقتراح أسماء المشاريع',
    reaction: '🤖',
    handler: ctx => runChatTask(
      ctx, 'اسم_مشروع', 'اقتراح أسماء المشاريع',
      'اقترح أسماء مميزة للمشروع واشرح معنى كل اسم.'
    )
  });

  commands.set('صمم_شعار', {
    description: 'تصور تصميم الشعار',
    reaction: '🤖',
    handler: ctx => runChatTask(
      ctx, 'صمم_شعار', 'تصور تصميم الشعار',
      'أنشئ وصفاً نصياً احترافياً للشعار يتضمن الفكرة والألوان والرموز والخطوط. لا تدّع إنشاء صورة فعلية.'
    )
  });

  commands.set('مسح_ذاكرة', {
    description: 'مسح ذاكرة محادثتك مع المساعد',
    reaction: '🧹',
    handler: async ctx => {
      const removed = clearChatMemory(ctx);

      await ctx.reply(
        removed
          ? '🧹 تم مسح ذاكرة محادثتك مع المساعد في هذه المجموعة.'
          : 'ℹ️ لا توجد ذاكرة محادثة محفوظة لمسحها.'
      );
    }
  });

  // أمر مستقل، غير مضاف إلى الأزرار التفاعلية.
  commands.set('صنع_صورة', {
    description: 'إنشاء صورة من وصف نصي عبر AI Horde',
    reaction: '🎨',
    handler: generateImageCommand
  });
}
