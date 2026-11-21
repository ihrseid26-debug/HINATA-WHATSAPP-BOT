/**
 * HINATA MANHWA V2
 * MangaDex metadata + interactive chapter selection.
 * Chapter page redistribution is not implemented.
 */

import { sendHinataNativeButtons } from './native-buttons.js';

const API = 'https://api.mangadex.org';
const COVER = 'https://uploads.mangadex.org/covers';

const HEADERS = {
  'User-Agent': 'ALVARIA-WhatsApp-Bot/2.0',
  Accept: 'application/json'
};

const MAX_COVER_SIZE = 8 * 1024 * 1024;
const PAGE_SIZE = 8;
const SESSION_TTL = 30 * 60 * 1000;

const sessions = new Map();

function clean(value = '') {
  return String(value)
    .replace(/[\u0000-\u001F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getTitle(attributes = {}) {
  const titles = attributes.title || {};

  return clean(
    titles.ar ||
    titles.en ||
    titles.ko ||
    Object.values(titles)[0] ||
    'بدون اسم'
  );
}

function getDescription(attributes = {}) {
  const descriptions = attributes.description || {};

  return clean(
    descriptions.ar ||
    descriptions.en ||
    Object.values(descriptions)[0] ||
    'لا توجد نبذة متاحة.'
  );
}

function translateStatus(status) {
  const values = {
    ongoing: 'مستمرة',
    completed: 'مكتملة',
    hiatus: 'متوقفة مؤقتًا',
    cancelled: 'ملغاة'
  };

  return values[status] || status || 'غير معروف';
}

function getTags(attributes = {}) {
  return (attributes.tags || [])
    .map(tag =>
      tag.attributes?.name?.ar ||
      tag.attributes?.name?.en
    )
    .filter(Boolean)
    .slice(0, 6)
    .join('، ') || 'غير محدد';
}

async function requestJSON(url) {
  const response = await fetch(url, {
    headers: HEADERS,
    signal: AbortSignal.timeout(15000)
  });

  if (!response.ok) {
    throw new Error(`MangaDex HTTP ${response.status}`);
  }

  return response.json();
}

async function searchManga(query) {
  const params = new URLSearchParams();

  params.set('title', query);
  params.set('limit', '5');
  params.set('includes[]', 'cover_art');
  params.append('contentRating[]', 'safe');

  return requestJSON(`${API}/manga?${params}`);
}

async function getChapters(mangaId, offset = 0) {
  const params = new URLSearchParams();

  params.set('limit', String(PAGE_SIZE));
  params.set('offset', String(offset));
  params.set('order[chapter]', 'desc');

  params.append('translatedLanguage[]', 'ar');
  params.append('translatedLanguage[]', 'en');

  return requestJSON(
    `${API}/manga/${encodeURIComponent(mangaId)}/feed?${params}`
  );
}

async function getCover(mangaId, relationships) {
  const cover = relationships?.find(
    item => item.type === 'cover_art'
  );

  const filename = cover?.attributes?.fileName;

  if (!filename) return null;

  const url =
    `${COVER}/${encodeURIComponent(mangaId)}/` +
    `${encodeURIComponent(filename)}.256.jpg`;

  const response = await fetch(url, {
    headers: HEADERS,
    signal: AbortSignal.timeout(15000)
  });

  if (!response.ok) return null;

  const length = Number(
    response.headers.get('content-length') || 0
  );

  if (length > MAX_COVER_SIZE) {
    throw new Error('حجم الغلاف أكبر من الحد المسموح.');
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  if (!buffer.length || buffer.length > MAX_COVER_SIZE) {
    return null;
  }

  return buffer;
}

function getSessionKey(ctx) {
  return `${ctx.jid}:${ctx.senderJid || 'unknown'}`;
}

function saveSession(ctx, data) {
  const key = getSessionKey(ctx);

  sessions.set(key, {
    ...data,
    updatedAt: Date.now()
  });
}

function getSession(ctx) {
  const session = sessions.get(getSessionKey(ctx));

  if (!session) return null;

  if (Date.now() - session.updatedAt > SESSION_TTL) {
    sessions.delete(getSessionKey(ctx));
    return null;
  }

  session.updatedAt = Date.now();

  return session;
}

function getInput(ctx) {
  if (typeof ctx.text === 'string' && ctx.text.trim()) {
    return clean(ctx.text);
  }

  if (Array.isArray(ctx.args)) {
    return clean(ctx.args.join(' '));
  }

  if (typeof ctx.args === 'string') {
    return clean(ctx.args);
  }

  return '';
}

function getAction(ctx) {
  const input = getInput(ctx);
  const parts = input.split(/\s+/);

  return {
    action: (parts.shift() || '').toLowerCase(),
    value: parts.join(' ').trim()
  };
}

async function sendText(ctx, text) {
  return ctx.sock.sendMessage(ctx.jid, { text });
}

async function sendInteractive(ctx, options) {
  return sendHinataNativeButtons(
    ctx.sock,
    ctx.jid,
    options
  );
}

function chapterDescription(chapter) {
  const a = chapter.attributes || {};

  const number = clean(a.chapter || '?');
  const title = clean(a.title || '');

  const language =
    a.translatedLanguage === 'ar'
      ? 'عربي'
      : a.translatedLanguage === 'en'
        ? 'إنجليزي'
        : a.translatedLanguage || 'غير معروف';

  return {
    number,
    title,
    language
  };
}

function chapterRows(chapters, startIndex) {
  return chapters.map((chapter, index) => {
    const info = chapterDescription(chapter);

    return {
      title: `الفصل ${info.number}`.slice(0, 24),
      description:
        `${info.title ? info.title + ' - ' : ''}${info.language}`.slice(0, 72),
      id: `.مانهوا فصل ${index}`
    };
  });
}

async function showChapterMenu(ctx, offset = 0) {
  const session = getSession(ctx);

  if (!session) {
    return sendText(
      ctx,
      '⌛ انتهت جلسة المانهوا.\nابحث عنها من جديد باستخدام .مانهوا'
    );
  }

  const result = await getChapters(session.mangaId, offset);
  const chapters = result?.data || [];

  if (!chapters.length) {
    return sendText(
      ctx,
      '📚 لا توجد فصول أخرى في هذه الصفحة من الفهرس.'
    );
  }

  session.chapters = chapters;
  session.offset = offset;
  session.updatedAt = Date.now();

  const rows = chapterRows(chapters, offset);

  if (result.total > offset + chapters.length) {
    rows.push({
      title: 'المزيد من الفصول',
      description: 'عرض الصفحة التالية من الفصول',
      id: '.مانهوا المزيد'
    });
  }

  await sendInteractive(ctx, {
    title: '🌸 ALVARIA MANHWA',
    text: [
      '╭━━━〔 📚 اختيار الفصل 〕━━━╮',
      '',
      `📖 ${session.title}`,
      '',
      'اختر الفصل الذي تريد تحديده:',
      '',
      `📄 الصفحة: ${Math.floor(offset / PAGE_SIZE) + 1}`,
      '',
      '🌸 ALVARIA BOT'
    ].join('\n'),
    footer: 'ALVARIA MANHWA',
    buttons: [
      {
        type: 'single_select',
        title: '📚 اختيار الفصل',
        sections: [
          {
            title: 'الفصول المتاحة',
            rows
          }
        ]
      }
    ]
  });
}

async function showSelectedChapter(ctx, index) {
  const session = getSession(ctx);

  if (!session) {
    return sendText(
      ctx,
      '⌛ انتهت الجلسة. ابحث عن المانهوا مرة أخرى.'
    );
  }

  const chapter = session.chapters?.[index];

  if (!chapter) {
    return sendText(
      ctx,
      '❌ هذا الفصل لم يعد متاحًا في القائمة. افتح قائمة الفصول مجددًا.'
    );
  }

  const info = chapterDescription(chapter);

  session.selectedChapter = {
    id: chapter.id,
    number: info.number,
    title: info.title,
    language: info.language
  };

  session.updatedAt = Date.now();

  await sendInteractive(ctx, {
    title: '🌸 ALVARIA MANHWA',
    text: [
      '╭━━━〔 📖 الفصل المحدد 〕━━━╮',
      '',
      `📚 المانهوا: ${session.title}`,
      `📄 الفصل: ${info.number}`,
      `📝 العنوان: ${info.title || 'بدون عنوان'}`,
      `🌐 اللغة: ${info.language}`,
      '',
      '━━━━━━━━━━━━━━━━',
      'هذا الفصل تم اختياره بنجاح.',
      '',
      'مصدر صفحات القراءة غير مربوط حاليًا.',
      'يمكنك العودة إلى قائمة الفصول.',
      '',
      '🌸 ALVARIA BOT'
    ].join('\n'),
    footer: 'ALVARIA MANHWA',
    buttons: [
      {
        type: 'quick_reply',
        text: '⏭️ إكمال الفصل',
        id: '.مانهوا اكمل'
      },
      {
        type: 'quick_reply',
        text: '🔙 العودة للفصول',
        id: '.مانهوا فصول'
      }
    ]
  });
}

async function continueChapter(ctx) {
  const session = getSession(ctx);

  if (!session?.selectedChapter) {
    return sendText(
      ctx,
      '❌ اختر فصلًا أولًا من قائمة الفصول.'
    );
  }

  await sendText(
    ctx,
    [
      '🌸 ALVARIA MANHWA',
      '',
      `📖 ${session.title}`,
      `📄 الفصل ${session.selectedChapter.number}`,
      '',
      '⏳ واجهة تقسيم الصور جاهزة.',
      'لكن لا يوجد حاليًا مصدر صفحات مصرح بإعادة نشرها.',
      '',
      'عند ربط مصدر مناسب ستظهر هنا:',
      '• الدفعة الأولى: 8 صور.',
      '• زر إكمال الفصل.',
      '• الدفعات التالية حتى نهاية الفصل.',
      '',
      '🔙 استخدم زر العودة للفصول للمتابعة.'
    ].join('\n')
  );

  await sendInteractive(ctx, {
    title: '🌸 ALVARIA MANHWA',
    text: 'ماذا تريد أن تفعل الآن؟',
    buttons: [
      {
        type: 'quick_reply',
        text: '🔙 العودة للفصول',
        id: '.مانهوا فصول'
      }
    ]
  });
}

async function showManhwa(ctx) {
  const input = getInput(ctx);
  const { action, value } = getAction(ctx);

  // أزرار التفاعل
  if (action === 'فصول') {
    return showChapterMenu(ctx, 0);
  }

  if (action === 'فصل') {
    const index = Number(value);

    if (!Number.isInteger(index) || index < 0) {
      return sendText(ctx, '❌ اختيار الفصل غير صالح.');
    }

    return showSelectedChapter(ctx, index);
  }

  if (action === 'المزيد') {
    const session = getSession(ctx);

    if (!session) {
      return sendText(ctx, '⌛ انتهت جلسة البحث.');
    }

    return showChapterMenu(
      ctx,
      session.offset + PAGE_SIZE
    );
  }

  if (action === 'اكمل') {
    return continueChapter(ctx);
  }

  // بحث جديد
  let query = input;

  if (action && action !== 'مانهوا' && action !== 'مانجا') {
    query = input;
  } else {
    query = value;
  }

  query = clean(
    query.replace(/^\.?(?:مانهوا|مانجا)\s*/i, '')
  );

  if (!query) {
    return sendText(
      ctx,
      '🌸 طريقة الاستخدام:\n\n.مانهوا اسم المانهوا\n\nمثال:\n.مانهوا Solo Leveling'
    );
  }

  if (query.length > 100) {
    return sendText(ctx, '❌ اسم البحث طويل جدًا.');
  }

  await sendText(
    ctx,
    `🔎 جاري البحث عن: ${query}\n\n⏳ انتظر قليلًا...`
  );

  try {
    const result = await searchManga(query);
    const manga = result?.data?.[0];

    if (!manga) {
      return sendText(
        ctx,
        '❌ لم أجد هذه المانهوا في قاعدة البيانات.\nجرب الاسم الإنجليزي.'
      );
    }

    const a = manga.attributes || {};

    const title = getTitle(a);
    const description = getDescription(a);
    const status = translateStatus(a.status);
    const tags = getTags(a);
    const year = a.year || 'غير معروف';

    saveSession(ctx, {
      mangaId: manga.id,
      title,
      chapters: [],
      offset: 0,
      selectedChapter: null
    });

    let cover = null;

    try {
      cover = await getCover(
        manga.id,
        manga.relationships
      );
    } catch (error) {
      console.error('[ALVARIA MANHWA COVER]', error);
    }

    const caption = [
      '*╭━━━━━━━〔 🍁 𝑨𝒍𝒗𝒂𝒓𝒊𝒂 🍁 〕━━━━━━━╮*',
      '',
      '*┏━━━━━━━━━━━━━━━━━━━━━━┓*',
      '',
      '*╭━━━〔 🌸 𝐇𝐈𝐍𝐀𝐓𝐀 𝐌𝐀𝐍𝐇𝐖𝐀 〕━━━╮*',
      '',
      '📖 *_الاسم:_* ' + title,
      '📅 *_السنة:_* ' + year,
      '📌 *_الحالة:_* ' + status,
      '🏷️ *_التصنيف:_* ' + tags,
      '',
      '*┏━━━〔 📝 𝐍𝐎𝐓𝐄 〕━━━┓*',
      '',
      description.slice(0, 700),
      '',
      '*┗━━━━━━━━━━━━━━━━━━━━┛*',
      '',
      '━━━━━━━━━━━━━━━━━━━━',
      '',
      '📚 *_اختر الفصل من القائمة أدناه_*',
      '',
      '🌐 *_المصدر:_* MangaDex',
      '',
      '*╰━━━━━━━〔 🍁 𝑨𝒍𝒗𝒂𝒓𝒊𝒂 🍁 〕━━━━━━━╯*',
      '',
      '*🍁 𝑴𝑨𝑫𝑬 𝑩𝒀 𝑨𝒍𝒗𝒂𝒓𝒊𝒂 🍁*'
    ].join('\n');

    const buttons = [
      {
        type: 'single_select',
        title: '📚 اختيار الفصل',
        sections: [
          {
            title: '🌸 ALVARIA MANHWA',
            rows: [
              {
                title: '📖 عرض الفصول المتاحة',
                description: 'اضغط هنا لفتح قائمة الفصول',
                id: '.مانهوا فصول'
              }
            ]
          }
        ]
      }
    ];

    try {
      await sendInteractive(ctx, {
        title: '🍁 𝑨𝒍𝒗𝒂𝒓𝒊𝒂 🍁',
        text: caption,
        footer: '🌸 𝐇𝐈𝐍𝐀𝐓𝐀 𝐌𝐀𝐍𝐇𝐖𝐀',
        buttons,
        imageBuffer: cover
      });
    } catch (buttonError) {
      console.error(
        '[ALVARIA MANHWA BUTTON FALLBACK]',
        buttonError
      );

      if (cover) {
        await ctx.sock.sendMessage(ctx.jid, {
          image: cover,
          caption
        });
      } else {
        await sendText(ctx, caption);
      }

      await sendInteractive(ctx, {
        title: '🌸 ALVARIA MANHWA',
        text: 'اختر الفصل لعرض قائمة الفصول.',
        buttons
      });
    }

  } catch (error) {
    console.error('[ALVARIA MANHWA]', error);

    await sendText(
      ctx,
      '❌ حدث خطأ أثناء البحث عن المانهوا.\nحاول مرة أخرى لاحقًا.'
    );
  }
}

export function registerManhwaCommands(coreCommands) {
  const command = {
    description: 'البحث عن المانهوا واختيار الفصول تفاعليًا',
    reaction: '📚',
    handler: showManhwa
  };

  coreCommands.set('مانهوا', command);
  coreCommands.set('مانجا', command);
}
