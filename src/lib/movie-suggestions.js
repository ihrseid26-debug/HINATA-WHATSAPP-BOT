// HINATA MOVIE SUGGESTIONS V1
// Random movie recommendations using StreamX API.

const API_BASE = 'https://api.streamx.qzz.io';
const recentMovieIds = new Set();
const MAX_RECENT = 40;

function clean(value, fallback = 'غير متوفر') {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value).replace(/\s+/g, ' ').trim();
}

function shorten(value, max = 380) {
  const text = clean(value, 'لا تتوفر نبذة عن هذا الفيلم حالياً.');
  return text.length > max ? `${text.slice(0, max - 1).trim()}…` : text;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(18000)
  });

  if (!response.ok) {
    throw new Error(`STREAMX_HTTP_${response.status}`);
  }

  return response.json();
}

function isMatureTitle(meta, scores) {
  const certification = [
    meta?.facts?.certification,
    meta?.contentRating,
    scores?.metacritic?.contentRating
  ].filter(Boolean).join(' ').toUpperCase();

  if (/\b(NC-17|TV-MA|XXX|ADULT|18\+)\b/.test(certification)) {
    return true;
  }

  const genres = (meta?.genres || []).join(' ').toLowerCase();
  return /\b(porn|adult|erotica)\b/.test(genres);
}

async function getRandomMovie() {
  // نحاول اختيار فيلم مختلف عن الاقتراحات الأخيرة.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const skip = Math.floor(Math.random() * 400);
    const catalog = await fetchJson(
      `${API_BASE}/catalog/movie/top?skip=${skip}`
    );

    const entries = Array.isArray(catalog?.metas)
      ? catalog.metas
      : [];

    if (!entries.length) continue;

    const available = entries.filter(item =>
      item?.id &&
      /^tt\d+$/i.test(item.id) &&
      !recentMovieIds.has(item.id)
    );

    const pool = available.length ? available : entries.filter(item =>
      item?.id && /^tt\d+$/i.test(item.id)
    );

    if (!pool.length) continue;

    const selected = pool[Math.floor(Math.random() * pool.length)];

    const [detailsResult, scoresResult] = await Promise.allSettled([
      fetchJson(`${API_BASE}/meta/movie/${encodeURIComponent(selected.id)}`),
      fetchJson(`${API_BASE}/scores/movie/${encodeURIComponent(selected.id)}`)
    ]);

    const meta = detailsResult.status === 'fulfilled'
      ? (detailsResult.value?.meta || detailsResult.value)
      : selected;

    const scores = scoresResult.status === 'fulfilled'
      ? scoresResult.value
      : null;

    if (!meta || isMatureTitle(meta, scores)) {
      continue;
    }

    const movie = { ...selected, ...meta };

    if (!movie.id) movie.id = selected.id;

    recentMovieIds.add(movie.id);
    while (recentMovieIds.size > MAX_RECENT) {
      recentMovieIds.delete(recentMovieIds.values().next().value);
    }

    return { movie, scores };
  }

  throw new Error('NO_SUITABLE_MOVIE');
}

async function downloadPoster(movie) {
  const posterUrl =
    movie?.images?.poster?.large ||
    movie?.images?.poster?.medium ||
    movie?.poster;

  if (!posterUrl || !/^https:\/\//i.test(posterUrl)) {
    throw new Error('NO_MOVIE_POSTER');
  }

  const response = await fetch(posterUrl, {
    signal: AbortSignal.timeout(18000)
  });

  if (!response.ok) throw new Error('POSTER_DOWNLOAD_FAILED');

  const contentLength = Number(response.headers.get('content-length') || 0);
  if (contentLength > 8 * 1024 * 1024) {
    throw new Error('POSTER_TOO_LARGE');
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  if (!buffer.length || buffer.length > 8 * 1024 * 1024) {
    throw new Error('INVALID_POSTER');
  }

  return {
    buffer,
    mimetype: response.headers.get('content-type')?.split(';')[0] || 'image/jpeg'
  };
}

function buildCaption(movie, scores) {
  const title = clean(movie.name || movie.title);
  const year = movie.year ||
    movie.releaseInfo?.match(/\d{4}/)?.[0] ||
    movie.released?.slice?.(0, 4) ||
    'غير محدد';

  const genres = Array.isArray(movie.genres)
    ? movie.genres.slice(0, 6).join(' • ')
    : 'غير محدد';

  const directors = movie.facts?.directors;
  const directorText = Array.isArray(directors)
    ? directors.map(item => typeof item === 'string' ? item : item?.name)
        .filter(Boolean).slice(0, 3).join(' • ')
    : clean(movie.director);

  const rating = scores?.imdb?.rating || movie.imdbRating;
  const ratingText = rating
    ? `⭐ تقييم IMDb: ${rating}/10`
    : '⭐ التقييم: غير متوفر';

  const runtime = movie.facts?.runtimeMinutes || movie.runtimeMinutes;
  const runtimeText = runtime
    ? `${runtime} دقيقة`
    : clean(movie.runtime);

  const releaseDate = movie.released
    ? clean(movie.released)
    : clean(movie.releaseInfo, String(year));

  const countries = movie.facts?.countries;
  const countryText = Array.isArray(countries)
    ? countries.slice(0, 4).join(' • ')
    : clean(movie.country);

  const languages = movie.facts?.languages;
  const languageText = Array.isArray(languages)
    ? languages.slice(0, 4).join(' • ')
    : clean(movie.language);

  const cast = Array.isArray(movie.cast)
    ? movie.cast.slice(0, 5).map(item =>
        typeof item === 'string' ? item : item?.name
      ).filter(Boolean).join(' • ')
    : '';

  const synopsis = shorten(
    movie.description ||
    movie.wiki?.extract ||
    movie.overview
  );

  const imdbUrl = movie.id
    ? `https://www.imdb.com/title/${movie.id}/`
    : '';

  return [
    '╭━━〔 🎬 HINATA • MOVIE 〕━━╮',
    '',
    `🎞️ ${title}`,
    `📅 سنة الإصدار: ${year}`,
    `🗓️ تاريخ الإصدار: ${releaseDate}`,
    `⏱️ المدة: ${runtimeText}`,
    `⭐ ${ratingText}`,
    `🎭 التصنيفات: ${genres}`,
    `🌍 الدولة: ${countryText}`,
    `🗣️ اللغة: ${languageText}`,
    `🎬 المخرج: ${directorText}`,
    cast ? `👥 أبرز الممثلين: ${cast}` : '',
    '',
    '📖 قصة الفيلم:',
    synopsis,
    '',
    imdbUrl ? `🔗 التفاصيل: ${imdbUrl}` : '',
    '',
    '╰━━〔 ❄️ HINATA BOT 〕━━╯'
  ].filter(Boolean).join('\n').slice(0, 1020);
}

export function registerMovieSuggestionCommands(commands) {
  commands.set('اقتراح_فيلم', {
    description: 'اقتراح فيلم عشوائي مع البوستر والتقييم والتفاصيل',
    reaction: '🎬',
    handler: async ctx => {
      try {
        const { movie, scores } = await getRandomMovie();
        const poster = await downloadPoster(movie);
        const caption = buildCaption(movie, scores);

        await ctx.sock.sendMessage(
          ctx.jid,
          {
            image: poster.buffer,
            caption,
            mimetype: poster.mimetype
          },
          { quoted: ctx.message }
        );
      } catch (error) {
        console.error('[HINATA MOVIE SUGGESTION]', error);

        const message = error?.message || '';

        if (message.includes('STREAMX_HTTP_429')) {
          return ctx.reply('⏳ خدمة الأفلام مزدحمة الآن، حاول بعد قليل.');
        }

        if (message.includes('STREAMX_HTTP_')) {
          return ctx.reply('⚠️ خدمة معلومات الأفلام لا تستجيب حالياً.');
        }

        return ctx.reply(
          '⚠️ تعذّر جلب اقتراح الفيلم أو صورة البوستر. حاول مرة أخرى لاحقاً.'
        );
      }
    }
  });
}
