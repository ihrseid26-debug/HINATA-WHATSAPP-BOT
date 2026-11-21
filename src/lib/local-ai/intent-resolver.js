import { normalizeText } from '../text.js';

function clean(value) {
  return normalizeText(value)
    .replace(/[ـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/[،,:؛!؟.!]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findExistingCommand(commands, wanted) {
  const target = clean(wanted);

  for (const name of commands.keys()) {
    if (clean(name) === target) return name;
  }

  return null;
}

function makeParsed(name, commands) {
  const actualName = findExistingCommand(commands, name);
  if (!actualName) return null;

  return {
    name: actualName,
    args: [],
    text: '',
    rawName: actualName,
    source: 'natural'
  };
}

const ADDRESS = /^(?:(?:يا\s*)?(?:ألفاريا|الفاريا|alvaria|هيناتا|hinata))(?:\s+|[,،:؛!؟.-]\s*)/iu;

const GROUP_WORDS =
  '(?:القروب|الكروب|الجروب|المجموعه|المجموعة|قروب|كروب|جروب|المجموعات|القروبات)';

const LOCK_WORDS =
  '(?:اقفل|اقفلي|اغلق|اغلقي|سكر|سكري|امنع|امني|حظري|احظري|اقفليها|اقفلها)';

const OPEN_WORDS =
  '(?:افتح|افتحي|حل|حلي|اسمح|اسمحي|الغ|الغي|فك|فكي)';

const FEATURES = [
  {
    words: '(?:الروابط|رابط|اللينكات|لينكات)',
    enable: 'قفل_الروابط',
    disable: 'تفعيل_الروابط'
  },
  {
    words: '(?:جهات الاتصال|جهات الاتصال|جهات_الاتصال|الكونتاكت|الكونتاكات|ارقام جهات الاتصال)',
    enable: 'قفل_جهات_الاتصال',
    disable: 'تفعيل_جهات_الاتصال'
  },
  {
    words: '(?:الارقام|الأرقام|رقم الهاتف|ارقام الهاتف)',
    enable: 'قفل_الأرقام',
    disable: 'تفعيل_الأرقام'
  },
  {
    words: '(?:التكرار|السبام|الرسائل المكرره|الرسائل المتكرره)',
    enable: 'قفل_التكرار',
    disable: 'تفعيل_التكرار'
  },
  {
    words: '(?:المنشن|الاشارات|الاشارة|الاشارات الجماعيه|المنشنات)',
    enable: 'قفل_المنشن',
    disable: 'تفعيل_المنشن'
  },
  {
    words: '(?:اعادة التوجيه|المعاد توجيهها|الفوروارد|الرسائل المحوله)',
    enable: 'قفل_المعاد_توجيهها',
    disable: 'تفعيل_المعاد_توجيهها'
  },
  {
    words: '(?:الوسائط|الصور والفيديوهات|الصور|الفيديوهات|الملفات)',
    enable: 'قفل_الوسائط',
    disable: 'تفعيل_الوسائط'
  },
  {
    words: '(?:الملصقات|الستيكرات|الاستيكرات)',
    enable: 'قفل_الملصقات',
    disable: 'تفعيل_الملصقات'
  },
  {
    words: '(?:البوتات|الاجهزه المرتبطه|الاجهزة المرتبطة)',
    enable: 'قفل_البوتات',
    disable: 'تفعيل_البوتات'
  }
];

function resolveFeatureIntent(text) {
  for (const feature of FEATURES) {
    const words = feature.words;

    const enablePattern = new RegExp(
      `(?:فعلي|شغلي|شغل|اقفلي|اقفل|امنع|امني|حظري|احظري)\\s+(?:مضاد\\s+)?${words}|(?:فعلي|شغلي|شغل)\\s+الحمايه\\s+(?:من\\s+)?${words}`,
      'u'
    );

    const disablePattern = new RegExp(
      `(?:عطلي|اوقفي|وقفي|افتحي|افتح|اسمحي|الغ|الغي|فكي)\\s+(?:مضاد\\s+)?${words}|(?:عطلي|اوقفي|وقفي)\\s+الحمايه\\s+(?:من\\s+)?${words}`,
      'u'
    );

    if (enablePattern.test(text)) return feature.enable;
    if (disablePattern.test(text)) return feature.disable;
  }

  return null;
}

function resolveWelcomeGoodbye(text) {
  const welcome = '(?:الترحيب|ترحيب|رسائل الترحيب|رساله الترحيب)';
  const goodbye = '(?:الوداع|وداع|رسائل الوداع|رساله الوداع)';

  if (
    new RegExp(`(?:شغلي|فعلي|فعّل|شغل|ابدئي)\\s+${welcome}`, 'u').test(text)
  ) return 'تشغيل_الترحيب';

  if (
    new RegExp(`(?:اوقفي|عطلي|وقفي|الغ|الغي)\\s+${welcome}`, 'u').test(text)
  ) return 'إيقاف_الترحيب';

  if (
    new RegExp(`(?:شغلي|فعلي|فعّل|شغل|ابدئي)\\s+${goodbye}`, 'u').test(text)
  ) return 'تشغيل_الوداع';

  if (
    new RegExp(`(?:اوقفي|عطلي|وقفي|الغ|الغي)\\s+${goodbye}`, 'u').test(text)
  ) return 'إيقاف_الوداع';

  return null;
}

function resolveGroupIntent(text) {
  const group = GROUP_WORDS;

  const lock = new RegExp(
    `(?:${LOCK_WORDS})\\s+(?:ال)?${group}|(?:امنع|امني)\\s+(?:الاعضاء\\s+من\\s+)?الكتابه\\s+(?:في\\s+)?(?:ال)?${group}`,
    'u'
  );

  const open = new RegExp(
    `(?:${OPEN_WORDS})\\s+(?:ال)?${group}|(?:اسمح|اسمحي)\\s+للاعضاء\\s+بالكتابه\\s+(?:في\\s+)?(?:ال)?${group}`,
    'u'
  );

  if (lock.test(text)) return 'قفل';
  if (open.test(text)) return 'فتح';

  return null;
}

const SAFE_INTENTS = [
  {
    names: ['اوامر', 'الأوامر', 'قائمة الأوامر', 'قائمة الاوامر', 'اعرضي الاوامر', 'وريني الاوامر'],
    command: 'اوامر'
  },
  {
    names: ['مساعدة', 'ساعديني', 'كيف استخدمك', 'كيف اشتغل معك'],
    command: 'مساعدة'
  },
  {
    names: ['من انا', 'معلوماتي', 'اعرضي معلوماتي'],
    command: 'منشن'
  }
];





// HINATA EXPANDED NATURAL INTENT LAYER
// يفهم صيغًا مختلفة للطلب، ثم يستدعي الأوامر المسجلة فقط.
function resolveExpandedNaturalIntent(text, commands) {
  const value = clean(String(text || ""));
  if (!value) return null;

  const hasAny = (...words) => words.some(word => value.includes(clean(word)));

  const wantsSection = hasAny(
    "قسم", "القسم", "الأقسام", "الاقسام", "قائمة",
    "افتح", "افتحي", "وريني", "اعرض", "اعرضي",
    "أريد", "اريد", "أبي", "ابي", "ابغى", "ابغا",
    "بغيت", "عطيني", "اعطني", "هات", "جيب", "جيبي",
    "وين", "فين", "أين", "كيف", "عندكم", "عندك",
    "خلينا", "يلا", "نبي", "ممكن"
  );

  const groups = [
    {
      commands: ["قسم_الألعاب"],
      words: [
        "الألعاب", "الالعاب", "العاب", "لعبة", "لعبه",
        "نلعب", "نلعبوا", "نلعبو", "خلينا نلعب",
        "طفشان", "طفشانة", "مللت", "زهقان", "زهقانة",
        "أتسلى", "اتسلى", "تسلية", "تحدي", "تحديات",
        "شطرنج", "اكس او", "xo", "المشنقة"
      ]
    },
    {
      commands: ["قسم_الملصقات"],
      words: [
        "الملصقات", "ملصقات", "ستيكر", "ستيكرات",
        "استيكر", "استيكرات", "ملصق", "ملصقاتي",
        "صناعة الملصقات", "تحويل صورة لملصق",
        "حولها ملصق", "سوي ملصق"
      ]
    },
    {
      commands: ["قسم_الميديا"],
      words: [
        "الميديا", "الوسائط", "قسم الوسائط",
        "الفيديوهات", "الفيديو", "الأغاني", "الاغاني",
        "الصور", "التحميل", "مركز الميديا",
        "مركز الوسائط", "أدوات الميديا"
      ]
    },
    {
      commands: ["قسم_مضاد_الحماية", "قسم_الحماية"],
      words: [
        "الحماية", "الحمايه", "مضاد الحماية",
        "مضاد الحمايه", "حماية القروب", "حمايه القروب",
        "منع التخريب", "الحماية من الروابط",
        "مكافحة السبام", "مضاد السبام"
      ]
    },
    {
      commands: [
        "قائمة_أوامر_الأعضاء",
        "قسم_إدارة_الأعضاء",
        "خيارات_الأعضاء"
      ],
      words: [
        "إدارة الأعضاء", "ادارة الاعضاء",
        "الأعضاء", "الاعضاء", "المشرفين",
        "الإشراف", "الاشراف", "التحكم بالأعضاء",
        "التحكم بالاعضاء", "أوامر الأعضاء"
      ]
    },
    {
      commands: ["قسم_إدارة_المجموعة"],
      words: [
        "إدارة المجموعة", "ادارة المجموعه",
        "إدارة القروب", "ادارة القروب",
        "إعدادات المجموعة", "اعدادات المجموعه",
        "اسم القروب", "وصف القروب",
        "رابط المجموعة", "رابط القروب"
      ]
    },
    {
      commands: ["خيارات_الإدارة"],
      words: [
        "الإدارة", "الاداره", "التحكم",
        "إعدادات القروب", "اعدادات القروب",
        "قفل القروب", "فتح القروب",
        "إعدادات البوت", "اعدادات البوت"
      ]
    },
    {
      commands: ["قسم_الفعاليات"],
      words: [
        "الفعاليات", "فعاليات", "مسابقة",
        "مسابقات", "تصويت", "تحدي جماعي",
        "فعالية", "نشاط جماعي"
      ]
    },
    {
      commands: ["قسم_العشوائيات"],
      words: [
        "العشوائيات", "العشوائيه",
        "عجلة الحظ", "النرد", "الحظ",
        "النسب", "الزواج", "العشوائي"
      ]
    },
    {
      commands: ["قسم_تحكم_البوت_الفرعي"],
      words: [
        "البوت الفرعي", "البوتات الفرعية",
        "البوتات الفرعيه", "تحكم البوت الفرعي",
        "إدارة البوت الفرعي", "ادارة البوت الفرعي",
        "حالة التنصيب", "التنصيب"
      ]
    },
    {
      commands: ["قسم_النخبة", "نخبة"],
      words: [
        "النخبة", "النخبه", "نخبة",
        "ميزات النخبة", "ميزات النخبه",
        "alvaria universe", "يونيفرس"
      ]
    },
    {
      commands: ["مراسم"],
      words: [
        "المراسم", "مراسم", "الترحيب والوداع",
        "ترحيب ووداع", "رسائل الترحيب",
        "رسائل الوداع"
      ]
    },
    {
      commands: ["اوامر", "الأوامر", "قائمة_الأقسام"],
      words: [
        "كل الأقسام", "كل الاقسام",
        "القائمة الرئيسية", "القائمه الرئيسيه",
        "قائمة الأقسام", "قائمه الاقسام",
        "الأوامر كلها", "جميع الأوامر"
      ]
    }
  ];

  // نطلب وجود إشارة إلى طلب أو قسم حتى لا نفسر كل كلمة عابرة كأمر.
  for (const group of groups) {
    if (!hasAny(...group.words)) continue;

    const explicitCategory = hasAny(
      "قسم", "القسم", "قائمة", "افتح", "افتحي",
      "وريني", "اعرض", "اعرضي", "أريد", "اريد",
      "أبي", "ابي", "ابغى", "ابغا", "بغيت",
      "عطيني", "اعطني", "هات", "جيب", "جيبي",
      "وين", "فين", "أين", "عندكم", "عندك",
      "مركز", "أوامر", "اوامر"
    );

    const conversationalIntent = hasAny(
      "طفشان", "طفشانة", "زهقان", "زهقانة",
      "مللت", "نلعب", "خلينا", "يلا",
      "ممكن", "كيف", "أبغى", "ابي", "اريد"
    );

    if (!wantsSection && !explicitCategory && !conversationalIntent) {
      continue;
    }

    for (const name of group.commands) {
      const parsed = makeParsed(name, commands);
      if (parsed) return parsed;
    }
  }

  return null;
}

export function resolveNaturalCommand(input, commands, options = {}) {
  if (!input || !commands?.size) return null;

  const original = String(input).trim();
  const addressMatch = original.match(ADDRESS);
  if (!addressMatch) return null;

  const rawRequest = original.slice(addressMatch[0].length).trim();
  const text = clean(rawRequest);

  if (!text) return null;

  // HINATA SMART SECTIONS — فتح الأقسام الموجودة فعلًا.
  // لا ننشئ أسماء أوامر وهمية؛ makeParsed يتحقق من تسجيل الأمر.
  const sectionIntents = [
    {
      pattern: /^(?:(?:اريد|ابي|ابغى|ابغا|افتح|افتحي|وريني|اعرضي|اعرض|هات|جيبي|اعطني|عطني)\s+)*(?:لي\s+)?(?:قسم\s+)?(?:الالعاب|العاب)(?:\s+قسم)?$/u,
      commands: ['قسم_الألعاب']
    },
    {
      pattern: /^(?:(?:اريد|ابي|ابغى|ابغا|افتح|افتحي|وريني|اعرضي|اعرض|هات|جيبي|اعطني|عطني)\s+)*(?:لي\s+)?(?:قسم\s+)?(?:الملصقات|ستيكرات|الستيكرات)(?:\s+قسم)?$/u,
      commands: ['قسم_الملصقات']
    },
    {
      pattern: /^(?:(?:اريد|ابي|ابغى|ابغا|افتح|افتحي|وريني|اعرضي|اعرض|هات|جيبي|اعطني|عطني)\s+)*(?:لي\s+)?(?:قسم\s+)?(?:الميديا|الوسائط|الاغاني|الصور|الفيديوهات)(?:\s+قسم)?$/u,
      commands: ['قسم_الميديا']
    },
    {
      pattern: /^(?:(?:اريد|ابي|ابغى|ابغا|افتح|افتحي|وريني|اعرضي|اعرض|هات|جيبي|اعطني|عطني)\s+)*(?:لي\s+)?(?:قسم\s+)?(?:الحمايه|مضاد\s+الحمايه)(?:\s+قسم)?$/u,
      commands: ['قسم_مضاد_الحماية', 'قسم_الحماية']
    },
    {
      pattern: /^(?:(?:اريد|ابي|ابغى|ابغا|افتح|افتحي|وريني|اعرضي|اعرض|هات|جيبي|اعطني|عطني)\s+)*(?:لي\s+)?(?:قسم\s+)?(?:اداره\s+الاعضاء|الاعضاء)(?:\s+قسم)?$/u,
      commands: ['قائمة_أوامر_الأعضاء', 'خيارات_الأعضاء', 'قسم_إدارة_الأعضاء']
    },
    {
      pattern: /^(?:(?:اريد|ابي|ابغى|ابغا|افتح|افتحي|وريني|اعرضي|اعرض|هات|جيبي|اعطني|عطني)\s+)*(?:لي\s+)?(?:قسم\s+)?(?:اداره\s+المجموعه|المجموعه)(?:\s+قسم)?$/u,
      commands: ['قسم_إدارة_المجموعة']
    },
    {
      pattern: /^(?:(?:اريد|ابي|ابغى|ابغا|افتح|افتحي|وريني|اعرضي|اعرض|هات|جيبي|اعطني|عطني)\s+)*(?:لي\s+)?(?:قسم\s+)?(?:الاداره|التحكم|اداره\s+البوت)(?:\s+قسم)?$/u,
      commands: ['خيارات_الإدارة']
    },
    {
      pattern: /^(?:(?:اريد|ابي|ابغى|ابغا|افتح|افتحي|وريني|اعرضي|اعرض|هات|جيبي|اعطني|عطني)\s+)*(?:لي\s+)?(?:قسم\s+)?(?:الفعاليات|فعاليات)(?:\s+قسم)?$/u,
      commands: ['قسم_الفعاليات']
    },
    {
      pattern: /^(?:(?:اريد|ابي|ابغى|ابغا|افتح|افتحي|وريني|اعرضي|اعرض|هات|جيبي|اعطني|عطني)\s+)*(?:لي\s+)?(?:قسم\s+)?(?:العشوائيات|العشوائيه)(?:\s+قسم)?$/u,
      commands: ['قسم_العشوائيات']
    },
    {
      pattern: /^(?:(?:اريد|ابي|ابغى|ابغا|افتح|افتحي|وريني|اعرضي|اعرض|هات|جيبي|اعطني|عطني)\s+)*(?:لي\s+)?(?:قسم\s+)?(?:البوت\s+الفرعي|تحكم\s+البوت\s+الفرعي)(?:\s+قسم)?$/u,
      commands: ['قسم_تحكم_البوت_الفرعي']
    },
    {
      pattern: /^(?:(?:اريد|ابي|ابغى|ابغا|افتح|افتحي|وريني|اعرضي|اعرض|هات|جيبي|اعطني|عطني)\s+)*(?:لي\s+)?(?:قسم\s+)?(?:النخبه|نخبه)(?:\s+قسم)?$/u,
      commands: ['قسم_النخبة', 'نخبة']
    },
    {
      pattern: /^(?:(?:اريد|ابي|ابغى|ابغا|افتح|افتحي|وريني|اعرضي|اعرض|هات|جيبي|اعطني|عطني)\s+)*(?:لي\s+)?(?:قسم\s+)?(?:المراسم|مراسم)(?:\s+قسم)?$/u,
      commands: ['مراسم']
    },
    {
      pattern: /^(?:(?:اريد|ابي|ابغى|ابغا|افتح|افتحي|وريني|اعرضي|اعرض|هات|جيبي|اعطني|عطني)\s+)*(?:لي\s+)?(?:القائمه|الاقسام|الاقسام\s+الرئيسيه|القائمه\s+الرئيسيه)$/u,
      commands: ['اوامر', 'الأوامر', 'قائمة_الأقسام']
    }
  ];

  for (const section of sectionIntents) {
    if (!section.pattern.test(text)) continue;

    for (const commandName of section.commands) {
      const result = makeParsed(commandName, commands);
      if (result) return result;
    }
  }

  // الأغاني: يا ألفاريا أريد أغنية اسم الأغنية.
  const songMatch = rawRequest.match(
    /^(?:(?:انا\s*)?(?:اريد|ابي|ابغى|هات|جيبي|شغلي|شغل|ابحثي\s+عن|ابحثي|بحثي\s+عن)\s+)?(?:اغنيه|أغنية|اغنية|موسيقى|ميوزك)\s+(.+)$/iu
  );

  if (songMatch?.[1]?.trim()) {
    const result = makeParsed('اغنيه', commands, songMatch[1]);
    if (result) return result;
  }

  // صيغة أخرى: يا ألفاريا ابحثي لي عن أغنية ...
  const songMatch2 = rawRequest.match(
    /^(?:ابحثي|ابحث|دوري|دوريلي)\s+(?:لي\s+)?(?:عن\s+)?(?:اغنيه|أغنية|اغنية)\s+(.+)$/iu
  );

  if (songMatch2?.[1]?.trim()) {
    const result = makeParsed('اغنيه', commands, songMatch2[1]);
    if (result) return result;
  }

  // الصور: يا ألفاريا أريد صورة ...
  const imageMatch = rawRequest.match(
    /^(?:(?:اريد|ابي|ابغى|هات|جيبي|ابحثي\s+عن|ابحثي|دوري\s+عن)\s+)?(?:صوره|صورة|صور)\s+(.+)$/iu
  );

  if (imageMatch?.[1]?.trim()) {
    const result = makeParsed('صورة', commands, imageMatch[1]);
    if (result) return result;
  }

  // فيديوهات الإيديت: نستخدم الأمر الموجود فعليًا إن كان مسجلًا.
  const videoMatch = rawRequest.match(
    /^(?:(?:اريد|ابي|ابغى|هات|جيبي|ابحثي\s+عن|ابحثي)\s+)?(?:فيديو|فيديوهات|مقاطع|ايديت|إيديت)\s+(.+)$/iu
  );

  if (videoMatch?.[1]?.trim()) {
    const candidates = [
      'فيديوهات_ايديت',
      'فيديوهات_الإيديت',
      'ايديت',
      'إيديت'
    ];

    for (const candidate of candidates) {
      const result = makeParsed(candidate, commands, videoMatch[1]);
      if (result) return result;
    }
  }

  // إدارة عضو محدد: يجب أن يكون المستخدم قد رد على رسالة العضو.
  // لا ننفذ الطرد أو الكتم اعتمادًا على كلمة "هذا" وحدها.
  const hasQuotedTarget = Boolean(options.hasQuotedTarget);

  if (hasQuotedTarget) {
    if (
      /^(?:اطردي|اطرد|اخرجي|اخرجيه|احذفي)\s+(?:(?:هذا|هاذا|هدا|العضو|الشخص)\s*)?$/u.test(text)
    ) {
      return makeParsed('طرد', commands);
    }

    if (
      /^(?:اكتمي|اكتم|اسكتي|اسكتيه|اعملي\s+له\s+كتم)\s+(?:(?:هذا|هاذا|هدا|العضو|الشخص)\s*)?$/u.test(text)
    ) {
      return makeParsed('كتم', commands);
    }

    if (
      /^(?:فكي\s+الكتم|الغاء\s+الكتم|الغيه\s+من\s+الكتم)\s+(?:(?:هذا|هاذا|هدا|العضو|الشخص)\s*)?$/u.test(text)
    ) {
      return makeParsed('فك_كتم', commands);
    }

    if (
      /^(?:اعطيه\s+اشراف|رقيه|رقّي|ارفعيه\s+مشرف|خليه\s+مشرف)\s*$/u.test(text)
    ) {
      return makeParsed('ترقية', commands);
    }

    if (
      /^(?:اسحبي\s+اشرافه|نزليه\s+من\s+الاشراف|شيلي\s+اشرافه)\s*$/u.test(text)
    ) {
      return makeParsed('تنزيل', commands);
    }

    if (
      /^(?:اعرضي\s+معلوماته|معلومات\s+هذا|افحصي\s+هذا\s+العضو)\s*$/u.test(text)
    ) {
      return makeParsed('معلومات_عضو', commands);
    }
  }

  // أوامر المجموعة والحماية والترحيب والوداع السابقة.
  let wanted = resolveGroupIntent(text);

  if (!wanted) wanted = resolveFeatureIntent(text);
  if (!wanted) wanted = resolveWelcomeGoodbye(text);

  if (wanted) return makeParsed(wanted, commands);

  for (const intent of SAFE_INTENTS) {
    if (intent.names.some(name => clean(name) === text)) {
      const result = makeParsed(intent.command, commands);
      if (result) return result;
    }
  }

  
  // آخر محاولة: فهم الطلبات العامة ومرادفات الأقسام.
  const expandedIntent = resolveExpandedNaturalIntent(text, commands);
  if (expandedIntent) return expandedIntent;

  return null;
}
function distance(a, b) {
  const left = Array.from(a);
  const right = Array.from(b);

  if (Math.abs(left.length - right.length) > 2) return 99;

  let previous = Array.from(
    { length: right.length + 1 },
    (_, index) => index
  );

  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];

    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;

      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + cost
      );
    }

    previous = current;
  }

  return previous[right.length];
}

export function suggestClosestCommand(input, commands) {
  const target = clean(input);

  if (!target || target.length < 2 || !commands?.size) return null;

  let best = null;
  let bestScore = 99;
  let tied = false;

  for (const name of commands.keys()) {
    const candidate = clean(name);

    if (!candidate || candidate === target) continue;

    // لا نقارن أسماء طويلة أو مختلفة جدًا.
    if (Math.abs(candidate.length - target.length) > 2) continue;

    const score = distance(target, candidate);

    if (score < bestScore) {
      best = name;
      bestScore = score;
      tied = false;
    } else if (score === bestScore) {
      tied = true;
    }
  }

  const limit = target.length <= 4 ? 1 : 2;

  if (!best || bestScore > limit || tied) return null;

  return best;
}
