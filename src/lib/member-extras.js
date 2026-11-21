import fs from 'node:fs/promises';
import path from 'node:path';

const MAX_LOGS = 1000;
const MAX_NOTES = 100;
const MAX_ACTIVITY_USERS = 5000;

const cleanJid = value =>
  String(value || '').trim().replace(/:\d+@/, '@');

const userJid = value =>
  typeof value === 'string' &&
  (value.endsWith('@s.whatsapp.net') ||
   value.endsWith('@c.us') ||
   value.endsWith('@lid'));

const keyOf = (group, user) =>
  `${group}|${cleanJid(user)}`;

export function createMemberExtras(databaseDir, logger = console) {
  const file = path.join(databaseDir, 'member-extras.json');
  let data;

  let queue = Promise.resolve();

  async function load() {
    if (data) return data;

    try {
      const parsed = JSON.parse(await fs.readFile(file, 'utf8'));
      data = {
        notes: parsed.notes || {},
        activity: parsed.activity || {},
        membership: Array.isArray(parsed.membership)
          ? parsed.membership.slice(-MAX_LOGS) : [],
        restrictions: parsed.restrictions || {},
        exceptions: parsed.exceptions || {}
      };
    } catch {
      data = {
        notes: {},
        activity: {},
        membership: [],
        restrictions: {},
        exceptions: {}
      };
    }

    return data;
  }

  async function save() {
    const current = await load();

    queue = queue.then(async () => {
      await fs.mkdir(databaseDir, { recursive: true });
      const temp = file + '.tmp';
      await fs.writeFile(temp, JSON.stringify(current, null, 2));
      await fs.rename(temp, file);
    }).catch(error => {
      logger.error?.({ err: error }, 'Member extras save failed');
    });

    await queue;
  }

  function groupKey(ctx, target) {
    return keyOf(ctx.jid, target);
  }

  async function requireGroup(ctx) {
    if (!ctx.jid?.endsWith('@g.us')) {
      await ctx.reply('⛔ هذا الأمر يعمل داخل المجموعات فقط.');
      return false;
    }

    if (!ctx.isAdmin) {
      await ctx.reply('🔒 هذا الأمر للمشرفين فقط.');
      return false;
    }

    return true;
  }

  async function target(ctx) {
    const mentioned = [];
    const walk = value => {
      if (!value || typeof value !== 'object') return;
      if (Array.isArray(value)) {
        value.forEach(walk);
        return;
      }
      if (Array.isArray(value.mentionedJid)) {
        mentioned.push(...value.mentionedJid);
      }
      Object.values(value).forEach(item => {
        if (item && typeof item === 'object') walk(item);
      });
    };

    walk(ctx.message?.message);

    if (mentioned.find(userJid)) return mentioned.find(userJid);

    if (userJid(ctx.quotedParticipant)) return ctx.quotedParticipant;

    const first = String(ctx.args?.[0] || '').trim();

    if (/^\d{8,15}$/.test(first)) {
      return `${first}@s.whatsapp.net`;
    }

    if (userJid(first)) return first;

    return null;
  }

  async function metadata(ctx) {
    return ctx.sock.groupMetadata(ctx.jid);
  }

  async function participants(ctx) {
    const info = await metadata(ctx);
    return info.participants || [];
  }

  function participantIds(item) {
    return [item.id, item.lid, item.jid, item.phoneNumber]
      .filter(Boolean)
      .map(cleanJid);
  }

  async function findMember(ctx, wanted) {
    const list = await participants(ctx);
    return list.find(item =>
      participantIds(item).includes(cleanJid(wanted))
    );
  }

  async function mentionReply(ctx, text, users = []) {
    await ctx.reply(text, {
      mentions: users.filter(userJid)
    });
  }

  async function addMembership(group, action, user, actor = null) {
    const db = await load();

    db.membership.push({
      group,
      action,
      user: user || null,
      actor,
      time: Date.now()
    });

    db.membership = db.membership.slice(-MAX_LOGS);
    await save();
  }

  // 1 — إضافة ملاحظة.
  async function addNote(ctx) {
    if (!await requireGroup(ctx)) return;
    const who = await target(ctx);
    if (!who) return ctx.reply('📌 منشن العضو أو رد على رسالته.');
    const content = ctx.args.slice(1).join(' ').trim();
    if (!content) return ctx.reply('اكتب الملاحظة بعد منشن العضو.');

    const db = await load();
    const key = groupKey(ctx, who);
    db.notes[key] ||= [];

    if (db.notes[key].length >= MAX_NOTES) {
      return ctx.reply('وصلت الملاحظات إلى الحد الأقصى.');
    }

    db.notes[key].push({
      text: content.slice(0, 500),
      actor: ctx.senderJid,
      time: Date.now()
    });

    await save();
    await ctx.reply('📝 تمت إضافة الملاحظة.');
  }

  // 2 — عرض الملاحظات.
  async function showNotes(ctx) {
    if (!await requireGroup(ctx)) return;
    const who = await target(ctx);
    if (!who) return ctx.reply('📌 حدد العضو أولًا.');

    const db = await load();
    const list = db.notes[groupKey(ctx, who)] || [];

    await ctx.reply(
      list.length
        ? '📝 ملاحظات العضو:\n' +
          list.map((x, i) =>
            `${i + 1}. ${x.text}`
          ).join('\n')
        : 'لا توجد ملاحظات.'
    );
  }

  // 3 — حذف آخر ملاحظة.
  async function deleteNote(ctx) {
    if (!await requireGroup(ctx)) return;
    const who = await target(ctx);
    if (!who) return ctx.reply('📌 حدد العضو.');

    const db = await load();
    const key = groupKey(ctx, who);
    const list = db.notes[key] || [];

    if (!list.length) return ctx.reply('لا توجد ملاحظات لحذفها.');

    list.pop();
    if (!list.length) delete db.notes[key];

    await save();
    await ctx.reply('🧹 تم حذف آخر ملاحظة.');
  }

  // 4 — بطاقة العضو.
  async function memberCard(ctx) {
    if (!await requireGroup(ctx)) return;
    const who = await target(ctx);
    if (!who) return ctx.reply('📌 حدد العضو.');

    const member = await findMember(ctx, who);
    if (!member) return ctx.reply('العضو غير موجود.');

    const db = await load();
    const key = groupKey(ctx, who);

    await ctx.reply(
      `╭━━〔 ❄️ بطاقة العضو 〕━━╮\n` +
      `👤 ${member.id}\n` +
      `⭐ الصفة: ${member.admin || 'عضو'}\n` +
      `📝 الملاحظات: ${(db.notes[key] || []).length}\n` +
      `📊 الرسائل المسجلة: ${db.activity[key]?.count || 0}\n` +
      `╰━━〔 ALVARIA 〕━━╯`
    );
  }

  // 5 — البحث عن عضو بالرقم أو المعرف.
  async function searchMember(ctx) {
    if (!await requireGroup(ctx)) return;
    const query = String(ctx.args?.[0] || '').trim();
    if (!query) return ctx.reply('اكتب رقم العضو أو جزءًا من معرفه.');

    const list = await participants(ctx);
    const found = list.filter(item =>
      participantIds(item).some(id => id.includes(query))
    ).slice(0, 20);

    await ctx.reply(
      found.length
        ? '🔎 نتائج البحث:\n' +
          found.map(x =>
            `• ${x.id} — ${x.admin || 'عضو'}`
          ).join('\n')
        : 'لم يتم العثور على عضو.'
    );
  }

  // 6 — قائمة الأعضاء.
  async function listMembers(ctx) {
    if (!await requireGroup(ctx)) return;
    const list = await participants(ctx);
    await ctx.reply(
      `👥 أعضاء المجموعة (${list.length}):\n` +
      list.slice(0, 100).map(x => `• ${x.id}`).join('\n')
    );
  }

  // 7 — قائمة المشرفين.
  async function listAdmins(ctx) {
    if (!await requireGroup(ctx)) return;
    const list = (await participants(ctx))
      .filter(x => ['admin', 'superadmin'].includes(x.admin));

    await ctx.reply(
      `🛡️ المشرفون (${list.length}):\n` +
      list.map(x => `• ${x.id}`).join('\n')
    );
  }

  // 8 — قائمة الأعضاء العاديين.
  async function listRegular(ctx) {
    if (!await requireGroup(ctx)) return;
    const list = (await participants(ctx))
      .filter(x => !x.admin);

    await ctx.reply(
      `👤 الأعضاء غير المشرفين (${list.length}):\n` +
      list.slice(0, 100).map(x => `• ${x.id}`).join('\n')
    );
  }

  // 9 — عدد الأعضاء.
  async function memberCount(ctx) {
    if (!await requireGroup(ctx)) return;
    const list = await participants(ctx);
    await ctx.reply(`👥 عدد أعضاء المجموعة: ${list.length}`);
  }

  // 10 — التحقق من العضوية.
  async function checkMembership(ctx) {
    if (!await requireGroup(ctx)) return;
    const who = await target(ctx);
    if (!who) return ctx.reply('حدد العضو.');
    const member = await findMember(ctx, who);
    await ctx.reply(member ? '✅ العضو موجود.' : '❌ العضو غير موجود.');
  }

  // 11 — تسجيل نشاط الرسائل.
  async function recordActivity(group, sender) {
    if (!group?.endsWith('@g.us') || !userJid(sender)) return;

    const db = await load();
    const key = keyOf(group, sender);

    db.activity[key] ||= {
      count: 0,
      firstSeen: Date.now(),
      lastSeen: Date.now()
    };

    db.activity[key].count++;
    db.activity[key].lastSeen = Date.now();

    const keys = Object.keys(db.activity);
    if (keys.length > MAX_ACTIVITY_USERS) {
      const oldest = keys.sort((a, b) =>
        db.activity[a].lastSeen - db.activity[b].lastSeen
      );
      for (const old of oldest.slice(0, keys.length - MAX_ACTIVITY_USERS)) {
        delete db.activity[old];
      }
    }

    await save();
  }

  // 12 — نشاط عضو.
  async function memberActivity(ctx) {
    if (!await requireGroup(ctx)) return;
    const who = await target(ctx);
    if (!who) return ctx.reply('حدد العضو.');

    const db = await load();
    const item = db.activity[groupKey(ctx, who)];

    await ctx.reply(
      item
        ? `📊 الرسائل المسجلة: ${item.count}\nآخر نشاط: ${new Date(item.lastSeen).toLocaleString()}`
        : 'لا توجد بيانات نشاط مسجلة لهذا العضو.'
    );
  }

  async function rankedActivity(ctx, descending = true) {
    if (!await requireGroup(ctx)) return;
    const db = await load();
    const prefix = `${ctx.jid}|`;

    const rows = Object.entries(db.activity)
      .filter(([key]) => key.startsWith(prefix))
      .sort((a, b) => descending
        ? b[1].count - a[1].count
        : a[1].count - b[1].count
      ).slice(0, 10);

    await ctx.reply(
      rows.length
        ? rows.map(([key, item], i) =>
            `${i + 1}. ${key.slice(prefix.length)} — ${item.count}`
          ).join('\n')
        : 'لا توجد إحصائيات بعد.'
    );
  }

  // 13 — الأكثر نشاطًا.
  async function mostActive(ctx) {
    return rankedActivity(ctx, true);
  }

  // 14 — الأقل نشاطًا.
  async function leastActive(ctx) {
    return rankedActivity(ctx, false);
  }

  // 15 — تصفير نشاط عضو.
  async function clearActivity(ctx) {
    if (!await requireGroup(ctx)) return;
    const who = await target(ctx);
    if (!who) return ctx.reply('حدد العضو.');

    const db = await load();
    delete db.activity[groupKey(ctx, who)];
    await save();
    await ctx.reply('🧹 تم تصفير نشاط العضو.');
  }

  // 16 — آخر المنضمين.
  async function recentJoins(ctx) {
    if (!await requireGroup(ctx)) return;
    const db = await load();
    const rows = db.membership.filter(x =>
      x.group === ctx.jid && x.action === 'add'
    ).slice(-15).reverse();

    await ctx.reply(
      rows.length
        ? rows.map(x => `• ${x.user}`).join('\n')
        : 'لا يوجد سجل انضمام بعد تفعيل التسجيل.'
    );
  }

  // 17 — آخر المغادرين.
  async function recentLeaves(ctx) {
    if (!await requireGroup(ctx)) return;
    const db = await load();
    const rows = db.membership.filter(x =>
      x.group === ctx.jid && x.action === 'remove'
    ).slice(-15).reverse();

    await ctx.reply(
      rows.length
        ? rows.map(x => `• ${x.user}`).join('\n')
        : 'لا يوجد سجل مغادرة مسجل.'
    );
  }

  // 18 — سجل الانضمام.
  async function joinHistory(ctx) {
    return recentJoins(ctx);
  }

  // 19 — سجل المغادرة.
  async function leaveHistory(ctx) {
    return recentLeaves(ctx);
  }

  // 20 — سجل تغييرات الإشراف.
  async function adminHistory(ctx) {
    if (!await requireGroup(ctx)) return;
    const db = await load();
    const rows = db.membership.filter(x =>
      x.group === ctx.jid &&
      ['promote', 'demote'].includes(x.action)
    ).slice(-20).reverse();

    await ctx.reply(
      rows.length
        ? rows.map(x =>
            `• ${x.action}: ${x.user} — ${new Date(x.time).toLocaleString()}`
          ).join('\n')
        : 'لا توجد تغييرات إشراف مسجلة.'
    );
  }

  // 21 — تقييد أوامر عضو.
  async function restrict(ctx) {
    if (!await requireGroup(ctx)) return;
    const who = await target(ctx);
    if (!who) return ctx.reply('حدد العضو.');

    const member = await findMember(ctx, who);
    if (!member) return ctx.reply('العضو غير موجود.');
    if (member.admin) return ctx.reply('لا يمكن تقييد مشرف.');

    const db = await load();
    const key = groupKey(ctx, who);
    if (db.exceptions[key]) return ctx.reply('هذا العضو لديه استثناء.');

    db.restrictions[key] = {
      actor: ctx.senderJid,
      time: Date.now()
    };

    await save();
    await ctx.reply('🔒 تم تقييد استخدام أوامر ALVARIA لهذا العضو.');
  }

  // 22 — فك التقييد.
  async function unrestrict(ctx) {
    if (!await requireGroup(ctx)) return;
    const who = await target(ctx);
    if (!who) return ctx.reply('حدد العضو.');

    const db = await load();
    delete db.restrictions[groupKey(ctx, who)];
    await save();
    await ctx.reply('🔓 تم فك التقييد.');
  }

  // 23 — قائمة المقيدين.
  async function restrictedList(ctx) {
    if (!await requireGroup(ctx)) return;
    const db = await load();
    const prefix = `${ctx.jid}|`;
    const rows = Object.keys(db.restrictions)
      .filter(key => key.startsWith(prefix));

    await ctx.reply(
      rows.length
        ? rows.map(key => `• ${key.slice(prefix.length)}`).join('\n')
        : 'لا يوجد أعضاء مقيدون.'
    );
  }

  // 24 — إضافة استثناء.
  async function addException(ctx) {
    if (!await requireGroup(ctx)) return;
    const who = await target(ctx);
    if (!who) return ctx.reply('حدد العضو.');

    const member = await findMember(ctx, who);
    if (!member) return ctx.reply('العضو غير موجود.');

    const db = await load();
    const key = groupKey(ctx, who);
    db.exceptions[key] = {
      actor: ctx.senderJid,
      time: Date.now()
    };
    delete db.restrictions[key];

    await save();
    await ctx.reply('✅ تمت إضافة استثناء من تقييد أوامر البوت.');
  }

  // 25 — إزالة استثناء.
  async function removeException(ctx) {
    if (!await requireGroup(ctx)) return;
    const who = await target(ctx);
    if (!who) return ctx.reply('حدد العضو.');

    const db = await load();
    delete db.exceptions[groupKey(ctx, who)];
    await save();
    await ctx.reply('تمت إزالة الاستثناء.');
  }

  async function isRestricted(group, sender) {
    const db = await load();
    const key = keyOf(group, sender);

    if (db.exceptions[key]) return false;
    return Boolean(db.restrictions[key]);
  }

  async function recordParticipantUpdate(update) {
    const group = update?.id;
    const action = update?.action;
    if (!group?.endsWith('@g.us')) return;

    if (!['add', 'remove', 'promote', 'demote'].includes(action)) {
      return;
    }

    for (const person of update.participants || []) {
      await addMembership(
        group,
        action,
        person,
        update.author || update.authorPn || null
      );
    }
  }

  return {
    addNote, showNotes, deleteNote, memberCard, searchMember,
    listMembers, listAdmins, listRegular, memberCount, checkMembership,
    recordActivity, memberActivity, mostActive, leastActive, clearActivity,
    recentJoins, recentLeaves, joinHistory, leaveHistory, adminHistory,
    restrict, unrestrict, restrictedList, addException, removeException,
    isRestricted, recordParticipantUpdate
  };
}


export function registerMemberExtrasCommands(coreCommands) {
  const actions = [
    ['ملاحظة_عضو', 'إضافة ملاحظة لعضو', 'addNote'],
    ['ملاحظات_عضو', 'عرض ملاحظات عضو', 'showNotes'],
    ['حذف_ملاحظة', 'حذف آخر ملاحظة لعضو', 'deleteNote'],
    ['بطاقة_عضو', 'عرض بطاقة العضو', 'memberCard'],
    ['بحث_عضو', 'البحث عن عضو', 'searchMember'],

    ['أعضاء_المجموعة', 'عرض أعضاء المجموعة', 'listMembers'],
    ['مشرفو_المجموعة', 'عرض المشرفين', 'listAdmins'],
    ['الأعضاء_العاديون', 'عرض الأعضاء غير المشرفين', 'listRegular'],
    ['عدد_الأعضاء', 'عدد أعضاء المجموعة', 'memberCount'],
    ['تحقق_العضوية', 'التحقق من عضوية شخص', 'checkMembership'],

    ['نشاط_عضو', 'عرض نشاط عضو', 'memberActivity'],
    ['الأكثر_نشاطا', 'الأعضاء الأكثر نشاطًا', 'mostActive'],
    ['الأقل_نشاطا', 'الأعضاء الأقل نشاطًا', 'leastActive'],
    ['تصفير_نشاط', 'تصفير نشاط عضو', 'clearActivity'],

    ['آخر_المنضمين', 'آخر الأعضاء المنضمين', 'recentJoins'],
    ['آخر_المغادرين', 'آخر الأعضاء المغادرين', 'recentLeaves'],
    ['سجل_الانضمام', 'سجل الانضمام', 'joinHistory'],
    ['سجل_المغادرة', 'سجل المغادرة', 'leaveHistory'],
    ['سجل_الإشراف', 'سجل تغييرات الإشراف', 'adminHistory'],

    ['تقييد_أوامر', 'منع عضو من استخدام أوامر البوت', 'restrict'],
    ['فك_تقييد_أوامر', 'السماح لعضو باستخدام أوامر البوت', 'unrestrict'],
    ['المقيدون', 'قائمة الأعضاء المقيدين', 'restrictedList'],
    ['إضافة_استثناء', 'إعفاء عضو من تقييد أوامر البوت', 'addException'],
    ['إزالة_استثناء', 'إزالة استثناء عضو', 'removeException'],
    ['ملاحظة', 'إضافة ملاحظة لنفسك أو لعضو محدد', 'addNote'],
    ['ملاحظات', 'عرض الملاحظات', 'showNotes'],
    ['بطاقة', 'عرض بطاقة العضو', 'memberCard'],
    ['بحث', 'البحث عن عضو', 'searchMember'],
    ['نشاط', 'عرض نشاط العضو', 'memberActivity'],
  ];

  for (const [name, description, method] of actions) {
    coreCommands.set(name, {
      description,
      requiresAdmin: true,
      reaction: '❄️',
      handler: async ctx => {
        if (!ctx.memberExtras) {
          await ctx.reply('❌ نظام الوظائف الإضافية غير جاهز.');
          return;
        }
        await ctx.memberExtras[method](ctx);
      }
    });
  }
}
