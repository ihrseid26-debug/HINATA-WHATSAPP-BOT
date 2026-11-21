import { randomInt } from 'node:crypto';
import { sendHinataNativeButtons } from './native-buttons.js';
import { formatHinataReply } from './text.js';

const MENU_BUTTONS = [
  ['.زواج', '💍 زواج عشوائي'],
  ['.طلاق', '💔 طلاق عشوائي'],
  ['.نرد', '🎲 رمي النرد'],
  ['.عجله_حظ', '🎡 عجلة الحظ'],
  ['.نسبة_التوافق', '💗 نسبة التوافق'],
  ['.نسبة_الحظ', '🍀 نسبة الحظ'],
  ['.نسبة_الفوضى', '🤪 نسبة الفوضى'],
  ['.نسبة_الكسل', '😴 نسبة الكسل'],
  ['.تحدي_عشوائي', '🎯 تحدي عشوائي'],
  ['.مفاجأة_عشوائية', '🎁 مفاجأة عشوائية']
];

const pick = items => items[randomInt(items.length)];
const percent = () => randomInt(101);

const challenges = [
  'اكتب جملة كاملة دون استعمال حرف الألف.',
  'اختر عضوًا وامدحه بكلمة لطيفة.',
  'أرسل ثلاثة إيموجيات تصف مزاجك.',
  'اكتب اسم فيلم باستخدام الإيموجيات فقط.',
  'قل شيئًا إيجابيًا عن المجموعة.',
  'اختر رقمًا من 1 إلى 10 ودع المجموعة تخمّن.',
  'اكتب جملة مضحكة من خمس كلمات.'
];

const surprises = [
  '🌟 مفاجأتك: اليوم يوم الحظ!',
  '🎁 مفاجأتك: حصلت على لقب نجم المجموعة!',
  '🍀 مفاجأتك: حظك يبتسم لك اليوم!',
  '👑 مفاجأتك: أنت ملك المزاج اليوم!',
  '🦋 مفاجأتك: طاقتك إيجابية، حافظ عليها!',
  '🎉 مفاجأتك: تستحق تصفيق المجموعة!'
];

function getParticipantId(participant) {
  return [
    participant?.id,
    participant?.jid,
    participant?.lid,
    participant?.phoneNumber
  ].find(value => typeof value === 'string' && value.includes('@')) || '';
}

function sameIdentity(a, b) {
  if (!a || !b) return false;
  return a === b;
}

async function getGroupMembers(ctx) {
  if (!String(ctx.jid).endsWith('@g.us')) {
    throw new Error('هذه الفعالية تعمل داخل المجموعات فقط.');
  }

  const metadata = await ctx.sock.groupMetadata(ctx.jid);
  const botId = ctx.sock.user?.id || '';
  const senderIds = [
    ctx.senderJid,
    ctx.senderAltJid,
    ctx.message?.key?.participant,
    ctx.message?.key?.participantAlt
  ].filter(value => typeof value === 'string' && value.includes('@'));

  const members = (metadata.participants || [])
    .map(getParticipantId)
    .filter(id => id && !sameIdentity(id, botId));

  return {
    members: [...new Set(members)],
    senderIds
  };
}

async function editWaitingMessage(ctx, waiting, text, mentions = []) {
  const formatted = formatHinataReply(text);

  try {
    await ctx.sock.sendMessage(ctx.jid, {
      text: formatted,
      mentions,
      edit: waiting.key
    });
  } catch {
    // إذا لم يدعم إصدار Baileys تعديل الرسالة، أرسل النتيجة برسالة جديدة.
    await ctx.reply(text, mentions.length ? { mentions } : {});
  }
}

async function withWaiting(ctx, label, task) {
  const waiting = await ctx.reply(`⏳ جارٍ ${label}...`);

  await new Promise(resolve => setTimeout(resolve, 650));

  try {
    const result = await task();
    await editWaitingMessage(
      ctx,
      waiting,
      result.text,
      result.mentions || []
    );
  } catch (error) {
    await editWaitingMessage(
      ctx,
      waiting,
      `❌ ${error?.message || 'تعذر تنفيذ الفعالية.'}`
    );
  }
}

function mention(jid) {
  return `@${String(jid).split('@')[0]}`;
}

async function randomMarriage(ctx) {
  return withWaiting(ctx, 'اختيار شريك المزاح', async () => {
    const { members, senderIds } = await getGroupMembers(ctx);

    const candidates = members.filter(
      id => !senderIds.includes(id)
    );

    if (!candidates.length) {
      throw new Error('لا يوجد عضو آخر مناسب للاختيار.');
    }

    const chosen = pick(candidates);

    return {
      text:
        `💍 نتيجة زواج المزاح العشوائي!\n\n` +
        `${mention(ctx.senderJid)} 🤝 ${mention(chosen)}\n\n` +
        `😂 مجرد لعبة وضحك، وليس ارتباطًا حقيقيًا.`,
      mentions: [ctx.senderJid, chosen].filter(Boolean)
    };
  });
}

async function randomDivorce(ctx) {
  return withWaiting(ctx, 'اختيار نتيجة الطلاق التمثيلي', async () => {
    const { members } = await getGroupMembers(ctx);

    if (members.length < 2) {
      throw new Error('تحتاج الفعالية إلى عضوين على الأقل.');
    }

    const firstIndex = randomInt(members.length);
    const first = members[firstIndex];
    const remaining = members.filter((_, index) => index !== firstIndex);
    const second = pick(remaining);

    return {
      text:
        `💔 محكمة المزاح أصدرت حكمها!\n\n` +
        `${mention(first)} و ${mention(second)}\n\n` +
        `😂 طلاق تمثيلي داخل اللعبة فقط، لا توجد أي علاقة حقيقية متأثرة.`,
      mentions: [first, second]
    };
  });
}

async function randomCompatibility(ctx) {
  return withWaiting(ctx, 'حساب نسبة التوافق', async () => {
    const { members, senderIds } = await getGroupMembers(ctx);
    const candidates = members.filter(id => !senderIds.includes(id));

    if (!candidates.length) {
      throw new Error('لا يوجد عضو آخر لحساب نسبة المزاح.');
    }

    const chosen = pick(candidates);
    const value = percent();

    return {
      text:
        `💗 نسبة التوافق العشوائية!\n\n` +
        `${mention(ctx.senderJid)} + ${mention(chosen)}\n` +
        `النسبة: ${value}%\n\n` +
        `😄 نتيجة عشوائية للترفيه فقط.`,
      mentions: [ctx.senderJid, chosen].filter(Boolean)
    };
  });
}

function simplePercentage(ctx, title, emoji) {
  return withWaiting(ctx, 'حساب النسبة', async () => ({
    text:
      `${emoji} ${title}\n\n` +
      `نسبتك العشوائية: ${percent()}%\n\n` +
      `😂 هذه نتيجة ترفيهية وليست تقييمًا حقيقيًا.`,
    mentions: ctx.senderJid ? [ctx.senderJid] : []
  }));
}

const RANDOM_GUIDE_ITEMS = [
  ['زواج', 'اختيار ثنائي عشوائي للمرح والمزاح.'],
  ['طلاق', 'فعالية تمثيلية عشوائية للضحك فقط.'],
  ['نرد', 'رمي نرد والحصول على رقم من واحد إلى ستة.'],
  ['عجله_حظ', 'تدوير عجلة الحظ واكتشاف نتيجة عشوائية.'],
  ['نسبة_التوافق', 'حساب نسبة توافق عشوائية للترفيه.'],
  ['نسبة_الحظ', 'حساب نسبة حظ عشوائية.'],
  ['نسبة_الفوضى', 'حساب نسبة فوضى عشوائية.'],
  ['نسبة_الكسل', 'حساب نسبة كسل عشوائية.'],
  ['تحدي_عشوائي', 'اختيار تحدٍّ خفيف وآمن.'],
  ['مفاجأة_عشوائية', 'اختيار مفاجأة عشوائية.']
];

function formatRandomGuide(items = RANDOM_GUIDE_ITEMS) {
  return [
    '*❅ دَلِـيـلُ أَوَامِـرِ العَـشْـوَائِـيَـات ❅*',
    '*『 𝑨𝑳𝑽𝑨𝑹𝑰𝑨 • 𝑹𝑨𝑵𝑫𝑶𝑴 』*',
    '',
    ...items.flatMap(([name, description]) => [
      `*•┆🎲〖 .${name} 〗*`,
      `⟞ ${description}`,
      ''
    ])
  ].join('\n');
}

function register(commands, names, description, handler) {
  for (const name of names) {
    commands.set(name, {
      description,
      handler,
      reaction: '🎲'
    });
  }
}

export function registerRandomEventsCommands(commands) {
  register(
    commands,
    ['عشوائيات'],
    'قائمة العشوائيات والفعاليات',
    async ctx => {
      if (!String(ctx.jid).endsWith('@g.us')) {
        await ctx.reply('هذه القائمة مخصصة للمجموعات.');
        return;
      }

      await sendHinataNativeButtons(ctx.sock, ctx.jid, {
        title: '🌸 ALVARIA',
        text:
          '*╭━━〔 ❄️ 𝑨𝑳𝑽𝑨𝑹𝑰𝑨 〕━━╮*\n\n' +
          '*🎲 مَـرْكَـزُ العَـشْـوَائِـيَّـات*\\n' +
          formatRandomGuide() + '\\n' +
          '⟞ جميع النتائج عشوائية ومخصصة للترفيه فقط.\n\n' +
          '*╰━━〔 ❄️ 𝑨𝑳𝑽𝑨𝑹𝑰𝑨 〕━━╯*',
        footer: 'كل النتائج للترفيه والمزاح فقط',
        buttons: MENU_BUTTONS.map(([id, text]) => ({
          id,
          text
        }))
      });
    }
  );

  register(
    commands,
    ['زواج'],
    'اختيار زواج عشوائي للضحك',
    randomMarriage
  );

  register(
    commands,
    ['طلاق'],
    'فعالية طلاق تمثيلية',
    randomDivorce
  );

  register(
    commands,
    ['نرد'],
    'رمي نرد من واحد إلى ستة',
    async ctx => withWaiting(ctx, 'رمي النرد', async () => {
      const value = randomInt(1, 7);
      const dice = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

      return {
        text: `🎲 نتيجة النرد: ${dice[value - 1]} ${value}`
      };
    })
  );

  register(
    commands,
    ['عجله_حظ'],
    'تدوير عجلة الحظ',
    async ctx => withWaiting(ctx, 'تدوير عجلة الحظ', async () => {
      const results = [
        '🍀 حظ ممتاز!',
        '🌟 يومك مليء بالمفاجآت!',
        '🎁 جائزة معنوية: لقب نجم المجموعة!',
        '😂 حظك يحتاج فنجان قهوة!',
        '👑 أنت نجم الجولة!',
        '🦋 بداية موفقة!'
      ];

      return { text: `🎡 عجلة الحظ توقفت!\n\n${pick(results)}` };
    })
  );

  register(
    commands,
    ['نسبة_التوافق'],
    'حساب نسبة توافق عشوائية للترفيه',
    randomCompatibility
  );

  register(
    commands,
    ['نسبة_الحظ'],
    'حساب نسبة الحظ العشوائية',
    ctx => simplePercentage(ctx, 'نسبة الحظ', '🍀')
  );

  register(
    commands,
    ['نسبة_الفوضى'],
    'حساب نسبة الفوضى العشوائية',
    ctx => simplePercentage(ctx, 'نسبة الفوضى', '🤪')
  );

  register(
    commands,
    ['نسبة_الكسل'],
    'حساب نسبة الكسل العشوائية',
    ctx => simplePercentage(ctx, 'نسبة الكسل', '😴')
  );

  register(
    commands,
    ['تحدي_عشوائي'],
    'اختيار تحدٍّ خفيف وآمن',
    async ctx => withWaiting(ctx, 'اختيار التحدي', async () => ({
      text: `🎯 تحديك العشوائي:\n\n${pick(challenges)}`
    }))
  );

  register(
    commands,
    ['مفاجأة_عشوائية'],
    'اختيار مفاجأة عشوائية',
    async ctx => withWaiting(ctx, 'تحضير المفاجأة', async () => ({
      text: pick(surprises)
    }))
  );


  // ALVARIA_RANDOM_CENTER_V3

  register(
    commands,
    ['قسم_العشوائيات'],
    'مركز العشوائيات والفعاليات الترفيهية',
    async ctx => {
      if (!String(ctx.jid).endsWith('@g.us')) {
        await ctx.reply('هذا القسم مخصص للمجموعات فقط.');
        return;
      }

      let imageBuffer = null;
      try {
        const { getSubbotSectionImage } =
          await import('./subbot-section-images.js');
        imageBuffer = await getSubbotSectionImage(ctx, 'العشوائيات');
      } catch (error) {
        console.error('[ALVARIA RANDOM IMAGE ERROR]', error);
      }

      await sendHinataNativeButtons(ctx.sock, ctx.jid, {
        imageBuffer,
        title: '❄️ 𝑨𝒍𝒗𝒂𝒓𝒊𝒂 • RANDOM',
        text:
          '*╭━━〔 ❄️ 𝑨𝑳𝑽𝑨𝑹𝑰𝑨 〕━━╮*\n\n' +
          '*🎲 مَـرْكَـزُ العَـشْـوَائِـيَّـات*\n' +
          '*『 𝑨𝑳𝑽𝑨𝑹𝑰𝑨 • 𝑹𝑨𝑵𝑫𝑶𝑴 』*\n\n' +
          '_مجموعة من الفعاليات الترفيهية الخفيفة للمجموعة._\n\n' +
          formatRandomGuide() + '\\n' +
          '❅ اختر الفعالية من القائمة التفاعلية.\n' +
          '⟞ جميع النتائج عشوائية وللترفيه فقط.\n\n' +
          '*╰━━〔 ❄️ 𝑨𝑳𝑽𝑨𝑹𝑰𝑨 〕━━╯*',
        footer: '🍹 جميع النتائج عشوائية وللترفيه فقط',
        buttons: [{
          type: 'single_select',
          title: '🎲 قائمة العشوائيات',
          sections: [{
            title: '❅ الفعاليات الترفيهية',
            rows: [
              {
                title: '💍 زواج عشوائي',
                description: 'اختيار ثنائي عشوائي للمرح والمزاح',
                id: '.زواج'
              },
              {
                title: '💔 طلاق عشوائي',
                description: 'فعالية تمثيلية عشوائية للضحك فقط',
                id: '.طلاق'
              },
              {
                title: '🎲 رمي النرد',
                description: 'احصل على رقم عشوائي من واحد إلى ستة',
                id: '.نرد'
              },
              {
                title: '🎡 عجلة الحظ',
                description: 'أدر العجلة واكتشف النتيجة العشوائية',
                id: '.عجله_حظ'
              },
              {
                title: '🎯 تحدي عشوائي',
                description: 'احصل على تحدٍّ خفيف وآمن',
                id: '.تحدي_عشوائي'
              },
              {
                title: '🎁 مفاجأة عشوائية',
                description: 'اكتشف المفاجأة التي اختيرت لك',
                id: '.مفاجأة_عشوائية'
              },
              {
                title: '💗 مركز النسب',
                description: 'التوافق والحظ والفوضى والكسل',
                id: '.قسم_نسب_العشوائيات'
              },
              {
                title: '⬅️ العودة إلى الأقسام',
                description: 'الرجوع إلى قائمة ALVARIA الرئيسية',
                id: '.اوامر'
              }
            ]
          }]
        }]
      });
    }
  );

  register(
    commands,
    ['قسم_نسب_العشوائيات'],
    'مركز النسب العشوائية',
    async ctx => {
      if (!String(ctx.jid).endsWith('@g.us')) {
        await ctx.reply('هذا القسم مخصص للمجموعات فقط.');
        return;
      }

      await sendHinataNativeButtons(ctx.sock, ctx.jid, {
        title: '❄️ 𝑨𝒍𝒗𝒂𝒓𝒊𝒂 • RANDOM STATS',
        text: [
          '*╭━━〔 ❄️ 𝑨𝑳𝑽𝑨𝑹𝑰𝑨 〕━━╮*',
          '',
          '*💗 مَـرْكَـزُ الـنِّـسَـب العَـشْـوَائِـيَّـة*',
          '*『 𝑨𝑳𝑽𝑨𝑹𝑰𝑨 • 𝑹𝑨𝑵𝑫𝑶𝑴 𝑺𝑻𝑨𝑻𝑺 』*',
          '',
          '*❅ دَلِـيـلُ أَوَامِـرِ الـنِّـسَـب ❅*',
          ...[
            ['نسبة_التوافق', 'حساب توافق عشوائي بين عضوين.'],
            ['نسبة_الحظ', 'حساب نسبة الحظ العشوائية.'],
            ['نسبة_الفوضى', 'حساب نسبة الفوضى العشوائية.'],
            ['نسبة_الكسل', 'حساب نسبة الكسل العشوائية.']
          ].flatMap(([name, description]) => [
            `*•┆💗〖 .${name} 〗*`,
            `⟞ ${description}`,
            ''
          ]),
          '❅ النتائج عشوائية وللترفيه فقط.',
          '',
          '*╰━━〔 ❄️ 𝑨𝑳𝑽𝑨𝑹𝑰𝑨 〕━━╯*'
        ].join('\n'),
        footer: '❅ نتائج ترفيهية وليست تقييمات حقيقية',
        buttons: [{
          type: 'single_select',
          title: '💗 اختر النسبة',
          sections: [{
            title: '❅ أدوات النسب العشوائية',
            rows: [
              {
                title: '💗 نسبة التوافق',
                description: 'حساب نسبة توافق عشوائية بين عضوين',
                id: '.نسبة_التوافق'
              },
              {
                title: '🍀 نسبة الحظ',
                description: 'اكتشف نسبة حظك العشوائية',
                id: '.نسبة_الحظ'
              },
              {
                title: '🤪 نسبة الفوضى',
                description: 'احسب نسبة الفوضى العشوائية',
                id: '.نسبة_الفوضى'
              },
              {
                title: '😴 نسبة الكسل',
                description: 'احصل على نسبة كسل عشوائية',
                id: '.نسبة_الكسل'
              },
              {
                title: '⬅️ العودة للعشوائيات',
                description: 'الرجوع إلى مركز العشوائيات',
                id: '.قسم_العشوائيات'
              }
            ]
          }]
        }]
      });
    }
  );


}
