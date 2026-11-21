import { normalizeText } from '../text.js';

const DIRECT_ADDRESS = /^(?:يا\s*)?(?:ألفاريا|الفاريا|alvaria|هيناتا|hinata)(?=$|[\s،,:؛!؟.!-])[\s،,:؛!؟-]*/iu;

const SYNONYMS = [
  { words: ['روابط', 'الرابط', 'لينكات', 'لينك', 'بغيت نحبس الروابط', 'ما تخليش الروابط', 'link', 'links'], commands: ['قفل_الروابط', 'تفعيل_الروابط'] },
  { words: ['جهات الاتصال', 'جهات_الاتصال', 'كونتاكت', 'contacts'], commands: ['قفل_جهات_الاتصال', 'تفعيل_جهات_الاتصال'] },
  { words: ['ارقام', 'أرقام', 'numbers'], commands: ['قفل_الأرقام', 'تفعيل_الأرقام'] },
  { words: ['تكرار', 'سبام', 'إزعاج', 'كيعاود', 'كيكرر', 'spam'], commands: ['قفل_التكرار', 'تفعيل_التكرار'] },
  { words: ['منشن', 'اشارة', 'إشارة', 'mention'], commands: ['قفل_المنشن', 'تفعيل_المنشن'] },
  { words: ['وسائط', 'صور', 'تصاور', 'فيديوهات', 'فيديو', 'media'], commands: ['قفل_الوسائط', 'تفعيل_الوسائط'] },
  { words: ['ترحيب', 'يرحب', 'welcome'], commands: ['ترحيب_تشغيل', 'ترحيب_إيقاف'] },
  { words: ['وداع', 'يودع', 'goodbye'], commands: ['وداع_تشغيل', 'وداع_إيقاف'] }
];

function tokenize(value) {
  return normalizeText(value)
    .replace(/[ـ]/g, '')
    .replace(/[^\p{L}\p{N}_\s]/gu, ' ')
    .split(/\s+/u)
    .filter(word => word.length > 1);
}

function findSuggestions(text, commands, prefix) {
  const normalized = normalizeText(text);
  const words = new Set(tokenize(text));
  const candidates = [];

  for (const [name, command] of commands) {
    const searchable = normalizeText(`${name} ${command.description || ''}`);
    const commandWords = tokenize(searchable);
    let score = 0;

    if (normalized.includes(normalizeText(name).replace(/_/g, ' '))) {
      score += 8;
    }

    for (const word of commandWords) {
      if (words.has(word)) score += 2;
    }

    for (const group of SYNONYMS) {
      if (!group.words.some(word => normalized.includes(normalizeText(word)))) {
        continue;
      }

      if (group.commands.includes(name)) score += 7;
    }

    if (score > 0) {
      candidates.push({
        name,
        description: command.description || 'أمر من أوامر ALVARIA',
        score
      });
    }
  }

  return candidates
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, 3)
    .map(item => `• ${prefix}${item.name}\n  ${item.description}`);
}


export function extractDirectRequest(text) {
  const input = String(text ?? '').trim();
  const match = input.match(DIRECT_ADDRESS);
  if (!match) return null;
  return input.slice(match[0].length).trim();
}

export function answerLocalMessage(text, commands, prefix = '.', context = []) {
  const input = String(text ?? '').trim();
  const match = input.match(DIRECT_ADDRESS);

  if (!match) return null;

  const request = input.slice(match[0].length).trim();

  if (!request) {
    return 'أهلًا! 🍹 أنا ALVARIA. اكتب طلبك بعد اسمي وسأحاول مساعدتك.';
  }

  const normalized = normalizeText(request);

  if (/^(مرحبا|مرحباً|السلام عليكم|سلام|اهلا|أهلا|hi|hello)$/iu.test(normalized)) {
    return 'أهلًا بك! 🍹 كيف أقدر أساعدك في أوامر ALVARIA؟';
  }

  // نستفيد من سياق المستخدم السابق عند صياغة طلب متابعة.
  const previousContext = Array.isArray(context)
    ? context.slice(-4).join(' ')
    : '';
  const searchableRequest = `${previousContext} ${request}`.trim();
  const suggestions = findSuggestions(searchableRequest, commands, prefix);

  if (!suggestions.length) {
    return [
      '❄️ فهمت أنك تطلب المساعدة، لكن لم أجد أمرًا مطابقًا بثقة في قائمة ALVARIA الحالية.',
      'جرّب وصف المطلوب بكلمات أخرى، أو اكتب .اوامر لعرض الأوامر المتاحة.',
      '',
      'ملاحظة: أنا أعمل محليًا، ولا أنفّذ أي إجراء إداري تلقائيًا.'
    ].join('\n');
  }

  return [
    '❄️ أعتقد أن هذه الأوامر قد تساعدك:',
    '',
    ...suggestions,
    '',
    'هذه اقتراحات فقط؛ لم أنفّذ أي أمر.'
  ].join('\n');
}
