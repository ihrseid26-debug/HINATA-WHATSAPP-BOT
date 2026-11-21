import fs from 'node:fs/promises';
import path from 'node:path';

const MAX_LOGS = 300;
const MAX_WARNINGS = 20;

function normalizeJid(value) {
  return String(value || '').trim().replace(/:\d+@/, '@');
}

function isUserJid(value) {
  return typeof value === 'string' &&
    (value.endsWith('@s.whatsapp.net') ||
     value.endsWith('@c.us') ||
     value.endsWith('@lid'));
}

function getParticipant(message) {
  const key = message?.key || {};
  return key.participant || key.participantAlt ||
    message?.participant || message?.participantAlt || null;
}

function getMentioned(message) {
  const result = [];
  const walk = value => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    if (Array.isArray(value.mentionedJid)) {
      result.push(...value.mentionedJid);
    }
    for (const item of Object.values(value)) {
      if (item && typeof item === 'object') walk(item);
    }
  };
  walk(message?.message);
  return result.filter(isUserJid);
}

function parseDuration(value) {
  if (!value) return null;
  const text = String(value).trim().toLowerCase();
  if (['دائم', 'دائما', 'دائمًا', 'permanent', 'forever'].includes(text)) {
    return 0;
  }

  const match = text.match(/^(\d{1,5})(s|m|h|d)$/);
  if (!match) return null;

  const amount = Number(match[1]);
  const unit = { s: 1000, m: 60000, h: 3600000, d: 86400000 }[match[2]];
  const duration = amount * unit;

  // حماية من مدة خاطئة أو ضخمة.
  if (!Number.isFinite(duration) || duration < 10000 ||
      duration > 30 * 86400000) return null;

  return duration;
}

export function createMemberManager(databaseDir, logger = console) {
  const file = path.join(databaseDir, 'member-management.json');
  let data = null;
  let queue = Promise.resolve();

  async function load() {
    if (data) return data;
    try {
      const parsed = JSON.parse(await fs.readFile(file, 'utf8'));
      data = {
        warnings: parsed.warnings && typeof parsed.warnings === 'object'
          ? parsed.warnings : {},
        mutes: parsed.mutes && typeof parsed.mutes === 'object'
          ? parsed.mutes : {},
        logs: Array.isArray(parsed.logs) ? parsed.logs.slice(-MAX_LOGS) : []
      };
    } catch {
      data = { warnings: {}, mutes: {}, logs: [] };
    }
    return data;
  }

  async function save() {
    const current = await load();
    queue = queue.then(async () => {
      await fs.mkdir(databaseDir, { recursive: true });
      const temporary = file + '.tmp';
      await fs.writeFile(temporary, JSON.stringify(current, null, 2));
      await fs.rename(temporary, file);
    }).catch(error => {
      logger.error?.({ err: error }, 'Member database save failed');
    });
    await queue;
  }

  function groupUserKey(group, user) {
    return `${group}|${normalizeJid(user)}`;
  }

  async function addLog(group, type, target, actor, extra = {}) {
    const db = await load();
    db.logs.push({
      group,
      type,
      target: target || null,
      actor: actor || null,
      extra,
      time: Date.now()
    });
    db.logs = db.logs.slice(-MAX_LOGS);
    await save();
  }

  async function resolveTarget(ctx) {
    const mentions = getMentioned(ctx.message);
    if (mentions.length) return mentions[0];

    const quoted = ctx.quotedParticipant;
    if (isUserJid(quoted)) return quoted;

    const first = String(ctx.args?.[0] || '').trim();
    if (/^\d{8,15}$/.test(first)) return `${first}@s.whatsapp.net`;
    if (isUserJid(first)) return first;

    return null;
  }

  async function getMetadata(ctx) {
    return ctx.sock.groupMetadata(ctx.jid);
  }

  async function findParticipant(ctx, target) {
    const metadata = await getMetadata(ctx);
    const wanted = new Set([normalizeJid(target)]);
    const participant = metadata.participants?.find(item => {
      const ids = [item.id, item.lid, item.jid, item.phoneNumber]
        .filter(Boolean).map(normalizeJid);
      return ids.some(id => wanted.has(id));
    });
    return { metadata, participant };
  }

  async function botIsAdmin(ctx, metadata) {
    const botIds = new Set([
      normalizeJid(ctx.sock.user?.id),
      normalizeJid(ctx.sock.user?.lid)
    ].filter(Boolean));

    return Boolean(metadata.participants?.some(item => {
      const ids = [item.id, item.lid, item.jid].filter(Boolean)
        .map(normalizeJid);
      return ids.some(id => botIds.has(id)) &&
        ['admin', 'superadmin'].includes(item.admin);
    }));
  }

  async function requireGroup(ctx) {
    if (!ctx.jid.endsWith('@g.us')) {
      await ctx.reply('⛔ هذا الأمر يعمل داخل المجموعات فقط.');
      return false;
    }
    if (!ctx.isAdmin) {
      await ctx.reply('🔒 هذا الأمر للمشرفين فقط.');
      return false;
    }
    return true;
  }

  async function requireBotAdmin(ctx, metadata) {
    if (!await botIsAdmin(ctx, metadata)) {
      await ctx.reply('⚠️ يجب أن يكون ALVARIA مشرفًا لتنفيذ هذا الإجراء.');
      return false;
    }
    return true;
  }

  async function targetForAction(ctx) {
    const target = await resolveTarget(ctx);
    if (!target) {
      await ctx.reply('📌 منشن العضو أو قم بالرد على رسالته. ويمكنك أيضًا كتابة رقمه بعد الأمر.');
      return null;
    }
    return target;
  }

  async function warn(ctx) {
    if (!await requireGroup(ctx)) return;
    const target = await targetForAction(ctx);
    if (!target) return;

    const { participant } = await findParticipant(ctx, target);
    if (!participant) {
      await ctx.reply('❌ العضو غير موجود في المجموعة.');
      return;
    }
    if (['admin', 'superadmin'].includes(participant.admin)) {
      await ctx.reply('⛔ لا يمكن إصدار إنذار لمشرف.');
      return;
    }

    const db = await load();
    const key = groupUserKey(ctx.jid, target);
    const list = db.warnings[key] || [];
    if (list.length >= MAX_WARNINGS) {
      await ctx.reply('⚠️ وصل سجل هذا العضو إلى الحد الأقصى. امسح الإنذارات القديمة أولًا.');
      return;
    }

    const reason = ctx.args?.slice(1).join(' ') || 'بدون سبب محدد';
    list.push({
      reason,
      actor: ctx.senderJid,
      time: Date.now()
    });
    db.warnings[key] = list;
    await save();
    await addLog(ctx.jid, 'warning', target, ctx.senderJid, { reason });

    await ctx.reply(
      `╭━━〔 ❄️ ALVARIA • إنذار 〕━━╮\n` +
      `👤 العضو: @${target.split('@')[0]}\n` +
      `🛡️ المشرف: @${String(ctx.senderJid || '').split('@')[0]}\n` +
      `🔢 عدد الإنذارات: ${list.length}\n` +
      `📝 السبب: ${reason}\n` +
      `╰━━〔 ALVARIA ❄️ 〕━━╯`,
      { mentions: [target, ctx.senderJid].filter(isUserJid) }
    );
  }

  async function showWarnings(ctx) {
    if (!await requireGroup(ctx)) return;
    const target = await targetForAction(ctx);
    if (!target) return;
    const db = await load();
    const list = db.warnings[groupUserKey(ctx.jid, target)] || [];
    await ctx.reply(
      `📋 إنذارات العضو @${target.split('@')[0]}: ${list.length}\n` +
      (list.length
        ? list.map((item, i) =>
            `${i + 1}. ${item.reason} — ${new Date(item.time).toLocaleString()}`
          ).join('\n')
        : 'لا توجد إنذارات مسجلة.'),
      { mentions: [target] }
    );
  }

  async function clearWarnings(ctx) {
    if (!await requireGroup(ctx)) return;
    const target = await targetForAction(ctx);
    if (!target) return;
    const db = await load();
    delete db.warnings[groupUserKey(ctx.jid, target)];
    await save();
    await addLog(ctx.jid, 'warnings-cleared', target, ctx.senderJid);
    await ctx.reply(`🧹 تم مسح إنذارات @${target.split('@')[0]}.`, {
      mentions: [target]
    });
  }

  async function mute(ctx) {
    if (!await requireGroup(ctx)) return;
    const target = await targetForAction(ctx);
    if (!target) return;

    const { metadata, participant } = await findParticipant(ctx, target);
    if (!participant) {
      await ctx.reply('❌ العضو غير موجود في المجموعة.');
      return;
    }
    if (['admin', 'superadmin'].includes(participant.admin)) {
      await ctx.reply('⛔ لا يمكن كتم مشرف.');
      return;
    }
    if (!await requireBotAdmin(ctx, metadata)) return;

    // عدم كتابة مدة يعني كتمًا دائمًا حتى فك الكتم يدويًا.
    const durationText = ctx.args?.find(value =>
      /^\d+(s|m|h|d)$/i.test(value) ||
      ['دائم', 'دائما', 'دائمًا', 'permanent'].includes(value)
    );

    const duration = durationText
      ? parseDuration(durationText)
      : 0;

    if (duration === null) {
      await ctx.reply('⏱️ المدة غير صالحة. استخدم مثلًا 10m أو 2h أو 1d أو دائم.');
      return;
    }

    const db = await load();
    const key = groupUserKey(ctx.jid, target);
    db.mutes[key] = {
      group: ctx.jid,
      target,
      actor: ctx.senderJid,
      until: duration === 0 ? 0 : Date.now() + duration,
      createdAt: Date.now()
    };
    await save();
    await addLog(ctx.jid, 'mute', target, ctx.senderJid, { duration: durationText });

    await ctx.reply(
      `🔇 تم كتم @${target.split('@')[0]} ${duration === 0 ? 'بشكل دائم' : `لمدة ${durationText}`}.\n` +
      'سيحذف ALVARIA رسائله أثناء الكتم ما دام مشرفًا.',
      { mentions: [target] }
    );
  }

  async function unmute(ctx) {
    if (!await requireGroup(ctx)) return;
    const target = await targetForAction(ctx);
    if (!target) return;
    const db = await load();
    delete db.mutes[groupUserKey(ctx.jid, target)];
    await save();
    await addLog(ctx.jid, 'unmute', target, ctx.senderJid);
    await ctx.reply(`🔊 تم فك كتم @${target.split('@')[0]}.`, {
      mentions: [target]
    });
  }

  async function kick(ctx) {
    if (!await requireGroup(ctx)) return;
    const target = await targetForAction(ctx);
    if (!target) return;
    const { metadata, participant } = await findParticipant(ctx, target);
    if (!participant) {
      await ctx.reply('❌ العضو غير موجود في المجموعة.');
      return;
    }
    if (['admin', 'superadmin'].includes(participant.admin)) {
      await ctx.reply('⛔ لا يمكن طرد مشرف. أزل إشرافه أولًا إن كان ذلك مصرحًا لك.');
      return;
    }
    if (!await requireBotAdmin(ctx, metadata)) return;

    await ctx.sock.groupParticipantsUpdate(ctx.jid, [participant.id], 'remove');
    await addLog(ctx.jid, 'kick', participant.id, ctx.senderJid);
    await ctx.reply(`🚪 تم طلب إزالة @${String(participant.id).split('@')[0]} من المجموعة.`, {
      mentions: [participant.id]
    });
  }

  async function changeAdmin(ctx, action) {
    if (!await requireGroup(ctx)) return;
    const target = await targetForAction(ctx);
    if (!target) return;
    const { metadata, participant } = await findParticipant(ctx, target);
    if (!participant) {
      await ctx.reply('❌ العضو غير موجود في المجموعة.');
      return;
    }
    if (!await requireBotAdmin(ctx, metadata)) return;

    if (action === 'promote' && participant.admin) {
      await ctx.reply('ℹ️ هذا العضو مشرف بالفعل.');
      return;
    }
    if (action === 'demote' && !participant.admin) {
      await ctx.reply('ℹ️ هذا العضو ليس مشرفًا.');
      return;
    }

    await ctx.sock.groupParticipantsUpdate(
      ctx.jid,
      [participant.id],
      action
    );
    await addLog(ctx.jid, action, participant.id, ctx.senderJid);
    await ctx.reply(
      `${action === 'promote' ? '⬆️ تمت ترقية' : '⬇️ تمت إزالة إشراف'} @${String(participant.id).split('@')[0]}.`,
      { mentions: [participant.id] }
    );
  }

  async function memberInfo(ctx) {
    if (!await requireGroup(ctx)) return;
    const target = await targetForAction(ctx);
    if (!target) return;
    const { participant } = await findParticipant(ctx, target);
    if (!participant) {
      await ctx.reply('❌ العضو غير موجود في المجموعة.');
      return;
    }
    const db = await load();
    const warnings = db.warnings[groupUserKey(ctx.jid, target)] || [];
    const muteEntry = db.mutes[groupUserKey(ctx.jid, target)];
    const muted = Boolean(muteEntry && (!muteEntry.until || muteEntry.until > Date.now()));
    await ctx.reply(
      `╭━━〔 ❄️ ALVARIA • معلومات العضو 〕━━╮\n` +
      `👤 @${String(participant.id).split('@')[0]}\n` +
      `⭐ الصفة: ${participant.admin || 'عضو'}\n` +
      `⚠️ الإنذارات: ${warnings.length}\n` +
      `🔇 الكتم: ${muted ? 'مفعل' : 'غير مفعل'}\n` +
      `╰━━〔 ALVARIA ❄️ 〕━━╯`,
      { mentions: [participant.id] }
    );
  }

  async function listMuted(ctx) {
    if (!await requireGroup(ctx)) return;
    const db = await load();
    const entries = Object.values(db.mutes).filter(item =>
      item.group === ctx.jid && (!item.until || item.until > Date.now())
    );
    await ctx.reply(
      entries.length
        ? '🔇 الأعضاء المكتومون:\n' + entries.map(item =>
            `• @${String(item.target).split('@')[0]} — ${
              item.until ? new Date(item.until).toLocaleString() : 'دائم'
            }`
          ).join('\n')
        : 'لا يوجد أعضاء مكتومون حاليًا.',
      { mentions: entries.map(item => item.target) }
    );
  }

  async function showLogs(ctx) {
    if (!await requireGroup(ctx)) return;
    const db = await load();
    const entries = db.logs.filter(item => item.group === ctx.jid).slice(-20).reverse();
    await ctx.reply(
      entries.length
        ? '📜 آخر عمليات إدارة الأعضاء:\n' + entries.map(item =>
            `• ${item.type} | العضو: ${item.target || 'غير محدد'} | المنفّذ: ${item.actor || 'غير معروف'} | ${new Date(item.time).toLocaleString()}`
          ).join('\n')
        : 'لا توجد عمليات مسجلة.'
    );
  }

  async function clearLogs(ctx) {
    if (!await requireGroup(ctx)) return;
    const db = await load();
    db.logs = db.logs.filter(item => item.group !== ctx.jid);
    await save();
    await ctx.reply('🧹 تم مسح سجل إدارة الأعضاء لهذه المجموعة.');
  }

  async function enforceMute(sock, message, groupJid) {
    try {
      const sender = getParticipant(message);
      if (!sender) return false;
      const db = await load();

      const key = groupUserKey(groupJid, sender);
      let entry = db.mutes[key];

      // مطابقة معرفات PN وLID عند اختلاف صيغة الرسالة.
      if (!entry) {
        entry = Object.values(db.mutes).find(item =>
          item.group === groupJid &&
          normalizeJid(item.target) === normalizeJid(sender)
        );
      }
      if (!entry) return false;

      if (entry.until && entry.until <= Date.now()) {
        delete db.mutes[key];
        for (const [storedKey, value] of Object.entries(db.mutes)) {
          if (value.group === groupJid &&
              normalizeJid(value.target) === normalizeJid(sender)) {
            delete db.mutes[storedKey];
          }
        }
        await save();
        return false;
      }

      const metadata = await sock.groupMetadata(groupJid);
      const member = metadata.participants?.find(item => {
        const ids = [item.id, item.lid, item.jid].filter(Boolean).map(normalizeJid);
        return ids.includes(normalizeJid(sender));
      });
      if (['admin', 'superadmin'].includes(member?.admin)) return false;

      const botIds = [
        normalizeJid(sock.user?.id),
        normalizeJid(sock.user?.lid)
      ].filter(Boolean);
      const botAdmin = metadata.participants?.some(item => {
        const ids = [item.id, item.lid, item.jid].filter(Boolean).map(normalizeJid);
        return ids.some(id => botIds.includes(id)) &&
          ['admin', 'superadmin'].includes(item.admin);
      });
      if (!botAdmin) return false;

      await sock.sendMessage(groupJid, { delete: message.key });
      return true;
    } catch (error) {
      logger.warn?.({ err: error, groupJid }, 'Mute enforcement failed');
      return false;
    }
  }

  async function recordParticipantUpdate(update) {
    const group = update?.id;
    const action = update?.action;
    if (!group?.endsWith('@g.us') ||
        !['promote', 'demote'].includes(action)) return;

    const actor = update.author || update.authorPn || null;
    for (const participant of update.participants || []) {
      await addLog(group, action, participant, actor, {
        source: 'whatsapp-group-participants.update'
      });
    }
  }

  return {
    warn,
    showWarnings,
    clearWarnings,
    mute,
    unmute,
    kick,
    promote: ctx => changeAdmin(ctx, 'promote'),
    demote: ctx => changeAdmin(ctx, 'demote'),
    memberInfo,
    listMuted,
    showLogs,
    clearLogs,
    enforceMute,
    recordParticipantUpdate
  };
}

export function registerMemberCommands(coreCommands) {
  const actions = [
    { names: ['انذار', 'تحذير', 'عضو_انذار','انذار_عضو','تحذير_عضو','عضو_تحذير','warn_member'], description: 'إصدار إنذار', handler: 'warn' },
    { names: ['انذارات', 'تحذيرات', 'عضو_انذارات','انذارات_عضو','سجل_انذارات','تحذيرات_عضو','warnings_member'], description: 'عرض الإنذارات', handler: 'showWarnings' },
    { names: ['مسح_انذارات', 'تصفير_الانذارات', 'عضو_مسح_الانذارات','مسح_انذارات','حذف_انذارات','تصفير_انذارات','clear_warnings'], description: 'مسح الإنذارات', handler: 'clearWarnings' },
    { names: ['كتم', 'اسكات', 'عضو_كتم','كتم_عضو','اسكات_عضو','عضو_اسكات','mute_member'], description: 'كتم عضو حتى فك الكتم يدويًا، أو لمدة اختيارية', handler: 'mute' },
    { names: ['فك_كتم', 'الغاء_الكتم', 'عضو_فك_كتم','فك_كتم','الغاء_كتم','الغاء_اسكات','unmute_member'], description: 'فك كتم عضو', handler: 'unmute' },
    { names: ['طرد', 'اخراج', 'عضو_طرد','طرد_عضو','اخراج_عضو','حذف_عضو','kick_member'], description: 'إزالة عضو من المجموعة', handler: 'kick' },
    { names: ['ترقية', 'رفع_مشرف', 'عضو_ترقية','ترقية_عضو','رفع_عضو','اعطاء_ادمن','promote_member'], description: 'ترقية عضو إلى مشرف', handler: 'promote' },
    { names: ['تنزيل', 'سحب_الإشراف', 'عضو_تنزيل','تنزيل_عضو','سحب_ادمن','ازالة_ادمن','demote_member'], description: 'إزالة إشراف عضو', handler: 'demote' },
    { names: ['معلومات_عضو', 'فحص_عضو', 'عضو_معلومات','معلومات_عضو','فحص_عضو','بيانات_عضو','member_info'], description: 'عرض معلومات عضو', handler: 'memberInfo' },
    { names: ['المكتومين', 'قائمة_الكتم', 'عضو_المكتومين','قائمة_المكتومين','المكتومين','سجل_الكتم','muted_members'], description: 'عرض المكتومين', handler: 'listMuted' },
    { names: ['سجل_الأعضاء', 'سجل_العقوبات', 'عضو_السجل','سجل_الأعضاء','سجل_العقوبات','سجل_الإدارة','member_logs'], description: 'عرض سجل الإدارة والعقوبات', handler: 'showLogs' },
    { names: ['مسح_سجل_الأعضاء', 'مسح_سجل_العقوبات', 'عضو_مسح_السجل','مسح_سجل_الأعضاء','حذف_سجل_الإدارة','تصفير_السجل','clear_member_logs'], description: 'مسح سجل المجموعة', handler: 'clearLogs' },
    { names: ['عضو_انذار1','عضو_انذار2','عضو_انذار3','عضو_انذار4','عضو_انذار5'], description: 'اختصارات الإنذار', handler: 'warn' }
  ];

  for (const action of actions) {
    for (const name of action.names) {
      coreCommands.set(name, {
        description: action.description,
        requiresAdmin: true,
        reaction: '⚖️',
        handler: async ctx => {
          const manager = ctx.memberManager;
          if (!manager) {
            await ctx.reply('❌ نظام إدارة الأعضاء غير جاهز.');
            return;
          }
          await manager[action.handler](ctx);
        }
      });
    }
  }
}
