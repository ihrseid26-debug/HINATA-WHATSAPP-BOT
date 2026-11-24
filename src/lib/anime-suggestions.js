// HINATA ANIME SUGGESTIONS V1
// Random anime recommendations using Jikan API.

const API_BASE = 'https://api.jikan.moe/v4';
const recentAnimeIds = new Set();
const MAX_RECENT = 40;

function clean(value, fallback = 'غير متوفر') {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value).replace(/\s+/g, ' ').trim();
}

function shorten(value, max = 420) {
  const text = clean(value, 'لا تتوفر نبذة عن هذا الأنمي حالياً.');
  return text.length > max ? `${text.slice(0, max - 1).trim()}…` : text;
}

function formatDate(value) {
  if (!value) return 'غير محدد';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return clean(value);
  return new Intl.DateTimeFormat('ar', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC'
  }).format(date);
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(15000)
  });

  if (!response.ok) {
    throw new Error(`JIKAN_HTTP_${response.status}`);
  }

  return response.json();
}

async function getRandomAnime() {
  // نختار صفحة عشوائية من قائمة الأنميات ذات التصنيف المناسب.
  const page = Math.floor(Math.random() * 35) + 1;
  const url = new URL(`${API_BASE}/anime`);

  url.searchParams.set('sfw', 'true');
  url.searchParams.set('rating', 'pg13');
  url.searchParams.set('limit', '25');
  url.searchParams.set('page', String(page));
  url.searchParams.set('order_by', 'popularity');
  url.searchParams.set('sort', 'asc');

  const result = await fetchJson(url.toString());
  const entries = Array.isArray(result?.data) ? result.data : [];

  if (!entries.length) {
    throw new Error('NO_ANIME_RESULTS');
  }

  const available = entries.filter(item =>
    item?.mal_id && !recentAnimeIds.has(item.mal_id)
  );

  const pool = available.length ? available : entries;
  const anime = pool[Math.floor(Math.random() * pool.length)];

  recentAnimeIds.add(anime.mal_id);

  while (recentAnimeIds.size > MAX_RECENT) {
    recentAnimeIds.delete(recentAnimeIds.values().next().value);
  }

  return anime;
}

async function downloadCover(anime) {
  const imageUrl =
    anime?.images?.webp?.large_image_url ||
    anime?.images?.jpg?.large_image_url ||
    anime?.images?.jpg?.image_url;

  if (!imageUrl || !/^https:\/\//i.test(imageUrl)) {
    throw new Error('NO_COVER_IMAGE');
  }

  const response = await fetch(imageUrl, {
    signal: AbortSignal.timeout(15000)
  });

  if (!response.ok) throw new Error('COVER_DOWNLOAD_FAILED');

  const contentLength = Number(response.headers.get('content-length') || 0);
  if (contentLength > 8 * 1024 * 1024) {
    throw new Error('COVER_TOO_LARGE');
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  if (!buffer.length || buffer.length > 8 * 1024 * 1024) {
    throw new Error('INVALID_COVER');
  }

  return buffer;
}

function buildCaption(anime) {
  const title = clean(anime.title);
  const english = anime.title_english
    ? `🌐 الاسم الإنجليزي: ${clean(anime.title_english)}\n`
    : '';
  const japanese = anime.title_japanese
    ? `🇯🇵 الاسم الياباني: ${clean(anime.title_japanese)}\n`
    : '';

  const genres = (anime.genres || [])
    .map(item => item.name)
    .filter(Boolean)
    .slice(0, 6)
    .join(' • ') || 'غير محدد';

  const studios = (anime.studios || [])
    .map(item => item.name)
    .filter(Boolean)
    .slice(0, 3)
    .join(' • ') || 'غير محدد';

  const score = Number(anime.score);
  const rating = Number.isFinite(score) && score > 0
    ? `⭐ التقييم: ${score}/10 (${Number(anime.scored_by || 0).toLocaleString('en-US')} تقييم)`
    : '⭐ التقييم: لا تتوفر بيانات كافية';

  const episodes = anime.episodes
    ? `${anime.episodes} حلقة`
    : 'غير محدد';

  const status = clean(anime.status);
  const type = clean(anime.type);
  const aired = anime.aired || {};
  const startDate = formatDate(aired.from);
  const endDate = aired.to ? formatDate(aired.to) : 'غير محدد';

  const synopsis = shorten(anime.synopsis);

  return [
    '╭━━〔 🌸 HINATA • ANIME 〕━━╮',
    '',
    `🎬 ${title}`,
    english + japanese,
    `📅 بداية العرض: ${startDate}`,
    `🏁 نهاية العرض: ${endDate}`,
    `📺 النوع: ${type}`,
    `📌 الحالة: ${status}`,
    `🎞️ الحلقات: ${episodes}`,
    rating,
    `🎭 التصنيفات: ${genres}`,
    `🏢 الاستوديو: ${studios}`,
    '',
    '📖 نبذة القصة:',
    synopsis,
    '',
    `🔗 صفحة الأنمي: ${clean(anime.url, '')}`,
    '',
    '╰━━〔 ❄️ HINATA BOT 〕━━╯'
  ].join('\n').slice(0, 1020);
}

export function registerAnimeSuggestionCommands(commands) {
  commands.set('اقتراح_انمي', {
    description: 'اقتراح أنمي عشوائي مع صورة الغلاف والتقييم والتفاصيل',
    reaction: '🌸',
    handler: async ctx => {
      try {
        const anime = await getRandomAnime();
        const cover = await downloadCover(anime);
        const caption = buildCaption(anime);

        await ctx.sock.sendMessage(
          ctx.jid,
          {
            image: cover,
            caption,
          },
          { quoted: ctx.message }
        );
      } catch (error) {
        console.error('[HINATA ANIME SUGGESTION]', error);

        const message = error?.message || '';

        if (message.includes('JIKAN_HTTP_429')) {
          return ctx.reply('⏳ خدمة اقتراح الأنمي مزدحمة الآن، حاول بعد قليل.');
        }

        if (message.includes('JIKAN_HTTP_')) {
          return ctx.reply('⚠️ خدمة معلومات الأنمي لا تستجيب حالياً، حاول لاحقاً.');
        }

        return ctx.reply('⚠️ تعذّر جلب اقتراح الأنمي أو صورة الغلاف. حاول مرة أخرى بعد قليل.');
      }
    }
  });
}
