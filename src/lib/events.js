import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';

const DB_FILE = path.join(config.databaseDir, 'events.json');

let writeQueue = Promise.resolve();

async function loadDB() {
  await fs.mkdir(config.databaseDir, { recursive: true });

  try {
    const data = JSON.parse(await fs.readFile(DB_FILE, 'utf8'));
    if (!data.groups || typeof data.groups !== 'object') data.groups = {};
    return data;
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw new Error('تعذرت قراءة قاعدة بيانات الفعاليات: ' + error.message);
    }
    return { groups: {} };
  }
}

async function saveDB(db) {
  const temp = DB_FILE + '.tmp';
  await fs.writeFile(temp, JSON.stringify(db, null, 2), 'utf8');
  await fs.rename(temp, DB_FILE);
}

async function updateDB(callback) {
  const task = writeQueue.then(async () => {
    const db = await loadDB();
    const result = await callback(db);
    await saveDB(db);
    return result;
  });

  writeQueue = task.catch(() => {});
  return task;
}

function groupData(db, jid) {
  if (!db.groups[jid]) {
    db.groups[jid] = {
      events: [],
      polls: [],
      points: {},
      challenge: null,
      contest: null,
      rules: ''
    };
  }

  const group = db.groups[jid];
  group.events ||= [];
  group.polls ||= [];
  group.points ||= {};
  return group;
}

function input(ctx) {
  if (typeof ctx.text === 'string' && ctx.text.trim()) {
    return ctx.text.trim();
  }

  if (Array.isArray(ctx.args)) return ctx.args.join(' ').trim();
  if (typeof ctx.args === 'string') return ctx.args.trim();

  return '';
}

function splitFields(value) {
  return String(value || '').split('|').map(part => part.trim());
}

function normalize(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ');
}

function makeId(prefix) {
  return prefix + Date.now().toString(36).slice(-6).toUpperCase();
}

function findEvent(group, id) {
  if (!id) return null;
  return group.events.find(event => event.id.toLowerCase() === id.toLowerCase());
}

function getMemberName(jid) {
  return String(jid || '').split('@')[0].split(':')[0];
}

function addPoints(group, jid, amount = 1) {
  if (!jid) return;
  group.points[jid] = (Number(group.points[jid]) || 0) + amount;
}

async function requireGroup(ctx) {
  if (!ctx.jid?.endsWith('@g.us')) {
    await ctx.reply('⛔ أوامر الفعاليات تعمل داخل المجموعات فقط.');
    return false;
  }
  return true;
}

async function requireAdmin(ctx) {
  if (!await requireGroup(ctx)) return false;

  if (!ctx.isAdmin) {
    await ctx.reply('🔒 هذا الأمر مخصص لمشرفي المجموعة.');
    return false;
  }

  return true;
}

function eventSummary(event) {
  return [
    `🎟️ الفعالية: ${event.title}`,
    `🆔 الرقم: ${event.id}`,
    `📅 الموعد: ${event.date || 'لم يُحدد'}`,
    `📝 الوصف: ${event.description || 'لا يوجد وصف'}`,
    `👥 المسجلون: ${event.attendees.length}`,
    `📌 التسجيل: ${event.open ? '🟢 مفتوح' : '🔴 مغلق'}`,
    `📍 الحالة: ${event.status}`
  ].join('\n');
}

const challengeBank = {
  اللغز_السريع: [
    { question: 'ما الشيء الذي كلما أخذت منه كبر؟', answer: 'الحفرة' },
    { question: 'ما الشيء الذي له أسنان ولا يعض؟', answer: 'المشط' },
    { question: 'ما الشيء الذي يكتب ولا يقرأ؟', answer: 'القلم' }
  ],
  سؤال_اليوم: [
    { question: 'ما عاصمة اليابان؟', answer: 'طوكيو' },
    { question: 'كم عدد أيام الأسبوع؟', answer: '7' },
    { question: 'ما الكوكب المعروف بالكوكب الأحمر؟', answer: 'المريخ' }
  ],
  تحدي_السرعة: [
    { question: 'احسب بسرعة: 12 + 15', answer: '27' },
    { question: 'احسب بسرعة: 9 × 7', answer: '63' },
    { question: 'احسب بسرعة: 100 - 36', answer: '64' }
  ],
  تحدي_المعرفة: [
    { question: 'كم عدد أضلاع المثلث؟', answer: '3' },
    { question: 'ما أكبر محيط في العالم؟', answer: 'الهادي' },
    { question: 'ما الغاز الذي تحتاجه النباتات للبناء الضوئي؟', answer: 'ثاني اكسيد الكربون' }
  ],
  تحدي_الحروف: [
    { question: 'اكتب اسم حيوان يبدأ بحرف: س', answer: 'س' },
    { question: 'اكتب اسم بلد يبدأ بحرف: م', answer: 'م' },
    { question: 'اكتب اسم فاكهة يبدأ بحرف: ت', answer: 'ت' }
  ],
  تحدي_الإيموجي: [
    { question: 'خمن العبارة: 🌧️ + ☀️', answer: 'قوس قزح' },
    { question: 'خمن الحيوان: 🦁', answer: 'اسد' },
    { question: 'خمن الشيء: 📚', answer: 'كتب' }
  ]
};

async function startOrAnswerChallenge(ctx, type, suppliedAnswer = '') {
  const jid = ctx.senderJid;
  const answerText = suppliedAnswer.trim();

  const result = await updateDB(db => {
    const group = groupData(db, ctx.jid);
    const current = group.challenge;

    if (answerText && current?.type === type) {
      const correct = normalize(answerText) === normalize(current.answer);

      if (correct) {
        addPoints(group, jid, 3);
        group.challenge = null;
      }

      return {
        mode: 'answer',
        correct,
        answer: current.answer,
        points: group.points[jid] || 0
      };
    }

    if (answerText && current?.type !== type) {
      return { mode: 'missing' };
    }

    let challenge;

    if (type === 'تحدي_الأرقام') {
      const a = Math.floor(Math.random() * 30) + 5;
      const b = Math.floor(Math.random() * 20) + 2;
      challenge = {
        question: `احسب الناتج: ${a} × ${b}`,
        answer: String(a * b)
      };
    } else if (type === 'صح_أم_خطأ') {
      const statements = [
        { question: 'الشمس نجم.', answer: 'صح' },
        { question: 'عدد أيام السنة العادية 400 يوم.', answer: 'خطأ' },
        { question: 'الماء يتكون من الهيدروجين والأكسجين.', answer: 'صح' }
      ];
      challenge = statements[Math.floor(Math.random() * statements.length)];
    } else {
      const choices = challengeBank[type] || challengeBank.سؤال_اليوم;
      challenge = choices[Math.floor(Math.random() * choices.length)];
    }

    group.challenge = {
      type,
      question: challenge.question,
      answer: challenge.answer,
      startedAt: Date.now()
    };

    return { mode: 'started', question: challenge.question };
  });

  if (result.mode === 'answer') {
    if (result.correct) {
      await ctx.reply(
        `🎉 إجابة صحيحة!\n⭐ حصلت على 3 نقاط.\n📊 مجموع نقاطك: ${result.points}`
      );
    } else {
      await ctx.reply('❌ ليست الإجابة الصحيحة. حاول مرة أخرى!');
    }
    return;
  }

  if (result.mode === 'missing') {
    await ctx.reply('لا يوجد تحدٍّ نشط من هذا النوع. أرسل الأمر دون إجابة لبدء تحدٍّ جديد.');
    return;
  }

  await ctx.reply(
    `╭━━〔 🎮 تَـحَـدِّي ALVARIA 〕━━╮\n` +
    `❓ ${result.question}\n\n` +
    `✍️ أرسل الأمر نفسه متبوعًا بإجابتك.\n` +
    `مثال: .${type} إجابتك\n` +
    `⭐ الإجابة الصحيحة تمنحك 3 نقاط.\n` +
    `╰━━〔 ❅ ALVARIA 〕━━╯`
  );
}

export function registerEventsCommands(commands) {
  const register = (name, description, handler, options = {}) => {
    if (commands.has(name)) {
      throw new Error(`اسم أمر الفعاليات موجود مسبقًا: ${name}`);
    }

    commands.set(name, {
      description,
      handler,
      reaction: options.reaction || '❄️',
      ...(options.requiresAdmin ? { requiresAdmin: true } : {})
    });
  };

  // 1 — إنشاء فعالية
  register('فعالية_جديدة', 'إنشاء فعالية جديدة: العنوان | الموعد | الوصف', async ctx => {
    if (!await requireAdmin(ctx)) return;

    const [title, date, description] = splitFields(input(ctx));

    if (!title) {
      await ctx.reply('استخدم:\n.فعالية_جديدة العنوان | الموعد | الوصف');
      return;
    }

    const event = await updateDB(db => {
      const group = groupData(db, ctx.jid);
      const item = {
        id: makeId('E'),
        title,
        date: date || '',
        description: description || '',
        attendees: [],
        open: true,
        status: 'قائمة',
        createdBy: ctx.senderJid,
        createdAt: Date.now()
      };
      group.events.push(item);
      return item;
    });

    await ctx.reply(`✅ تم إنشاء الفعالية!\n\n${eventSummary(event)}`);
  }, { requiresAdmin: true });

  // 2 — قائمة الفعاليات
  register('الفعاليات', 'عرض فعاليات المجموعة', async ctx => {
    if (!await requireGroup(ctx)) return;

    const db = await loadDB();
    const group = groupData(db, ctx.jid);
    const events = group.events.filter(event => event.status !== 'ملغاة').slice(-15).reverse();

    if (!events.length) {
      await ctx.reply('📭 لا توجد فعاليات حاليًا.\nيمكن للمشرف إنشاء فعالية باستخدام .فعالية_جديدة');
      return;
    }

    await ctx.reply(
      '╭━━〔 🎉 فَـعَـالِـيَـات ALVARIA 〕━━╮\n\n' +
      events.map(event =>
        `🎟️ ${event.title}\n🆔 ${event.id} • ${event.date || 'موعد غير محدد'}\n👥 ${event.attendees.length} مسجل`
      ).join('\n\n') +
      '\n\n╰━━〔 ❅ ALVARIA 〕━━╯'
    );
  });

  // 3 — تفاصيل فعالية
  register('تفاصيل_فعالية', 'عرض تفاصيل فعالية باستخدام رقمها', async ctx => {
    if (!await requireGroup(ctx)) return;

    const db = await loadDB();
    const group = groupData(db, ctx.jid);
    const event = findEvent(group, input(ctx));

    await ctx.reply(event ? eventSummary(event) : 'لم أجد هذه الفعالية. استخدم .الفعاليات لعرض الأرقام.');
  });

  // 4 — الانضمام
  register('انضمام_فعالية', 'التسجيل في فعالية', async ctx => {
    if (!await requireGroup(ctx)) return;

    const result = await updateDB(db => {
      const group = groupData(db, ctx.jid);
      const event = findEvent(group, input(ctx));

      if (!event) return 'not-found';
      if (!event.open || event.status !== 'قائمة') return 'closed';
      if (event.attendees.includes(ctx.senderJid)) return 'already';

      event.attendees.push(ctx.senderJid);
      return 'joined';
    });

    const messages = {
      'not-found': 'لم أجد الفعالية. تحقق من رقمها باستخدام .الفعاليات',
      closed: '🔒 التسجيل مغلق أو الفعالية غير متاحة.',
      already: 'أنت مسجل بالفعل في هذه الفعالية.',
      joined: '🎉 تم تسجيلك في الفعالية بنجاح!'
    };

    await ctx.reply(messages[result]);
  });

  // 5 — الانسحاب
  register('انسحاب_فعالية', 'الانسحاب من فعالية', async ctx => {
    if (!await requireGroup(ctx)) return;

    const result = await updateDB(db => {
      const group = groupData(db, ctx.jid);
      const event = findEvent(group, input(ctx));

      if (!event) return 'not-found';
      const index = event.attendees.indexOf(ctx.senderJid);
      if (index < 0) return 'not-joined';

      event.attendees.splice(index, 1);
      return 'done';
    });

    await ctx.reply(
      result === 'done' ? 'تم إلغاء تسجيلك من الفعالية.' :
      result === 'not-joined' ? 'أنت غير مسجل في هذه الفعالية.' :
      'لم أجد الفعالية المطلوبة.'
    );
  });

  // 6 — قائمة الحضور
  register('قائمة_الحضور', 'عرض المسجلين في فعالية', async ctx => {
    if (!await requireGroup(ctx)) return;

    const db = await loadDB();
    const group = groupData(db, ctx.jid);
    const event = findEvent(group, input(ctx));

    if (!event) {
      await ctx.reply('لم أجد الفعالية المطلوبة.');
      return;
    }

    await ctx.reply(
      `👥 المسجلون في ${event.title}\n` +
      (event.attendees.length
        ? event.attendees.map((jid, index) => `${index + 1}. @${getMemberName(jid)}`).join('\n')
        : 'لا يوجد مسجلون بعد.'),
      { mentions: event.attendees }
    );
  });

  // 7 — فتح التسجيل
  register('فتح_التسجيل', 'فتح التسجيل في فعالية', async ctx => {
    if (!await requireAdmin(ctx)) return;

    const result = await updateDB(db => {
      const event = findEvent(groupData(db, ctx.jid), input(ctx));
      if (!event) return false;
      event.open = true;
      return true;
    });

    await ctx.reply(result ? '🟢 تم فتح التسجيل.' : 'لم أجد الفعالية المطلوبة.');
  }, { requiresAdmin: true });

  // 8 — إغلاق التسجيل
  register('إغلاق_التسجيل', 'إغلاق التسجيل في فعالية', async ctx => {
    if (!await requireAdmin(ctx)) return;

    const result = await updateDB(db => {
      const event = findEvent(groupData(db, ctx.jid), input(ctx));
      if (!event) return false;
      event.open = false;
      return true;
    });

    await ctx.reply(result ? '🔒 تم إغلاق التسجيل.' : 'لم أجد الفعالية المطلوبة.');
  }, { requiresAdmin: true });

  // 9 — تأجيل فعالية
  register('تأجيل_فعالية', 'تغيير موعد فعالية: الرقم | الموعد الجديد', async ctx => {
    if (!await requireAdmin(ctx)) return;

    const [id, date] = splitFields(input(ctx));
    if (!id || !date) {
      await ctx.reply('استخدم:\n.تأجيل_فعالية رقم_الفعالية | الموعد الجديد');
      return;
    }

    const result = await updateDB(db => {
      const event = findEvent(groupData(db, ctx.jid), id);
      if (!event) return false;
      event.date = date;
      return true;
    });

    await ctx.reply(result ? `📅 تم تحديث موعد الفعالية إلى: ${date}` : 'لم أجد الفعالية المطلوبة.');
  }, { requiresAdmin: true });

  // 10 — إلغاء فعالية
  register('إلغاء_فعالية', 'إلغاء فعالية', async ctx => {
    if (!await requireAdmin(ctx)) return;

    const result = await updateDB(db => {
      const event = findEvent(groupData(db, ctx.jid), input(ctx));
      if (!event) return false;
      event.status = 'ملغاة';
      event.open = false;
      return true;
    });

    await ctx.reply(result ? '🗑️ تم إلغاء الفعالية.' : 'لم أجد الفعالية المطلوبة.');
  }, { requiresAdmin: true });

  // 11 — مسابقة
  register('مسابقة', 'إنشاء مسابقة: العنوان | السؤال | الإجابة', async ctx => {
    if (!await requireAdmin(ctx)) return;

    const [title, question, answer] = splitFields(input(ctx));
    if (!title || !question || !answer) {
      await ctx.reply('استخدم:\n.مسابقة العنوان | السؤال | الإجابة');
      return;
    }

    const contest = await updateDB(db => {
      const group = groupData(db, ctx.jid);
      group.contest = {
        id: makeId('C'),
        title,
        question,
        answer,
        createdAt: Date.now()
      };
      return group.contest;
    });

    await ctx.reply(
      `🏆 بدأت المسابقة: ${contest.title}\n` +
      `❓ ${contest.question}\n\n` +
      'بعد انتهاء المحاولات استخدم .نتائج_المسابقة لعرض الإجابة.'
    );
  }, { requiresAdmin: true });

  // 12 — سؤال اليوم
  register('سؤال_اليوم', 'بدء سؤال اليوم', async ctx => {
    if (!await requireGroup(ctx)) return;
    await startOrAnswerChallenge(ctx, 'سؤال_اليوم', input(ctx));
  });

  // 13 — اللغز السريع
  register('اللغز_السريع', 'بدء اللغز السريع أو إرسال إجابته', async ctx => {
    if (!await requireGroup(ctx)) return;
    await startOrAnswerChallenge(ctx, 'اللغز_السريع', input(ctx));
  });

  // 14 — تحدي السرعة
  register('تحدي_السرعة', 'تحدي الحساب السريع', async ctx => {
    if (!await requireGroup(ctx)) return;
    await startOrAnswerChallenge(ctx, 'تحدي_السرعة', input(ctx));
  });

  // 15 — تحدي الأرقام
  register('تحدي_الأرقام', 'تحدي العمليات الحسابية', async ctx => {
    if (!await requireGroup(ctx)) return;
    await startOrAnswerChallenge(ctx, 'تحدي_الأرقام', input(ctx));
  });

  // 16 — صح أم خطأ
  register('صح_أم_خطأ', 'تحدي صح أم خطأ', async ctx => {
    if (!await requireGroup(ctx)) return;
    await startOrAnswerChallenge(ctx, 'صح_أم_خطأ', input(ctx));
  });

  // 17 — حجر ورقة مقص
  register('حجر_ورقة_مقص', 'اللعب ضد ALVARIA', async ctx => {
    if (!await requireGroup(ctx)) return;

    const choice = normalize(input(ctx));
    const choices = ['حجر', 'ورقة', 'مقص'];

    if (!choices.includes(choice)) {
      await ctx.reply('اختر واحدة:\n.حجر_ورقة_مقص حجر\n.حجر_ورقة_مقص ورقة\n.حجر_ورقة_مقص مقص');
      return;
    }

    const botChoice = choices[Math.floor(Math.random() * choices.length)];
    const win = (
      (choice === 'حجر' && botChoice === 'مقص') ||
      (choice === 'ورقة' && botChoice === 'حجر') ||
      (choice === 'مقص' && botChoice === 'ورقة')
    );

    const draw = choice === botChoice;

    if (win) {
      await updateDB(db => {
        addPoints(groupData(db, ctx.jid), ctx.senderJid, 2);
      });
    }

    await ctx.reply(
      `🎮 اختيارك: ${choice}\n` +
      `❄️ اختيار ALVARIA: ${botChoice}\n\n` +
      (draw ? '🤝 تعادل!' : win ? '🏆 فزت! +2 نقطة.' : 'حاول مرة أخرى!')
    );
  });

  // 18 — تحدي المعرفة
  register('تحدي_المعرفة', 'أسئلة المعرفة العامة', async ctx => {
    if (!await requireGroup(ctx)) return;
    await startOrAnswerChallenge(ctx, 'تحدي_المعرفة', input(ctx));
  });

  // 19 — تحدي الحروف
  register('تحدي_الحروف', 'تحدي الكلمات والحروف', async ctx => {
    if (!await requireGroup(ctx)) return;
    await startOrAnswerChallenge(ctx, 'تحدي_الحروف', input(ctx));
  });

  // 20 — تحدي الإيموجي
  register('تحدي_الإيموجي', 'تخمين معنى الإيموجي', async ctx => {
    if (!await requireGroup(ctx)) return;
    await startOrAnswerChallenge(ctx, 'تحدي_الإيموجي', input(ctx));
  });

  // 21 — سحب عشوائي
  register('سحب_عشوائي', 'اختيار شخص عشوائي من المسجلين', async ctx => {
    if (!await requireAdmin(ctx)) return;

    const db = await loadDB();
    const group = groupData(db, ctx.jid);
    const event = findEvent(group, input(ctx));

    if (!event || !event.attendees.length) {
      await ctx.reply('لا توجد فعالية بهذا الرقم أو لا يوجد مسجلون فيها.');
      return;
    }

    const winner = event.attendees[Math.floor(Math.random() * event.attendees.length)];

    await updateDB(data => {
      addPoints(groupData(data, ctx.jid), winner, 5);
    });

    await ctx.reply(
      `🎉 الفائز بالسحب: @${getMemberName(winner)}\n⭐ حصل على 5 نقاط!`,
      { mentions: [winner] }
    );
  }, { requiresAdmin: true });

  // 22 — اختيار فائز
  register('اختيار_فائز', 'اختيار فائز من المسجلين في فعالية', async ctx => {
    if (!await requireAdmin(ctx)) return;

    const db = await loadDB();
    const group = groupData(db, ctx.jid);
    const event = findEvent(group, input(ctx));

    if (!event || !event.attendees.length) {
      await ctx.reply('لا توجد أسماء مسجلة للاختيار منها.');
      return;
    }

    const winner = event.attendees[Math.floor(Math.random() * event.attendees.length)];

    await updateDB(data => {
      addPoints(groupData(data, ctx.jid), winner, 5);
    });

    await ctx.reply(
      `🏆 تم اختيار الفائز: @${getMemberName(winner)}\n⭐ +5 نقاط`,
      { mentions: [winner] }
    );
  }, { requiresAdmin: true });

  // 23 — نقاطي
  register('نقاطي', 'عرض نقاطك في الفعاليات', async ctx => {
    if (!await requireGroup(ctx)) return;

    const db = await loadDB();
    const group = groupData(db, ctx.jid);
    await ctx.reply(`⭐ نقاطك في فعاليات ALVARIA: ${group.points[ctx.senderJid] || 0}`);
  });

  // 24 — ترتيب الفعاليات
  register('ترتيب_الفعاليات', 'لوحة ترتيب نقاط الأعضاء', async ctx => {
    if (!await requireGroup(ctx)) return;

    const db = await loadDB();
    const group = groupData(db, ctx.jid);

    const ranking = Object.entries(group.points)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15);

    await ctx.reply(
      '🏆 ترتيب نقاط الفعاليات\n\n' +
      (ranking.length
        ? ranking.map(([jid, points], index) =>
            `${index + 1}. @${getMemberName(jid)} — ${points} نقطة`
          ).join('\n')
        : 'لا توجد نقاط مسجلة بعد.'),
      { mentions: ranking.map(([jid]) => jid) }
    );
  });

  // 25 — نتائج المسابقة
  register('نتائج_المسابقة', 'عرض إجابة المسابقة الحالية', async ctx => {
    if (!await requireGroup(ctx)) return;

    const db = await loadDB();
    const contest = groupData(db, ctx.jid).contest;

    if (!contest) {
      await ctx.reply('لا توجد مسابقة محفوظة حاليًا.');
      return;
    }

    await ctx.reply(
      `🏆 نتائج المسابقة: ${contest.title}\n` +
      `❓ السؤال: ${contest.question}\n` +
      `✅ الإجابة المعتمدة: ${contest.answer}`
    );
  });

  // 26 — التصويت وإنشاء الاستطلاع
  register('تصويت_فعالية', 'إنشاء تصويت أو التصويت: السؤال | خيار 1 | خيار 2', async ctx => {
    if (!await requireGroup(ctx)) return;

    const parts = splitFields(input(ctx));
    const possiblePoll = parts[0];
    const db = await loadDB();
    const existing = groupData(db, ctx.jid).polls.find(poll => poll.id === possiblePoll
);

    if (existing) {
      const selected = parts.slice(1).join('|').trim();

      if (!selected) {
        await ctx.reply('اكتب رقم الاستطلاع ثم الخيار.\nمثال: .تصويت_فعالية P123 | الخيار الأول');
        return;
      }

      const result = await updateDB(data => {
        const poll = groupData(data, ctx.jid).polls.find(item => item.id === possiblePoll);
        if (!poll) return 'missing';

        const option = poll.options.find(item => normalize(item.name) === normalize(selected));
        if (!option) return 'invalid';

        for (const item of poll.options) {
          item.voters = item.voters.filter(jid => jid !== ctx.senderJid);
        }

        option.voters.push(ctx.senderJid);
        return 'voted';
      });

      await ctx.reply(
        result === 'voted' ? '🗳️ تم تسجيل تصويتك.' :
        result === 'invalid' ? 'هذا الخيار غير موجود في الاستطلاع.' :
        'الاستطلاع غير موجود.'
      );
      return;
    }

    if (!ctx.isAdmin) {
      await ctx.reply('إنشاء استطلاع جديد مخصص للمشرفين. للتصويت استخدم رقم الاستطلاع ثم الخيار.');
      return;
    }

    const [question, ...options] = parts;

    if (!question || options.length < 2) {
      await ctx.reply('استخدم:\n.تصويت_فعالية السؤال | الخيار الأول | الخيار الثاني');
      return;
    }

    const poll = await updateDB(data => {
      const group = groupData(data, ctx.jid);
      const item = {
        id: makeId('P'),
        question,
        options: options.map(name => ({ name, voters: [] })),
        createdAt: Date.now()
      };
      group.polls.push(item);
      return item;
    });

    await ctx.reply(
      `🗳️ تم إنشاء التصويت!\n🆔 ${poll.id}\n❓ ${poll.question}\n\n` +
      poll.options.map(option => `• ${option.name}`).join('\n') +
      `\n\nللتصويت:\n.تصويت_فعالية ${poll.id} | اسم الخيار`
    );
  });

  // 27 — نتيجة التصويت
  register('نتيجة_التصويت', 'عرض نتائج استطلاع', async ctx => {
    if (!await requireGroup(ctx)) return;

    const db = await loadDB();
    const group = groupData(db, ctx.jid);
    const poll = group.polls.find(item => item.id === input(ctx));

    if (!poll) {
      await ctx.reply('لم أجد الاستطلاع. استخدم رقم الاستطلاع الصحيح.');
      return;
    }

    await ctx.reply(
      `🗳️ ${poll.question}\n\n` +
      poll.options.map(option =>
        `• ${option.name}: ${option.voters.length} صوت`
      ).join('\n') +
      `\n\n👥 مجموع الأصوات: ${poll.options.reduce((sum, option) => sum + option.voters.length, 0)}`
    );
  });

  // 28 — تذكير فعالية
  register('تذكير_فعالية', 'إرسال تذكير يدوي للمسجلين', async ctx => {
    if (!await requireAdmin(ctx)) return;

    const db = await loadDB();
    const event = findEvent(groupData(db, ctx.jid), input(ctx));

    if (!event) {
      await ctx.reply('لم أجد الفعالية المطلوبة.');
      return;
    }

    const mentions = event.attendees || [];

    await ctx.reply(
      `🔔 تذكير بفعالية: ${event.title}\n` +
      `📅 الموعد: ${event.date || 'غير محدد'}\n` +
      `📝 ${event.description || 'ننتظركم للمشاركة!'}\n\n` +
      (mentions.length
        ? mentions.map(jid => `@${getMemberName(jid)}`).join(' ')
        : 'لا يوجد مسجلون بعد.'),
      { mentions }
    );
  }, { requiresAdmin: true });

  // 29 — قواعد الفعالية
  register('قواعد_الفعالية', 'عرض قواعد الفعاليات أو تعديلها', async ctx => {
    if (!await requireGroup(ctx)) return;

    const text = input(ctx);

    if (text) {
      if (!ctx.isAdmin) {
        await ctx.reply('🔒 تعديل القواعد للمشرفين فقط.');
        return;
      }

      await updateDB(db => {
        groupData(db, ctx.jid).rules = text;
      });

      await ctx.reply('📜 تم حفظ قواعد الفعاليات.');
      return;
    }

    const db = await loadDB();
    const rules = groupData(db, ctx.jid).rules;

    await ctx.reply(
      '📜 قواعد الفعاليات\n\n' +
      (rules || 'لم يضع المشرفون قواعد خاصة بعد.') +
      '\n\nيمكن للمشرف تعديلها بكتابة:\n.قواعد_الفعالية القواعد الجديدة'
    );
  });

  // 30 — المساعدة
  register('مساعدة_الفعاليات', 'عرض دليل أوامر الفعاليات الثلاثين', async ctx => {
    const groups = [
      {
        title: '🎟️ إدارة الفعاليات والمشاركة',
        commands: [
          ['فعالية_جديدة', 'إنشاء فعالية جديدة للمجموعة.'],
          ['الفعاليات', 'عرض الفعاليات المتاحة.'],
          ['تفاصيل_فعالية', 'عرض تفاصيل فعالية محددة.'],
          ['انضمام_فعالية', 'التسجيل للمشاركة في فعالية.'],
          ['انسحاب_فعالية', 'الانسحاب من فعالية.'],
          ['قائمة_الحضور', 'عرض قائمة المشاركين والحضور.'],
          ['فتح_التسجيل', 'فتح التسجيل للمشاركين.'],
          ['إغلاق_التسجيل', 'إغلاق التسجيل في الفعالية.'],
          ['تأجيل_فعالية', 'تأجيل موعد فعالية.'],
          ['إلغاء_فعالية', 'إلغاء فعالية.'],
          ['تذكير_فعالية', 'إرسال تذكير بفعالية.']
        ]
      },
      {
        title: '🎮 المسابقات والتحديات',
        commands: [
          ['مسابقة', 'بدء مسابقة للمجموعة.'],
          ['نتائج_المسابقة', 'عرض نتائج المسابقة.'],
          ['سؤال_اليوم', 'عرض سؤال اليوم.'],
          ['اللغز_السريع', 'تقديم لغز سريع للمشاركين.'],
          ['تحدي_السرعة', 'بدء تحدي السرعة.'],
          ['تحدي_الأرقام', 'بدء تحدي الأرقام.'],
          ['صح_أم_خطأ', 'تحدي معلومات بصيغة صح أو خطأ.'],
          ['حجر_ورقة_مقص', 'لعبة حجر ورقة مقص.'],
          ['تحدي_المعرفة', 'اختبار المعرفة العامة.'],
          ['تحدي_الحروف', 'تحدي الحروف والكلمات.'],
          ['تحدي_الإيموجي', 'تخمين المعنى من الإيموجيات.']
        ]
      },
      {
        title: '🏆 النقاط والنتائج',
        commands: [
          ['سحب_عشوائي', 'اختيار مشارك عشوائيًا.'],
          ['اختيار_فائز', 'اختيار فائز من المشاركين.'],
          ['نقاطي', 'عرض نقاطك في الفعاليات.'],
          ['ترتيب_الفعاليات', 'عرض ترتيب المشاركين.']
        ]
      },
      {
        title: '🗳️ التصويت والقواعد',
        commands: [
          ['تصويت_فعالية', 'إنشاء تصويت متعلق بفعالية.'],
          ['نتيجة_التصويت', 'عرض نتائج التصويت.'],
          ['قواعد_الفعالية', 'عرض قواعد الفعاليات أو تعديلها للمشرف.']
        ]
      }
    ];

    const helpText = [
      '*╭━━〔 ❄️ 𝑨𝑳𝑽𝑨𝑹𝑰𝑨 〕━━╮*',
      '',
      '*🎟️ مَـرْكَـزُ الـفَـعَـالِـيَّـات*',
      '*『 𝑨𝑳𝑽𝑨𝑹𝑰𝑨 • 𝑬𝑽𝑬𝑵𝑻𝑺 』*',
      '',
      '*❅ دَلِـيـلُ أَوَامِـرِ الـفَـعَـالِـيَّـات ❅*',
      ...groups.flatMap(group => [
        `*${group.title}*`,
        ...group.commands.flatMap(([name, description]) => [
          `*•┆🎟️〖 .${name} 〗*`,
          `⟞ ${description}`,
          ''
        ])
      ]),
      '*•┆📖〖 .مساعدة_الفعاليات 〗*',
      '⟞ عرض دليل أوامر الفعاليات.',
      '',
      '📌 استخدم الرمز | للفصل بين بيانات إنشاء الفعالية.',
      '',
      '*╰━━〔 ❄️ 𝑨𝑳𝑽𝑨𝑹𝑰𝑨 • 𝑬𝑽𝑬𝑵𝑻𝑺 〕━━╯*'
    ].join('\n');

    await ctx.reply(helpText);
  });
}
