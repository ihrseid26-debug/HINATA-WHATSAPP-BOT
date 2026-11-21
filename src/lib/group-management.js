import { downloadMediaMessage } from '@whiskeysockets/baileys';

function unwrapMessage(message) {
  let current = message;
  while (current && typeof current === 'object') {
    if (current.ephemeralMessage?.message) current = current.ephemeralMessage.message;
    else if (current.viewOnceMessage?.message) current = current.viewOnceMessage.message;
    else if (current.viewOnceMessageV2?.message) current = current.viewOnceMessageV2.message;
    else if (current.documentWithCaptionMessage?.message) current = current.documentWithCaptionMessage.message;
    else break;
  }
  return current;
}

function findQuotedInfo(message) {
  const root = unwrapMessage(message?.message || message);
  const seen = new Set();
  const walk = value => {
    if (!value || typeof value !== 'object' || seen.has(value)) return null;
    seen.add(value);
    if (value.contextInfo?.quotedMessage) return value.contextInfo;
    for (const child of Object.values(value)) {
      if (child && typeof child === 'object') {
        const found = walk(child);
        if (found) return found;
      }
    }
    return null;
  };
  return walk(root);
}

function isImageMessage(message) {
  const content = unwrapMessage(message);
  return Boolean(content?.imageMessage);
}

function jidBase(value) {
  return String(value || '').trim().replace(/:\d+@/, '@');
}

function participantIds(participant) {
  return [participant?.id, participant?.jid, participant?.lid, participant?.phoneNumber]
    .filter(Boolean).map(jidBase);
}

async function getGroupAndCheckBot(ctx) {
  if (!ctx.jid?.endsWith('@g.us')) {
    await ctx.reply('⚠️ هذا الأمر يعمل داخل المجموعات فقط.');
    return null;
  }
  if (!ctx.isAdmin) {
    await ctx.reply('⛔ هذا الأمر للمشرفين فقط.');
    return null;
  }

  const metadata = await ctx.sock.groupMetadata(ctx.jid);
  const botIds = new Set([
    jidBase(ctx.sock.user?.id),
    jidBase(ctx.sock.user?.lid)
  ].filter(Boolean));
  const bot = metadata.participants?.find(p =>
    participantIds(p).some(id => botIds.has(id))
  );
  if (!bot || !bot.admin) {
    await ctx.reply('⚠️ يجب أن يكون ALVARIA مشرفًا لتنفيذ هذه العملية.');
    return null;
  }
  return metadata;
}

function commandText(ctx) {
  return String(ctx.args?.join(' ') || '').trim();
}

function register(commands, names, description, handler, reaction = '⚙️') {
  for (const name of names) {
    commands.set(name, { description, handler, reaction, requiresAdmin: true });
  }
}

export function registerGroupManagementCommands(commands) {
  // مدخل القسم ظاهر في قائمة الأوامر، أما تنفيذ العمليات فيتطلب صلاحيات المشرف.
  // ALVARIA_GROUP_GUIDE_V2
  commands.set('قسم_إدارة_المجموعة', {
    description: 'دليل إدارة المجموعة التفاعلي',
    reaction: '⚙️',
    handler: async ctx => {
      const { sendHinataNativeButtons } =
        await import('../lib/native-buttons.js');

      const entries = [
        {
          title: '✏️ تغيير اسم المجموعة',
          description: 'تغيير اسم المجموعة. أضف الاسم بعد الأمر.',
          id: '.تغيير_اسم'
        },
        {
          title: '📝 تغيير وصف المجموعة',
          description: 'تحديث وصف المجموعة بالنص الذي تحدده.',
          id: '.تغيير_وصف'
        },
        {
          title: '🖼️ تغيير صورة المجموعة',
          description: 'ردّ على صورة ثم اختر هذا الأمر.',
          id: '.تغيير_صوره'
        },
        {
          title: '🔗 رابط المجموعة',
          description: 'عرض رابط دعوة المجموعة الحالي.',
          id: '.رابط'
        },
        {
          title: '♻️ تجديد رابط المجموعة',
          description: 'إبطال الرابط السابق وإنشاء رابط جديد.',
          id: '.تجديد_الرابط'
        },
        {
          title: '📨 طلبات الانضمام',
          description: 'عرض عدد طلبات الانضمام المعلقة.',
          id: '.طلبات_الانضمام'
        },
        {
          title: '✅ قبول الطلبات',
          description: 'قبول جميع طلبات الانضمام المعلقة.',
          id: '.قبول'
        },
        {
          title: '❌ رفض الطلبات',
          description: 'رفض جميع طلبات الانضمام المعلقة.',
          id: '.رفض'
        },
        {
          title: '⬅️ الرجوع إلى الأقسام',
          description: 'العودة إلى قائمة ALVARIA الرئيسية.',
          id: '.اوامر'
        }
      ];

      const guide = [
        '╭━━〔 ❄️ 𝑨𝑳𝑽𝑨𝑹𝑰𝑨 〕━━╮',
        '',
        '❅ دَلِـيـلُ إِدَارَةِ الـمَـجْـمُـوعَـة ❅',
        '',
        '『 𝑮𝑹𝑶𝑼𝑷 • 𝑴𝑨𝑵𝑨𝑮𝑬𝑴𝑬𝑵𝑻 』',
        '',
        '❅ أوامر تغيير بيانات المجموعة:',
        '',
        '〖 .تغيير_اسم 〗',
        '⟞ تغيير اسم المجموعة. اكتب الاسم بعد الأمر.',
        '',
        '〖 .تغيير_وصف 〗',
        '⟞ تغيير وصف المجموعة بالنص الجديد.',
        '',
        '〖 .تغيير_صوره 〗',
        '⟞ ردّ على صورة لتنفيذ تغيير صورة المجموعة.',
        '',
        '❅ أوامر روابط المجموعة:',
        '',
        '〖 .رابط 〗',
        '⟞ عرض رابط دعوة المجموعة.',
        '',
        '〖 .تجديد_الرابط 〗',
        '⟞ إبطال رابط الدعوة السابق وإنشاء رابط جديد.',
        '',
        '❅ أوامر طلبات الانضمام:',
        '',
        '〖 .طلبات_الانضمام 〗',
        '⟞ عرض عدد الطلبات المعلقة.',
        '',
        '〖 .قبول 〗',
        '⟞ قبول طلبات الانضمام المعلقة.',
        '',
        '〖 .رفض 〗',
        '⟞ رفض طلبات الانضمام المعلقة.',
        '',
        '⚠️ هذه الأدوات للمشرفين، ويجب أن يكون ALVARIA مشرفًا أيضًا.',
        '',
        '❅ اختر الأمر من القائمة التفاعلية بالأسفل.',
        '',
        '╰━━〔 ❄️ ALVARIA 〕━━╯'
      ].join('\n');

      await sendHinataNativeButtons(ctx.sock, ctx.jid, {
        text: guide,
        title: '❄️ ALVARIA • GROUP',
        footer: '❅ ALVARIA GROUP MANAGEMENT',
        buttons: [
          {
            type: 'single_select',
            title: '❅ قائمة إدارة المجموعة',
            sections: [
              {
                title: '❄️ أدوات إدارة المجموعة',
                rows: entries
              }
            ]
          }
        ]
      });
    }
  });

  register(commands, ['تغيير_اسم'], 'تغيير اسم المجموعة', async ctx => {
    const subject = commandText(ctx);
    if (!subject) return ctx.reply('اكتب الاسم بعد الأمر. مثال: .تغيير_اسم عائلة ALVARIA');
    if (subject.length > 100) return ctx.reply('⚠️ اسم المجموعة طويل جدًا.');
    try {
      if (!await getGroupAndCheckBot(ctx)) return;
      await ctx.sock.groupUpdateSubject(ctx.jid, subject);
      await ctx.reply('✅ تم إرسال طلب تغيير اسم المجموعة بنجاح.');
    } catch (error) {
      console.error('[ALVARIA group subject]', error);
      await ctx.reply('❌ تعذر تغيير اسم المجموعة. تحقق من صلاحيات البوت وحاول مجددًا.');
    }
  }, '✏️');

  register(commands, ['تغيير_وصف'], 'تغيير وصف المجموعة', async ctx => {
    const description = commandText(ctx);
    if (!description) return ctx.reply('اكتب الوصف بعد الأمر.');
    if (description.length > 2048) return ctx.reply('⚠️ الوصف طويل جدًا.');
    try {
      if (!await getGroupAndCheckBot(ctx)) return;
      await ctx.sock.groupUpdateDescription(ctx.jid, description);
      await ctx.reply('✅ تم إرسال طلب تغيير وصف المجموعة بنجاح.');
    } catch (error) {
      console.error('[ALVARIA group description]', error);
      await ctx.reply('❌ تعذر تغيير وصف المجموعة.');
    }
  }, '📝');

  register(commands, ['تغيير_صوره', 'تغيير_صورة'], 'تغيير صورة المجموعة بالرد على صورة', async ctx => {
    let stage = 'permissions';
    try {
      if (!await getGroupAndCheckBot(ctx)) return;
      stage = 'quoted-image';
      const info = findQuotedInfo(ctx.message);
      if (!info?.quotedMessage || !isImageMessage(info.quotedMessage)) {
        return ctx.reply('🖼️ ردّ على صورة بالأمر .تغيير_صوره');
      }
      const quoted = {
        key: {
          remoteJid: ctx.jid,
          fromMe: false,
          id: info.stanzaId,
          participant: info.participant || info.participantAlt || ctx.quotedParticipant || undefined
        },
        message: unwrapMessage(info.quotedMessage)
      };
      stage = 'download';
      const buffer = await downloadMediaMessage(
        quoted,
        'buffer',
        {},
        { logger: console, reuploadRequest: ctx.sock.updateMediaMessage?.bind(ctx.sock) }
      );
      if (!Buffer.isBuffer(buffer) || !buffer.length) {
        return ctx.reply('❌ لم أتمكن من تنزيل الصورة المردود عليها.');
      }
      stage = 'upload';
      await ctx.sock.updateProfilePicture(ctx.jid, buffer);
      await ctx.reply('✅ تم تحديث صورة المجموعة.');
    } catch (error) {
      console.error('[ALVARIA group picture]', error);
      const message = stage === 'download'
        ? '❌ تعذر تنزيل الصورة. أعد إرسال الصورة ثم ردّ عليها بالأمر.'
        : stage === 'upload'
          ? '❌ تعذر رفع الصورة. تحقق من صلاحية ALVARIA كمشرف ومن واجهة تحديث صورة المجموعة.'
          : '❌ تعذر تنفيذ تغيير الصورة. تحقق من صلاحيات المشرف.';
      await ctx.reply(message);
    }
  }, '🖼️');

  register(commands, ['رابط', 'رابط_المجموعة'], 'عرض رابط دعوة المجموعة', async ctx => {
    try {
      if (!await getGroupAndCheckBot(ctx)) return;
      const code = await ctx.sock.groupInviteCode(ctx.jid);
      if (!code) return ctx.reply('❌ لم يتمكن واتساب من إرجاع رابط الدعوة.');
      await ctx.reply(`🔗 رابط المجموعة:\nhttps://chat.whatsapp.com/${code}`);
    } catch (error) {
      console.error('[ALVARIA group invite]', error);
      await ctx.reply('❌ تعذر جلب رابط المجموعة.');
    }
  }, '🔗');

  register(commands, ['تجديد_الرابط'], 'إبطال رابط الدعوة السابق وإنشاء رابط جديد', async ctx => {
    try {
      if (!await getGroupAndCheckBot(ctx)) return;
      const code = await ctx.sock.groupRevokeInvite(ctx.jid);
      if (!code) return ctx.reply('⚠️ تم تنفيذ الطلب، لكن لم يصل رابط جديد. استخدم .رابط_المجموعة');
      await ctx.reply(`♻️ تم تجديد رابط الدعوة:\nhttps://chat.whatsapp.com/${code}`);
    } catch (error) {
      console.error('[ALVARIA group revoke invite]', error);
      await ctx.reply('❌ تعذر تجديد الرابط.');
    }
  }, '♻️');

  async function getPending(ctx) {
    if (typeof ctx.sock.groupRequestParticipantsList !== 'function') {
      await ctx.reply('⚠️ إصدار Baileys الحالي لا يوفّر واجهة قراءة طلبات الانضمام.');
      return null;
    }
    const pending = await ctx.sock.groupRequestParticipantsList(ctx.jid);
    return Array.isArray(pending) ? pending : [];
  }

  register(commands, ['طلبات_الانضمام'], 'عرض عدد طلبات الانضمام المعلقة', async ctx => {
    try {
      if (!await getGroupAndCheckBot(ctx)) return;
      const pending = await getPending(ctx);
      if (!pending) return;
      await ctx.reply(`📨 طلبات الانضمام المعلقة: ${pending.length}`);
    } catch (error) {
      console.error('[ALVARIA group requests]', error);
      await ctx.reply('❌ تعذر جلب طلبات الانضمام.');
    }
  }, '📨');

  async function processRequests(ctx, action) {
    try {
      if (!await getGroupAndCheckBot(ctx)) return;
      if (typeof ctx.sock.groupRequestParticipantsUpdate !== 'function') {
        return ctx.reply('⚠️ إصدار Baileys الحالي لا يوفّر واجهة معالجة طلبات الانضمام.');
      }
      const pending = await getPending(ctx);
      if (!pending) return;
      const ids = pending.map(item => item.jid || item.id).filter(Boolean);
      if (!ids.length) return ctx.reply('📭 لا توجد طلبات انضمام معلقة.');
      let succeeded = 0;
      for (const jid of ids) {
        try {
          const result = await ctx.sock.groupRequestParticipantsUpdate(ctx.jid, [jid], action);
          if (Array.isArray(result) && result.some(item =>
            item.status === '200' || item.status === 200 || item.status === 'success'
          )) succeeded++;
        } catch (error) {
          console.error(`[HINATA request ${action}]`, error);
        }
      }
      await ctx.reply(`${action === 'approve' ? '✅' : '❌'} تمت معالجة ${succeeded} من أصل ${ids.length} طلبات.`);
    } catch (error) {
      console.error(`[HINATA group requests ${action}]`, error);
      await ctx.reply('❌ تعذرت معالجة طلبات الانضمام.');
    }
  }

  register(commands, ['قبول'], 'قبول طلبات الانضمام المعلقة', ctx => processRequests(ctx, 'approve'), '✅');
  register(commands, ['رفض'], 'رفض طلبات الانضمام المعلقة', ctx => processRequests(ctx, 'reject'), '❌');
}
