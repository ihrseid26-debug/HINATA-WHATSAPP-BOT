import reactCommand from './react.js';
import { fakeNumberCommand } from './fake_number.js';
import { sendHinataNativeButtons } from '../lib/native-buttons.js';
import { registerAIRichCommands } from '../lib/airich.js';
import { registerAISectionCommands } from '../lib/ai-section.js';
import { registerHinataEvolutionCommand } from '../lib/hinata-evolution.js';
import debugSubsCommand from './debug_subs.js';
import { registerMediaDownloadCommands } from '../lib/media-download.js';
import { registerSoundCloudSongCommand } from '../lib/soundcloud-music.js';
import { registerCityRacingCommands } from '../lib/city-racing.js';
import { registerMarasemCommands } from '../lib/marasem.js';
import { registerEventsCommands } from '../lib/events.js';
import { registerHinataEventsCenter } from '../lib/hinata-events-center.js';
import { decorateText, formatHinataReply, getMessageContextInfo } from '../lib/text.js';
import { registerMemberCommands } from '../lib/member-management.js';
import { registerMemberExtrasCommands } from '../lib/member-extras.js';
import { registerGroupManagementCommands } from '../lib/group-management.js';
import { registerStickerCommands } from '../lib/stickers.js';
import { registerYoutubeEditCommands } from '../lib/youtube-edits.js';
import { registerPinterestImageCommands } from '../lib/pinterest-images.js';
import { registerCoupleIconCommands } from '../lib/couple-icons.js';
import { registerStickerPackCommands } from '../lib/sticker-packs.js';
import { registerAnimatedStickerPackCommands } from '../lib/animated-sticker-packs.js';
import { registerContactViewerCommands } from '../lib/contact-viewer.js';
import { downloadContentFromMessage } from '@whiskeysockets/baileys';
import { registerRandomEventsCommands } from '../lib/random-events.js';
import { registerSubbotSectionImageCommands } from '../lib/subbot-section-images.js';
import { registerSubbotCommandVideoCommands, getSubbotCommandVideo } from '../lib/subbot-command-videos.js';
import { registerAccountBlockingCommands } from '../lib/account-blocking.js';
import { auditGroupDevices, temporarilyLockGroup } from '../lib/group-device-audit.js';
import { registerChatCommand } from '../lib/chat-command.js';
import { registerMetaAICommands } from '../lib/meta-ai-group.js';


import { registerManhwaCommands } from '../lib/manhwa.js';
import { registerAnimeSuggestionCommands } from '../lib/anime-suggestions.js';
import { registerMovieSuggestionCommands } from '../lib/movie-suggestions.js';

export const coreCommands = new Map()

coreCommands.set('رشق', reactCommand);coreCommands.set('فحص_الفرعية', debugSubsCommand);

// تسجيل أمر ريبورت والتعميم
coreCommands.set('ريبورت', reportCommand);

// تسجيل أمر رقم وهمي واستقبال كود التحقق
coreCommands.set('رقم_وهمي', fakeNumberCommand);
coreCommands.set('fakenum', fakeNumberCommand);
coreCommands.set('رقم', fakeNumberCommand);

// تسجيل أمر الإبلاغ الجماعي (ريبورت)
coreCommands.set('report', reportCommand);
coreCommands.set('ابلاغ', reportCommand);
coreCommands.set('إبلاغ', reportCommand);
coreCommands.set('بلغ', reportCommand);





registerAIRichCommands(coreCommands);

registerMediaDownloadCommands(coreCommands);


registerMemberCommands(coreCommands);
registerMemberExtrasCommands(coreCommands);
registerGroupManagementCommands(coreCommands);
registerMarasemCommands(coreCommands);
registerEventsCommands(coreCommands);
registerStickerCommands(coreCommands);
registerYoutubeEditCommands(coreCommands);
registerPinterestImageCommands(coreCommands);
registerCoupleIconCommands(coreCommands);
registerStickerPackCommands(coreCommands);
registerAnimatedStickerPackCommands(coreCommands);
registerContactViewerCommands(coreCommands);
registerManhwaCommands(coreCommands);
registerAnimeSuggestionCommands(coreCommands);
registerMovieSuggestionCommands(coreCommands);
registerRandomEventsCommands(coreCommands); // HINATA_RANDOM_EVENTS_REGISTERED_V1
registerSubbotSectionImageCommands(coreCommands);
registerSubbotCommandVideoCommands(coreCommands);
registerAccountBlockingCommands(coreCommands);


function register(names, description, handler, reaction = '✅') {
  for (const name of names) {
    coreCommands.set(name, { description, handler, reaction });
  }
}

registerMetaAICommands(coreCommands);
registerChatCommand(coreCommands);
registerAISectionCommands(coreCommands);
registerHinataEvolutionCommand(coreCommands); // HINATA_EVOLUTION_BRIDGE_V1
registerHinataEventsCenter(coreCommands);

// HINATA_LINK_PREVIEW_TEST_V1
register(
  ['اختبار_معاينة'],
  'اختبار معاينة الرابط داخل واتساب',
  async ctx => {
    const url = 'https://github.com/';

    await ctx.reply(
      '❄️ ALVARIA • LINK PREVIEW TEST\n\n' +
      'هذه رسالة تجريبية لمعاينة الرابط.\n' +
      'يفترض أن يعرض واتساب عنوان الموقع وصورته ووصفه إن توفرت.\n\n' +
      url
    );
  },
  '🔗'
);


// HINATA_COMPREHENSIVE_DEVICE_AUDIT_V2
coreCommands.set('فحص_شامل', {
  description: 'تقرير الأجهزة الإضافية مع منشن الأعضاء المكتشفة لديهم',
  reaction: '🔎',
  requiresAdmin: true,
  handler: async ctx => {
    if (!ctx.jid?.endsWith('@g.us')) {
      await ctx.reply('⛔ هذا الأمر يعمل داخل المجموعات فقط.');
      return;
    }

    const metadata = await ctx.sock.groupMetadata(ctx.jid);

    await ctx.reply('⏳ جارٍ فحص الأجهزة المتاحة لأعضاء المجموعة...');

    const report = await auditGroupDevices(
      ctx.sock,
      metadata.participants || []
    );

    const lockResult = report.devicesTotal > 0
      ? await temporarilyLockGroup(ctx.sock, ctx.jid)
      : { locked: false, reason: 'no_devices' };

    const lockNotice = lockResult.locked
      ? '🔒 تم قفل المجموعة مؤقتًا لمدة 60 ثانية.'
      : lockResult.alreadyLocked
        ? '🔒 المجموعة مقفلة مسبقًا، ولم نغيّر إعدادها.'
        : lockResult.reason === 'bot_not_admin'
          ? '⚠️ لم يتم القفل: يجب ترقية ALVARIA إلى مشرف.'
          : lockResult.reason === 'no_devices'
            ? '🟢 لم تُكتشف أجهزة إضافية؛ لم يتم قفل المجموعة.'
            : '⚠️ تعذّر تطبيق القفل المؤقت.';

    const detected = report.membersWithDevices || [];
    const mentions = detected.map(member => member.jid);
    const mentionLines = detected.length
      ? detected.map(member =>
          `• @${member.jid.split('@')[0].split(':')[0]} — ${member.count} جهاز إضافي`
        ).join('\n')
      : 'لا يوجد أعضاء لديهم أجهزة إضافية مكتشفة.';

    const message =
      '╭━━〔 ❄️ ALVARIA • DEVICE AUDIT 〕━━╮\n' +
      '🔎 تقرير الفحص الشامل\n\n' +
      `👥 أعضاء المجموعة: ${report.totalMembers}\n` +
      `✅ أعضاء تم فحصهم: ${report.scanned}\n` +
      `📱 الأجهزة الإضافية المكتشفة: ${report.devicesTotal}\n` +
      `👤 أعضاء لديهم أجهزة إضافية: ${report.membersWithDevicesCount}\n` +
      `⚠️ تعذر فحصهم: ${report.failed}\n\n` +
      '👥 الأعضاء الذين لديهم أجهزة إضافية:\n' +
      mentionLines + '\n\n' +
      lockNotice + '\n' +
      '⚠️ الجهاز المرتبط لا يعني أن الحساب بوت.\n' +
      '╰━━━━━━━━━━━━━━━━━━━━╯';

    await ctx.sock.sendMessage(ctx.jid, {
      text: message,
      mentions
    });
  }
});


register(['تنصيب', 'subbot'], 'تنصيب بوت فرعي وإظهار رمز الربط في المجموعة', async (ctx) => {
  if (!ctx.jid.endsWith('@g.us')) {
    await ctx.reply('⛔ ابدأ التنصيب من داخل مجموعة.');
    return;
  }

  if (!ctx.subbotManager) {
    await ctx.reply('❌ مدير البوتات الفرعية غير جاهز.');
    return;
  }

  const participantIds = [
    ctx.senderJid,
    ctx.senderAltJid,
    ctx.message?.key?.participant,
    ctx.message?.key?.participantAlt,
    ctx.message?.participant,
    ctx.message?.participantAlt
  ].filter(value => typeof value === 'string' && value.includes('@'));

  const extractPhoneJid = value => {
    if (typeof value !== 'string') return '';
    if (!value.endsWith('@s.whatsapp.net') && !value.endsWith('@c.us')) return '';
    const digits = value.split('@')[0].split(':')[0].replace(/\D/g, '');
    return /^\d{8,15}$/.test(digits) ? digits : '';
  };

  let phone = '';
  for (const candidate of participantIds) {
    phone = extractPhoneJid(candidate);
    if (phone) break;
  }

  if (!phone) {
    try {
      const metadata = await ctx.sock.groupMetadata(ctx.jid);
      const member = metadata.participants?.find(item => {
        const ids = [item.id, item.lid, item.jid, item.phoneNumber]
          .filter(Boolean).map(String);
        return ids.some(id => participantIds.includes(id));
      });

      phone = extractPhoneJid(member?.phoneNumber) ||
              extractPhoneJid(member?.jid) ||
              extractPhoneJid(member?.id);

      if (!phone && ctx.sock.signalRepository?.lidMapping?.getPNForLID) {
        for (const lid of participantIds.filter(id => id.endsWith('@lid'))) {
          try {
            phone = extractPhoneJid(
              await ctx.sock.signalRepository.lidMapping.getPNForLID(lid)
            );
            if (phone) break;
          } catch {}
        }
      }
    } catch (error) {
      console.warn('[ALVARIA SUBBOT] Phone lookup failed:', error?.message || error);
    }
  }

  if (!phone) {
    await ctx.reply(
      '⚠️ تعذر استخراج رقم هاتفك من بيانات المجموعة.\n' +
      'لم يتم إنشاء جلسة فرعية.'
    );
    return;
  }

  await ctx.reply(
    '╭━━〔 ❄️ 𝑨𝒍𝒗𝒂𝒓𝒊𝒂 〕━━╮\n' +
    '⏳ تم استلام طلب التنصيب. جارٍ إنشاء الجلسة...\n' +
    '╰━━━━━━━━━━━━━━━━╯'
  );

  try {
    const result = await ctx.subbotManager.create(phone, {
      groupJid: ctx.jid,
      mainSock: ctx.sock,
      // مالك البوت الفرعي هو الشخص الذي نفّذ أمر التنصيب.
      ownerJid: `${phone}@s.whatsapp.net`,
      ownerAltJid: participantIds.find(
        value => value.endsWith('@lid')
      ) || ctx.senderAltJid || null
    });

    if (result.already && result.status === 'connected') {
      await ctx.reply('✅ لديك بوت فرعي متصل بالفعل.');
      return;
    }

    if (result.code) {
      const code = String(result.code);

      const messageText = [
        '*╭━━━━━━━〔 ❅ 𝑨𝒍𝒗𝒂𝒓𝒊𝒂 ❅ 〕━━━━━━━╮*',
        '',
        '┏━━━━━━━━━━━━━━━━━━━━━━┓',
        '*╭━━〔 🔑 𝑨𝒍𝒗𝒂𝒓𝒊𝒂 〕━━╮*',
        '',
        '*❮ 🔑┇ كــود الــإقــران الــخــاص بــك هــو:*',
        '',
        `*${code}*`,
        '',
        '*📌 خــطــوات الــربــط:*',
        '*_1. افتــح تــطــبــيــق واتــســاب عــلــى هــاتــفــك._*',
        '2. ادخــل إلــى *الــأجــهــزة الــمــرتــبــطــة*.',
        '3. اخــتــر *ربــط جــهــاز* ثــم *الــربــط بــرقــم الــهــاتــف*.',
        '*_4. أدخــل الــكــود الــظــاهــر أعــلــاه._*',
        '',
        '*_📋 اضــغــط زر النسخ إن ظهر لنسخ الكود._*',
        '*_⚠️ الرمز ظاهر لجميع أعضاء هذه المجموعة._*',
        '',
        '*╰━━〔 ❄️ 𝑨𝒍𝒗𝒂𝒓𝒊𝒂 〕━━╯*',
        '┗━━━━━━━━━━━━━━━━━━━━━━┛',
        '',
        '*╰━━━━━━━〔 ❅ 𝑨𝒍𝒗𝒂𝒓𝒊𝒂 ❅ 〕━━━━━━━╯*',
        '*❅ 𝑴𝑨𝑫𝑬 𝑩𝒀 𝑨𝒍𝒗𝒂𝒓𝒊𝒂 ❅*'
      ].join('\n');

      // إرسال رمز الاقتران برسالة عادية أولاً لضمان وصوله
      try {
        await ctx.sock.sendMessage(ctx.jid, {
          text: messageText
        });

        console.log('[SUBBOT PAIRING] Plain pairing message sent.', {
          jid: ctx.jid,
          group: String(ctx.jid).endsWith('@g.us')
        });
      } catch (textError) {
        console.error('[SUBBOT PAIRING TEXT ERROR]', textError);
        throw new Error(
          'تعذر إرسال رسالة رمز الاقتران: ' +
          (textError?.message || 'خطأ غير معروف')
        );
      }

      // محاولة إرسال زر النسخ بشكل مستقل؛ فشله لا يلغي رسالة الرمز
      try {
        const helperModule = await import('baileys_helper');
        const sendInteractiveMessage =
          helperModule.sendInteractiveMessage ||
          helperModule.default?.sendInteractiveMessage;

        if (typeof sendInteractiveMessage !== 'function') {
          throw new Error('sendInteractiveMessage غير متاحة');
        }

        await sendInteractiveMessage(ctx.sock, ctx.jid, {
          text: '❄️ اضغط على الزر لنسخ رمز الاقتران.',
          title: '❄️ 𝑨𝒍𝒗𝒂𝒓𝒊𝒂',
          footer: '❅ 𝑨𝒍𝒗𝒂𝒓𝒊𝒂 ❅',
          interactiveButtons: [{
            name: 'cta_copy',
            buttonParamsJson: JSON.stringify({
              display_text: '❅ 𝑪𝑶𝑷𝒀 𝑪𝑶𝑫𝑬 ❅',
              copy_code: code
            })
          }]
        });

        console.log('[SUBBOT PAIRING] Copy button relay completed.', {
          jid: ctx.jid
        });
      } catch (buttonError) {
        console.error('[SUBBOT COPY BUTTON ERROR]', buttonError);
      }

      return;
    }

    await ctx.reply('⏳ حالة الجلسة الحالية: ' + result.status);
  } catch (error) {
    console.error('[ALVARIA SUBBOT INSTALL]', error);
    await ctx.reply('❌ فشل التنصيب: ' + (error?.message || 'خطأ غير معروف'));
  }
}, '🚀');

register(['حالة_التنصيب', 'substatus'], 'عرض حالة الجلسة الفرعية', async (ctx) => {
  const participant = ctx.senderJid || '';

  if (!participant.endsWith('@s.whatsapp.net')) {
    await ctx.reply('⚠️ تعذر تحديد رقمك.');
    return;
  }

  const phone = participant.split('@')[0].split(':')[0];
  const status = ctx.subbotManager.getStatus(phone);

  const labels = {
    connected: '🟢 متصل',
    waiting: '🟡 ينتظر إكمال الربط',
    connecting: '🟡 جاري الاتصال',
    reconnecting: '🟠 إعادة الاتصال',
    logged_out: '🔴 تم تسجيل الخروج',
    error: '🔴 حدث خطأ',
    not_found: '⚪ لا توجد جلسة نشطة'
  };
  await ctx.reply(`❄️ ALVARIA SUBBOT\n📱 ${phone}\nالحالة: ${labels[status] || status}`);
}, '📊');

// ======================================================
// HINATA GROUP CONTROL & PROTECTION COMMANDS
// ======================================================

const protectionCommands = [
  { key: 'antiLinks', names: ['قفل_الروابط', 'تفعيل_الروابط'], label: 'مضاد الروابط' },
  { key: 'antiContacts', names: ['قفل_جهات_الاتصال', 'تفعيل_جهات_الاتصال'], label: 'مضاد جهات الاتصال' },
  { key: 'antiNumbers', names: ['قفل_الأرقام', 'تفعيل_الأرقام'], label: 'مضاد الأرقام' },
  { key: 'antiSpam', names: ['قفل_التكرار', 'تفعيل_التكرار'], label: 'مضاد التكرار' },
  { key: 'antiMentions', names: ['قفل_المنشن', 'تفعيل_المنشن'], label: 'مضاد المنشن' },
  { key: 'antiForwarded', names: ['قفل_المعاد_توجيهها', 'تفعيل_المعاد_توجيهها'], label: 'مضاد إعادة التوجيه' },
  { key: 'antiMedia', names: ['قفل_الوسائط', 'تفعيل_الوسائط'], label: 'مضاد الوسائط' },
  { key: 'antiStickers', names: ['قفل_الملصقات', 'تفعيل_الملصقات'], label: 'مضاد الملصقات' },
  { key: 'antiBots', names: ['قفل_البوتات', 'تفعيل_البوتات'], label: 'فحص الأجهزة المرتبطة' },
];

for (const feature of protectionCommands) {
  if (feature.supported === false) continue;

  register(feature.names, `تفعيل ${feature.label}`, async (ctx) => {
    if (!ctx.jid.endsWith('@g.us')) {
      await ctx.reply('⛔ هذا الأمر يعمل داخل المجموعات فقط.');
      return;
    }

    if (!ctx.isAdmin) {
      await ctx.reply('🔒 تفعيل وإيقاف الحماية للمشرفين فقط.');
      return;
    }

    const enabled = feature.names[0] === ctx.command;

    await ctx.settingsStore.setProtection(
      ctx.jid,
      feature.key,
      enabled
    );

    await ctx.reply(
      `${enabled ? '🟢 تم تفعيل' : '🔴 تم إيقاف'} ${feature.label}.\n` +
      '💾 تم حفظ الإعداد للمجموعة.'
    );
  }, '🛡️');
}

register(['قفل'], 'منع الأعضاء من إرسال الرسائل', async (ctx) => {
  if (!ctx.jid.endsWith('@g.us')) {
    await ctx.reply('⛔ هذا الأمر للمجموعات فقط.');
    return;
  }

  if (!ctx.isAdmin) {
    await ctx.reply('🔒 هذا الأمر للمشرفين فقط.');
    return;
  }

  const metadata = await ctx.sock.groupMetadata(ctx.jid);
  const botIds = [
    ctx.sock.user?.id,
    ctx.sock.user?.lid
  ].filter(Boolean).map(value => String(value).replace(/:\d+@/, '@'));

  const botParticipant = metadata.participants?.find(item => {
    const ids = [item.id, item.lid, item.jid, item.phoneNumber]
      .filter(Boolean)
      .map(value => String(value).replace(/:\d+@/, '@'));

    return ids.some(id => botIds.includes(id));
  });

  if (!['admin', 'superadmin'].includes(botParticipant?.admin)) {
    await ctx.reply('⚠️ يجب أن يكون ALVARIA مشرفًا حتى يقفل المجموعة.');
    return;
  }

  await ctx.sock.groupSettingUpdate(ctx.jid, 'announcement');
  await ctx.reply('🔒 تم قفل المجموعة. يمكن للمشرفين فقط إرسال الرسائل.');
}, '🔒');

register(['فتح'], 'السماح لجميع الأعضاء بإرسال الرسائل', async (ctx) => {
  if (!ctx.jid.endsWith('@g.us')) {
    await ctx.reply('⛔ هذا الأمر للمجموعات فقط.');
    return;
  }

  if (!ctx.isAdmin) {
    await ctx.reply('🔒 هذا الأمر للمشرفين فقط.');
    return;
  }

  const metadata = await ctx.sock.groupMetadata(ctx.jid);
  const botIds = [
    ctx.sock.user?.id,
    ctx.sock.user?.lid
  ].filter(Boolean).map(value => String(value).replace(/:\d+@/, '@'));

  const botParticipant = metadata.participants?.find(item => {
    const ids = [item.id, item.lid, item.jid, item.phoneNumber]
      .filter(Boolean)
      .map(value => String(value).replace(/:\d+@/, '@'));

    return ids.some(id => botIds.includes(id));
  });

  if (!['admin', 'superadmin'].includes(botParticipant?.admin)) {
    await ctx.reply('⚠️ يجب أن يكون ALVARIA مشرفًا حتى يفتح المجموعة.');
    return;
  }

  await ctx.sock.groupSettingUpdate(ctx.jid, 'not_announcement');
  await ctx.reply('🔓 تم فتح المجموعة. يمكن لجميع الأعضاء إرسال الرسائل.');
}, '🔓');




// ======================================================
// ❄️ HINATA — NATIVE SELECT MENUS
// ======================================================

function hinataFooter() {
  const now = new Date();
  let dateTime = '';

  try {
    dateTime = new Intl.DateTimeFormat('ar-MA', {
      dateStyle: 'short',
      timeStyle: 'short'
    }).format(now);
  } catch {
    dateTime = now.toLocaleString();
  }

  return `اختر ثم اضغط إرسال • ${dateTime} • 𝑨𝒍𝒗𝒂𝒓𝒊𝒂 ❄️`;
}

async function sendHinataSelect(ctx, text, rows, sectionTitle = 'الأقسام', buttonTitle = '📋 اختيار قسم', imageSectionKey = sectionTitle) {
  const { sendHinataNativeButtons } =
    await import('../lib/native-buttons.js');

  let imageBuffer = null;

  try {
    const { getSubbotSectionImage } =
      await import('../lib/subbot-section-images.js');

    imageBuffer = await getSubbotSectionImage(ctx, imageSectionKey);
  } catch (error) {
    console.error('[ALVARIA SECTION HEADER IMAGE ERROR]', error);
  }

  // ALVARIA_UNIFIED_SECTION_GUIDE_V1
  // إنشاء دليل نصي من نفس بيانات القائمة دون تغيير الأزرار أو معرّفاتها.
  const guideRows = Array.isArray(rows)
    ? rows.filter(row => {
        const id = String(row?.id || '').trim();
        const title = String(row?.title || '').trim();

        return id &&
          title &&
          !/^\.(اوامر|رجوع|عودة)$/u.test(id) &&
          !/عودة|رجوع إلى|العودة إلى/u.test(title);
      })
    : [];

  const guideText = guideRows.length
    ? [
        '',
        '*❅ دَلِـيـلُ أَوَامِـرِ القِـسْـم ❅*',
        '*『 𝑨𝑳𝑽𝑨𝑹𝑰𝑨 • 𝑪𝑶𝑴𝑴𝑨𝑵𝑫𝑺 』*',
        '',
        ...guideRows.flatMap(row => {
          const title = String(row.title).trim();
          const description = String(row.description || '').trim();
          const id = String(row.id).trim();

          return [
            `*•┆❄️〖 ${id} 〗*`,
            description
              ? `⟞ ${description}`
              : `⟞ ${title}`,
            ''
          ];
        }),
        '*❅ اختر الأمر من القائمة التفاعلية بالأسفل ❅*'
      ].join('\n')
    : '';

  const unifiedMenuText = [
    String(text || '').trim(),
    guideText,
    '',
    '*╰━━〔 ❄️ 𝑨𝑳𝑽𝑨𝑹𝑰𝑨 〕━━╯*'
  ].filter(Boolean).join('\n');

  return sendHinataNativeButtons(ctx.sock, ctx.jid, {
    imageBuffer,

    text: formatHinataReply(unifiedMenuText, { menu: true }),
    title: '❄️ 𝑨𝒍𝒗𝒂𝒓𝒊𝒂',
    footer: hinataFooter(),
    buttons: [{
      type: 'single_select',
      title: buttonTitle,
      sections: [{
        title: sectionTitle,
        rows: rows.map(row => ({
          title: String(row.title).slice(0, 24),
          ...(row.description
            ? { description: String(row.description).slice(0, 72) }
            : {}),
          id: String(row.id)
        }))
      }]
    }]
  });
}

const HINATA_FRAME = {
  top: '╭━━〔 ❄️ 𝑨𝒍𝒗𝒂𝒓𝒊𝒂 ❅ 〕━━╮',
  bottom: '╰━━〔 ❅ 𝑨𝒍𝒗𝒂𝒓𝒊𝒂 • BOT 〕━━╯'
};

async function getHinataCommandCount() {
  try {
    const { readdir, readFile } = await import('node:fs/promises');
    const { fileURLToPath } = await import('node:url');
    const root = fileURLToPath(new URL('../', import.meta.url));
    const names = new Set();

    async function scan(dir) {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = `${dir}/${entry.name}`;

        if (entry.isDirectory()) {
          await scan(full);
          continue;
        }

        if (!entry.isFile() || !entry.name.endsWith('.js')) continue;

        const content = await readFile(full, 'utf8');
        const pattern =
          /\bregister\s*\(\s*(\[[^\]]*\]|(['"])(?:\\.|[\s\S])*?\2)\s*,/g;

        for (const match of content.matchAll(pattern)) {
          for (const item of match[1].matchAll(/['"]([^'"]+)['"]/g)) {
            names.add(item[1]);
          }
        }
      }
    }

    await scan(root);
    return names.size;
  } catch {
    return 'غير متاح';
  }
}


// ======================================================
// ❄️ ALVARIA — UNIFIED PROTECTION CENTER
// الحماية + الإدارة + معلومات البوت في مركز واحد
// ======================================================

const protectionDescriptions = {
  antiLinks: 'يراقب الروابط المرسلة داخل المجموعة.',
  antiContacts: '📇 يحذف بطاقة جهة الاتصال المخالفة، يقفل المجموعة مؤقتًا، ثم يحاول إزالة العضو بعد التحقق من هويته وصلاحيات البوت.',
  antiNumbers: 'يراقب الرسائل التي تحتوي على أرقام.',
  antiSpam: 'يرصد تكرار الرسائل المزعج من العضو.',
  antiMentions: 'يراقب الإشارات إلى أعضاء المجموعة.',
  antiForwarded: 'يراقب الرسائل المعاد توجيهها.',
  antiMedia: 'يراقب إرسال الصور والفيديو والملفات الصوتية والمستندات.',
  antiStickers: '🎨 يكتشف الملصقات المرسلة ويحذف الرسائل التي تحتوي عليها بشكل مستقل عن مضاد الوسائط.',
  antiBots: 'يفحص الأجهزة الإضافية المتاحة ويرسل تنبيهًا معلوماتيًا عند دخول عضو.'
};

const protectionNames = {
  antiLinks: 'مضاد الروابط',
  antiContacts: '📇 يحذف بطاقة جهة الاتصال المخالفة، يقفل المجموعة مؤقتًا، ثم يحاول إزالة العضو بعد التحقق من هويته وصلاحيات البوت.',
  antiNumbers: 'مضاد الأرقام',
  antiSpam: 'مضاد التكرار',
  antiMentions: 'مضاد المنشن',
  antiForwarded: 'مضاد إعادة التوجيه',
  antiMedia: 'مضاد الوسائط',
  antiBots: 'مضاد البوتات'
};


async function showProtectionCenter(ctx) {
  if (!ctx.jid.endsWith('@g.us')) {
    await ctx.reply('⛔ افتح قسم الحماية داخل المجموعة.');
    return;
  }

  const { sendHinataNativeButtons } =
    await import('../lib/native-buttons.js');
  let imageBuffer = null;
  try {
    const { getSubbotSectionImage } = await import('../lib/subbot-section-images.js');
    imageBuffer = await getSubbotSectionImage(ctx, 'الحماية');
  } catch (error) {
    console.error('[ALVARIA SECTION IMAGE ERROR]', error);
  }


  const settings = await ctx.settingsStore.get(ctx.jid);
  const protection = settings?.protection || {};

  const supported = protectionCommands.filter(
    feature => feature.supported !== false
  );

  const active = supported.filter(
    feature => protection[feature.key] === true
  ).length;

  const descriptions = {
    antiLinks: '🔗 منع الروابط',
    antiContacts: '📇 منع بطاقات جهات الاتصال',
    antiNumbers: '🔢 منع أرقام الهواتف',
    antiSpam: '♻️ منع التكرار المزعج',
    antiMentions: '📣 منع المنشن',
    antiForwarded: '↪️ منع إعادة التوجيه',
    antiMedia: '🖼️ منع الوسائط',
    antiStickers: '🎨 منع الملصقات',
    antiBots: '📱 فحص الأجهزة الإضافية عند دخول عضو'
  };

  const rows = protectionCommands.map(feature => {
    const enabled = protection[feature.key] === true;
    const unavailable = feature.supported === false;
    const status = unavailable ? '⚪ غير متاح' : enabled ? '🟢 مفعّل' : '🔴 متوقف';

    return {
      title: status + ' • ' + feature.label,
      description: descriptions[feature.key] || feature.label,
      id: '.اختيار_حماية_' + feature.key
    };
  });

  rows.push({
    title: '⬅️ الرجوع إلى القائمة الرئيسية',
    description: 'العودة إلى قائمة ALVARIA',
    id: '.اوامر'
  });

  const lines = [
    '*╭━━━━━━〔 ❄️ 𝑨𝒍𝒗𝒂𝒓𝒊𝒂 〕━━━━━━╮*',
    '',
    '*❅ مَـرْكَـزُ الـحِـمَـايَـة ❅*',
    '_ALVARIA SECURITY CENTER_',
    '',
    '*🛡️ حالة حماية المجموعة*',
    '❃ المضادات المفعّلة: *' + active + ' / ' + supported.length + '*',
    '',
    '*❅ أنظمة الحماية*',
    ''
  ];

  for (const feature of protectionCommands) {
    const enabled = protection[feature.key] === true;
    const unavailable = feature.supported === false;
    const status = unavailable ? '⚪ غير متاح' : enabled ? '🟢 مفعّل' : '🔴 متوقف';
    lines.push(
      '*' + status + ' • ' + feature.label + '*',
      '_' + (descriptions[feature.key] || feature.label) + '_',
      ''
    );
  }

  lines.push(
    '*❃ طريقة التحكم*',
    '_اختر نظام الحماية من القائمة التفاعلية بالأسفل._',
    '_ستظهر لك خيارات التحكم المسجلة لهذا النظام._',
    '',
    '*⚠️ ملاحظات*',
    '_إعدادات الحماية تخص هذه المجموعة._',
    '_المضادات غير المتاحة لا تدخل في حساب التفعيل._',
    '',
    '*╰━━━━━━〔 ❄️ ALVARIA 〕━━━━━━╯*'
  );

  await sendHinataNativeButtons(ctx.sock, ctx.jid, {
    imageBuffer,
    text: formatHinataReply(lines.join('\n'), { menu: true }),
    title: '❄️ ALVARIA • SECURITY',
    footer: '❅ ALVARIA SECURITY CENTER',
    buttons: [{
      type: 'single_select',
      title: '🛡️ إدارة أنظمة الحماية',
      sections: [{
        title: '❄️ مضادات الحماية',
        rows
      }]
    }]
  });
}


// ======================================================
// ☄️ ALVARIA UNIVERSE — قسم النخبة القابل للتوسعة
// لإضافة أمر مستقبلاً: أضف عنصرًا داخل HINATA_UNIVERSE_ITEMS.
// title: اسم الزر، description: وصفه، id: الأمر المسجل.
// ======================================================


// ======================================================
// ☄️ ALVARIA UNIVERSE — قسم النخبة
// لإضافة خيارات مستقبلية: أضف عناصر إلى HINATA_UNIVERSE_ITEMS.
// ======================================================

const HINATA_UNIVERSE_ITEMS = [
  {
    title: '🎮 اختر لعبة',
    description: 'تصفح الألعاب واختر اللعبة التي تريدها',
    id: '.قسم_الألعاب'
  },
  {
    title: '🎉 اختر فعالية',
    description: 'تصفح الفعاليات واختر الفعالية التي تريدها',
    id: '.قسم_الفعاليات'
  },
  {
    title: '🖼️ شرح أمر البروفايل',
    description: 'تعرف على طريقة عرض صورة حساب أي شخص',
    id: '.شرح_بروفايل'
  },
  {
    title: '📖 شرح أمر الحزمة',
    description: 'تعرف على طريقة إنشاء حزمة ملصقات من Pinterest',
    id: '.شرح_حزمة'
  },
  {
    title: '🔎 كشف صورة أو فيديو',
    description: 'رد على صورة أو فيديو واكتب .كشف لإعادة إرساله',
    id: '.كشف'
  }
];



// ======================================================
// ======================================================
// 🔎 HINATA MEDIA REVEAL — كشف الوسائط المقتبسة العادية
// ======================================================
register(
  ['كشف'],
  'إعادة إرسال الصورة أو الفيديو المقتبس',
  async ctx => {
    const raw = ctx.message?.message || {};

    const wrappers = [
      'ephemeralMessage',
      'documentWithCaptionMessage',
      'deviceSentMessage',
      'editedMessage'
    ];

    function unwrapNormal(message) {
      let current = message || {};

      for (let i = 0; i < 8; i += 1) {
        if (
          current.viewOnceMessage ||
          current.viewOnceMessageV2 ||
          current.viewOnceMessageV2Extension
        ) {
          return { viewOnce: true, message: current };
        }

        let next = null;

        for (const key of wrappers) {
          if (current?.[key]?.message) {
            next = current[key].message;
            break;
          }
        }

        if (!next) break;
        current = next;
      }

      return { viewOnce: false, message: current };
    }

    const incoming = unwrapNormal(raw);

    const contextInfo =
      incoming.message?.extendedTextMessage?.contextInfo ||
      incoming.message?.imageMessage?.contextInfo ||
      incoming.message?.videoMessage?.contextInfo ||
      incoming.message?.documentMessage?.contextInfo ||
      getMessageContextInfo(raw);

    const quoted = contextInfo?.quotedMessage;

    if (!quoted) {
      return ctx.reply(
        '⚠️ ردّ على صورة أو فيديو عادي أولاً، ثم اكتب .كشف'
      );
    }

    const unwrapped = unwrapNormal(quoted);

    if (unwrapped.viewOnce) {
      return ctx.reply(
        '🔒 لا يمكن إعادة إرسال وسائط العرض لمرة واحدة.'
      );
    }

    const quotedContent = unwrapped.message;

    const mediaType = quotedContent?.imageMessage
      ? 'image'
      : quotedContent?.videoMessage
        ? 'video'
        : null;

    if (!mediaType) {
      return ctx.reply(
        '⚠️ الرسالة المقتبسة ليست صورة أو فيديو مدعوماً.'
      );
    }

    const mediaNode = quotedContent[`${mediaType}Message`];
    const maxBytes = mediaType === 'video'
      ? 64 * 1024 * 1024
      : 20 * 1024 * 1024;

    try {
      const stream = await downloadContentFromMessage(
        mediaNode,
        mediaType
      );

      const chunks = [];
      let totalBytes = 0;

      for await (const chunk of stream) {
        const part = Buffer.from(chunk);
        totalBytes += part.length;

        if (totalBytes > maxBytes) {
          throw new Error('MEDIA_TOO_LARGE');
        }

        chunks.push(part);
      }

      if (!totalBytes) {
        throw new Error('EMPTY_MEDIA');
      }

      const buffer = Buffer.concat(chunks);

      const payload = mediaType === 'image'
        ? {
            image: buffer,
            caption: '🖼️ تم استلام الصورة',
            ...(mediaNode.mimetype
              ? { mimetype: mediaNode.mimetype }
              : {})
          }
        : {
            video: buffer,
            caption: '🎬 تم استلام الفيديو',
            ...(mediaNode.mimetype
              ? { mimetype: mediaNode.mimetype }
              : {})
          };

      await ctx.sock.sendMessage(
        ctx.jid,
        payload,
        { quoted: ctx.message }
      );

    } catch (error) {
      console.error('[HINATA:كشف] Media error:', error);

      if (error?.message === 'MEDIA_TOO_LARGE') {
        return ctx.reply('⚠️ حجم الوسيط يتجاوز الحد المسموح.');
      }

      if (error?.message === 'EMPTY_MEDIA') {
        return ctx.reply('⚠️ لم يتم العثور على محتوى الوسيط.');
      }

      return ctx.reply(
        '❌ تعذر تحميل الوسيط. تحقق من صلاحية الرسالة واتصال البوت.'
      );
    }
  },
  '🔎'
);

// ======================================================
// 🖼️ ALVARIA PROFILE COMMAND
// يعرض صورة الشخص عند الرد على رسالته أو عمل منشن له.
// ======================================================

function isValidProfileJid(value) {
  return typeof value === 'string' &&
    /@(s\.whatsapp\.net|c\.us|lid)$/.test(value.trim());
}

function findProfileMention(message) {
  const found = [];
  const visited = new Set();

  function walk(value) {
    if (!value || typeof value !== 'object' || visited.has(value)) return;
    visited.add(value);

    if (Array.isArray(value.mentionedJid)) {
      found.push(...value.mentionedJid);
    }

    for (const item of Object.values(value)) {
      if (item && typeof item === 'object') walk(item);
    }
  }

  walk(message?.message);

  return found.find(isValidProfileJid) || null;
}

async function resolveProfilePictureUrl(sock, jid) {
  if (typeof sock?.profilePictureUrl !== 'function') return null;

  const candidates = [jid];

  // عند توفر تحويل LID إلى رقم الهاتف، نجرب المعرفين.
  if (jid.endsWith('@lid')) {
    try {
      const mapping = sock.signalRepository?.lidMapping;

      if (typeof mapping?.getPNForLID === 'function') {
        const phoneJid = await mapping.getPNForLID(jid);

        if (isValidProfileJid(phoneJid) && !candidates.includes(phoneJid)) {
          candidates.push(phoneJid);
        }
      }
    } catch {}
  }

  for (const candidate of candidates) {
    try {
      const url = await sock.profilePictureUrl(candidate, 'image');

      if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
        return url;
      }
    } catch {}
  }

  return null;
}

register(
  ['بروفايل'],
  'عرض صورة الملف الشخصي للشخص بالرد أو المنشن',
  async ctx => {
    // الأولوية للرد على الرسالة، ثم المنشن.
    let target = isValidProfileJid(ctx.quotedParticipant)
      ? ctx.quotedParticipant
      : null;

    if (!target) {
      target = findProfileMention(ctx.message);
    }

    if (!target) {
      await ctx.reply(
        '🖼️ استخدم الأمر بهذه الطريقة:\\n\\n' +
        '1. رد على رسالة الشخص واكتب .بروفايل\\n' +
        '2. أو اكتب .بروفايل مع منشن الشخص.'
      );
      return;
    }

    const pictureUrl = await resolveProfilePictureUrl(ctx.sock, target);

    if (!pictureUrl) {
      await ctx.reply(
        '❄️ لم أتمكن من العثور على صورة بروفايل متاحة لهذا الشخص.\\n' +
        'قد تكون صورته مخفية بسبب إعدادات الخصوصية أو غير متاحة.'
      );
      return;
    }

    await ctx.sock.sendMessage(
      ctx.jid,
      {
        image: { url: pictureUrl },
        caption: formatHinataReply(
          '🖼️ 𝑨𝒍𝒗𝒂𝒓𝒊𝒂 • 𝑷𝑹𝑶𝑭𝑰𝑳𝑬\\n\\n' +
          '❄️ تم العثور على صورة الملف الشخصي.'
        )
      },
      { quoted: ctx.message }
    );
  },
  '🖼️'
);


// HINATA_CRM_SNIP_COMMAND_V1
register(
  ['crm-snip'],
  'إرسال رسالة ALVARAI التفاعلية',
  async ctx => {
    const sender = ctx.senderJid;
    let header = { title: '𝗔𝗟𝗩𝗔𝗥𝗔𝗜' };

    try {
      const pictureUrl = isValidProfileJid(sender)
        ? await resolveProfilePictureUrl(ctx.sock, sender)
        : null;

      if (pictureUrl) {
        const baileys = await import('@whiskeysockets/baileys');
        const prepareWAMessageMedia =
          baileys.prepareWAMessageMedia ||
          baileys.default?.prepareWAMessageMedia;

        if (typeof prepareWAMessageMedia !== 'function') {
          throw new Error('prepareWAMessageMedia غير متاحة');
        }

        const prepared = await prepareWAMessageMedia(
          { image: { url: pictureUrl } },
          { upload: ctx.sock.waUploadToServer.bind(ctx.sock) }
        );

        if (!prepared?.imageMessage) {
          throw new Error('تعذر تجهيز صورة البروفايل');
        }

        header = {
          title: '𝗔𝗟𝗩𝗔𝗥𝗔𝗜',
          hasMediaAttachment: true,
          imageMessage: prepared.imageMessage
        };
      }
    } catch (error) {
      console.error('[CRM-SNIP] Profile image error:', error);
    }

    await ctx.sock.relayMessage(
      ctx.jid,
      {
        interactiveMessage: {
          header,
          body: {
            text: '*⸂❌⸃╎فــشــل تــعــديــل الــوســائــط — الــمــصــادر غــيــر مــتــاحــة حــالــيًــا، حــاول لاحــقًــا ⇂*'
          },
          nativeFlowMessage: {
            buttons: [
              {
                name: 'inapp_signup',
                buttonParamsJson: '{}'
              }
            ],
            messageParamsJson: ''
          },
          contextInfo: {
            mentionedJid: [sender],
            quotedMessage: {
              extendedTextMessage: {
                endCardTiles: [],
                text: '.crm-snip',
                previewType: 0,
                inviteLinkGroupTypeV2: 0
              }
            }
          }
        }
      },
      {}
    );
  },
  '❌'
);
// END HINATA_CRM_SNIP_COMMAND_V1



// زر شرح الأمر داخل قسم النخبة.
register(
  ['شرح_بروفايل'],
  'شرح طريقة استخدام أمر البروفايل',
  async ctx => {
    const help = `*🖼️ شــرح أمــر الــبــروفــايــل*

❄️ يــعــرض صــورة الــمــلــف الــشــخــصــي لــلــشــخــص الــذي تــخــتــاره.

*الــطــريــقــة الــأولــى: الــرد*
رد عــلــى رســالــة الــشــخــص واكــتــب:
.بروفايل

*الــطــريــقــة الــثــانــيــة: الــمــنــشــن*
اكــتــب الــأمــر مــع مــنــشــن الــشــخــص:
.بروفايل @الــشــخــص

❅ إذا كــانــت الــصــورة مــخــفــيــة أو غــيــر مــتــاحــة، ســيــخــبــرك الــبــوت بــذلــك.`;

    await ctx.reply(help);
  },
  '📖'
);

register(
  ['شرح_حزمة'],
  'شرح طريقة إنشاء حزمة ملصقات',
  async ctx => {
    await ctx.reply(
      '*📦 شــرح أمــر الــحــزمــة*\n\n' +
      '❄️ ينشئ لك حزمة ملصقات من الصور التي يعثر عليها في Pinterest.\n\n' +
      '*طريقة الاستخدام:*\n' +
      '.حزمة هيناتا\n' +
      '.حزمه ناروتو\n\n' +
      `📦 اسم الحزمة: ❄️ 𝑯𝑼𝑵𝑰𝑽\n` +
      '✨ بعد تجهيز الحزمة ستصلك رسالة الحزمة لإضافتها من واتساب.'
    );
  },
  '📖'
);

// HINATA_PROFILE_COMMAND_V1

register(
  ['قسم_النخبة', 'نخبة'],
  'قسم النخبة — ALVARIA UNIVERSE',
  async ctx => {
    const rows = [
      ...HINATA_UNIVERSE_ITEMS.map(item => ({
        title: item.title,
        description: item.description,
        id: item.id
      })),
      {
        title: '⬅️ رجوع إلى الأقسام',
        description: 'العودة إلى قائمة ALVARIA الرئيسية',
        id: '.اوامر'
      }
    ];

    const text = [
      '*╭━━〔 ❄️ 𝑨𝑳𝑽𝑨𝑹𝑰𝑨 〕━━╮*',
      '',
      '*☄️ مَـرْكَـزُ الـنُّـخْـبَـة*',
      '*『 𝑨𝑳𝑽𝑨𝑹𝑰𝑨 • 𝑼𝑵𝑰𝑽𝑬𝑹𝑺𝑬 』*',
      '',
      '*❅ عالم الألعاب والفعاليات والأدوات الخاصة*',
      '⟞ تصفح الخيارات واختر الخدمة التي تريد استخدامها.',
      '',
      '*❅ اختر الأمر من القائمة التفاعلية بالأسفل ❅*'
    ].join('\n');

    await sendHinataSelect(
      ctx,
      text,
      rows,
      '☄️ 𝑨𝒍𝒗𝒂𝒓𝒊𝒂 𝑼𝑵𝑰𝑽𝑬𝑹𝑺',
      '☄️ اختر من النخبة',
      'عالم_ALVARIA'
    );
  },
  '☄️'
);

async function showMainSectionsMenu(ctx) {
  // فيديو دائري اختياري: البوتات الفرعية فقط، قبل القائمة.
  if (ctx.subbotSessionId) {
    try {
      const menuVideoBuffer = await getSubbotCommandVideo(ctx, 'menu');

      if (menuVideoBuffer) {
        await ctx.sock.sendMessage(
          ctx.jid,
          {
            video: menuVideoBuffer,
            mimetype: 'video/mp4',
            ptv: true
          },
          { quoted: ctx.message }
        );
      }
    } catch (error) {
      console.error('[ALVARIA SUBBOT MENU VIDEO ERROR]', error);
      // فشل الفيديو لا يمنع ظهور القائمة.
    }
  }

  const rows = [
    { title: '❄️ الحماية والأمان', id: '.قسم_مضاد_الحماية', description: 'حماية المجموعة والتحكم في أنظمة الأمان' },
    { title: '🍹 المراسم والترحيب', id: '.مراسم', description: 'إعدادات الترحيب والمراسم' },
    { title: '⚙️ الإدارة والتحكم', id: '.خيارات_الإدارة', description: 'أدوات الإدارة والتحكم' },
    { title: '👥 إدارة المجموعة', id: '.قسم_إدارة_المجموعة', description: 'إعدادات المجموعة وأدواتها' },
    { title: '🛡️ إدارة الأعضاء', id: '.قائمة_أوامر_الأعضاء', description: 'إدارة الأعضاء والإنذارات والكتم' },
    { title: '🎉 الفعاليات', id: '.قسم_الفعاليات', description: 'أدوات الفعاليات والأنشطة' },
    { title: '🎲 العشوائيات', id: '.قسم_العشوائيات', description: 'أوامر التسلية والعشوائيات' },
    { title: '🎮 الألعاب', id: '.قسم_الألعاب', description: 'مجموعة ألعاب البوت' },
    { title: '🤖 البوتات الفرعية', id: '.قسم_تحكم_البوت_الفرعي', description: 'إدارة البوتات الفرعية' },
    { title: '🎵 الميديا', id: '.قسم_الميديا', description: 'الموسيقى والصور والفيديوهات' },
    { title: '🤖 الذكاء الاصطناعي', id: '.قسم_الذكاء', description: 'أوامر ومساعدات الذكاء الاصطناعي' },
    { title: '🎨 الملصقات', id: '.قسم_الملصقات', description: 'أدوات الملصقات' },
    { title: '❄️ عالم ALVARIA', id: '.قسم_النخبة', description: 'عالم ALVARIA والأقسام الخاصة' },
    { title: 'ℹ️ معلومات البوت', id: '.معلومات_البوت', description: 'معلومات حول البوت' }
  ];

  const menuText = [
    '*❄️ 𝑨𝒍𝒗𝒂𝒓𝒊𝒂*',
    '_مرحباً بك في القائمة الرئيسية._',
    '',
    '*❄️ الأقسام المتاحة*',
    '_اختر القسم الذي تريد استكشافه من القائمة أدناه._',
    '',
    '🍹 جميع الأقسام وأوامرها متاحة من هنا.',
    '',
    '❄️ 𝑨𝒍𝒗𝒂𝒓𝒊𝒂'
  ].join('\n');

  return sendHinataSelect(ctx, menuText, rows, 'الرئيسية', '📋 اختيار قسم');
}
register(
  ['اوامر', 'الأوامر', 'قائمة_الأقسام'],
  'قائمة أقسام ALVARIA',
  showMainSectionsMenu,
  '❅'
);


// ❅ مركز التحكم في البوت الفرعي — ALVARIA SUBBOT CONTROL.
// 🎮 مركز ألعاب ALVARIA — إضافة الألعاب مستقبلًا من قائمة واحدة.
register(
  ['قسم_الألعاب'],
  'مركز ألعاب ALVARIA',
  async ctx => {
    const games = [
      {
        title: '♟️ الشطرنج ضد ALVARIA',
        description: 'العب الشطرنج على رقعة تفاعلية',
        id: '.شطرنج'
      },
      {
        title: '❎ تحدي XO',
        description: 'لعبة إكس أو التفاعلية ضد ALVARIA',
        id: '.xo'
      },
      {
        title: '💰 من سيربح المليون؟',
        description: '15 سؤالًا ومساعدات للوصول إلى المليون',
        id: '.المليون'
      },
      {
        title: '🎯 المشنقة',
        description: 'اكتشف الكلمة المخفية بالحروف',
        id: '.المشنقة'
      },
      {
        title: '🐍 ALVARIA SNAKE',
        description: 'اجمع الفواكه وتجنب الاصطدام',
        id: '.ثعبان'
      },
      {
        title: '🏎️ ALVARIA CITY RACING',
        description: 'سباقات السيارات وعالم القيادة',
        id: '.سباق_السيارات'
      },
      {
        title: '🎴 ALVARIA UNO',
        description: 'لعبة أوراق ملونة ضد المنافسين',
        id: '.uno'
      }
    ];

    const menuText = [
      '*╭━━━━━━〔 ❄️ 𝑨𝒍𝒗𝒂𝒓𝒊𝒂 〕━━━━━━╮*',
      '',
      '*🎮 مَـرْكَـزُ الأَلْـعَـاب*',
      '_𝑨𝑳𝑽𝑨𝑹𝑰𝑨 • 𝑮𝑨𝑴𝑬𝑺 𝑨𝑹𝑪𝑨𝑫𝑬_',
      '',
      '❅ مرحبًا بك في عالم ألعاب ALVARIA.',
      '_اختر لعبتك المفضلة من القائمة التفاعلية أدناه._',
      '',
      '*♟️ ألعاب الذكاء والتفكير*',
      '❃ الشطرنج • XO • من سيربح المليون؟',
      '',
      '*🎯 ألعاب التحدي والتسلية*',
      '❃ المشنقة • الثعبان • UNO',
      '',
      '*🏎️ ألعاب السباقات*',
      '❃ ALVARIA CITY RACING',
      '',
      '*📌 طريقة اللعب*',
      '_1. اختر اللعبة من القائمة._',
      '_2. اضغط على اسم اللعبة._',
      '_3. اتبع التعليمات التي تظهر لك._',
      '',
      '*❄️ استمتع بألعاب ALVARIA!*',
      '',
      '*╰━━━━━━〔 ❅ MADE BY ALVARIA ❅ 〕━━━━━━╯*'
    ].join('\n');

    await sendHinataSelect(
      ctx,
      menuText,
      [
        ...games,
        {
          title: '⬅️ العودة إلى القائمة الرئيسية',
          description: 'الرجوع إلى أقسام ALVARIA',
          id: '.اوامر'
        }
      ],
      '🎮 ALVARIA GAME CENTER',
      '❄️ اختر لعبتك',
      'الألعاب'
    );
  },
  '🎮'
);

// ALVARIA_SUBBOT_CONTROL_CENTER_V2
  register(
    ['قسم_تحكم_البوت_الفرعي'],
    'مركز تحكم ALVARIA للبوت الفرعي',
    async ctx => {
      const menuText = [
        '*╭━━━━━━〔 ❄️ 𝑨𝒍𝒗𝒂𝒓𝒊𝒂 〕━━━━━━╮*',
        '',
        '*❅ مَـرْكَـزُ تَـحَـكُّـمِ الـبُـوتِ الـفَـرْعِـي*',
        '_SUBBOT CONTROL CENTER_',
        '',
        '*❃ أوامر التحكم المتاحة:*',
        '',
        '*🌙 إيقاف الردود*',
        '❃ الأمر: `.نام`',
        '_يوقف البوت الفرعي عن الرد على الرسائل._',
        '',
        '*☀️ إعادة الردود*',
        '❃ الأمر: `.استيقط`',
        '_يعيد البوت الفرعي إلى وضع الرد الطبيعي._',
        '',
        '*👤 الوضع الخاص*',
        '❃ الأمر: `.خاص`',
        '_يجعل البوت الفرعي يرد على صاحب البوت الفرعي فقط._',
        '',
        '*🌍 الوضع العام*',
        '❃ الأمر: `.عام`',
        '_يسمح للبوت الفرعي بالرد على الجميع._',
        '',
        '*🛡️ وضع المشرفين*',
        '❃ الأمر: `.مود ادمن`',
        '_يجعل البوت الفرعي يرد على مشرفي المجموعة وصاحب البوت الفرعي فقط._',
        '',
        '*👥 وضع الأعضاء*',
        '❃ الأمر: `.مود اعضاء`',
        '_يسمح للبوت الفرعي بالرد على جميع أعضاء المجموعة._',
        '',
        '*❅ طريقة الاستخدام:*',
        '_اختر شرح الأمر من القائمة التفاعلية، وستظهر لك وظيفته._',
        '_أزرار الشرح لا تنفذ أوامر التحكم مباشرة._',
        '',
        '*╰━━━━━━〔 ❄️ ALVARIA 〕━━━━━━╯*'
      ].join('\n');

      await sendHinataSelect(
        ctx,
        menuText,
        [
          {
            title: '🌙 شرح `.نام`',
            description: 'إيقاف ردود البوت الفرعي',
            id: '.شرح_نام'
          },
          {
            title: '☀️ شرح `.استيقط`',
            description: 'إعادة الرد الطبيعي',
            id: '.شرح_استيقط'
          },
          {
            title: '👤 شرح `.خاص`',
            description: 'الرد على صاحب البوت فقط',
            id: '.شرح_خاص'
          },
          {
            title: '🌍 شرح `.عام`',
            description: 'السماح بالرد على الجميع',
            id: '.شرح_عام'
          },
          {
            title: '🛡️ شرح `.مود ادمن`',
            description: 'الرد على المشرفين والمالك',
            id: '.شرح_مود_ادمن'
          },
          {
            title: '👥 شرح `.مود اعضاء`',
            description: 'السماح بالرد على جميع الأعضاء',
            id: '.شرح_مود_اعضاء'
          },
          {
            title: '⬅️ رجوع إلى الأقسام',
            description: 'العودة إلى قائمة ALVARIA الرئيسية',
            id: '.اوامر'
          }
        ],
        '❄️ ALVARIA • SUBBOT',
        '❅ اختر الأمر الذي تريد شرحه',
        'تحكم_البوت_الفرعي'
      );
    },
    '❅'
  );

  // شروحات الأوامر — لا تنفذ أوامر التحكم.
  const subbotHelp = {
    'شرح_نام': {
      command: '.نام',
      title: '🌙 إيقاف البوت الفرعي',
      description: 'يوقف البوت الفرعي عن الرد على الرسائل.'
    },
    'شرح_استيقط': {
      command: '.استيقط',
      title: '☀️ إعادة تشغيل الردود',
      description: 'يعيد البوت الفرعي إلى وضع الرد الطبيعي بعد إيقافه.'
    },
    'شرح_خاص': {
      command: '.خاص',
      title: '👤 وضع الخاص',
      description: 'يجعل البوت الفرعي يرد على صاحب البوت الفرعي فقط.'
    },
    'شرح_عام': {
      command: '.عام',
      title: '🌍 الوضع العام',
      description: 'يسمح للبوت الفرعي بالرد على الجميع.'
    },
    'شرح_مود_ادمن': {
      command: '.مود ادمن',
      title: '🛡️ وضع المشرفين',
      description: 'يجعل البوت الفرعي يرد على مشرفي المجموعة وصاحب البوت الفرعي فقط.'
    },
    'شرح_مود_اعضاء': {
      command: '.مود اعضاء',
      title: '👥 وضع الأعضاء',
      description: 'يسمح للبوت الفرعي بالرد على جميع أعضاء المجموعة.'
    }
  };

  for (const [name, item] of Object.entries(subbotHelp)) {
    register(
      [name],
      'شرح أمر ' + item.command,
      async ctx => {
        await ctx.reply([
          '*╭━━━━━━〔 ❄️ ALVARIA 〕━━━━━━╮*',
          '',
          '*' + item.title + '*',
          '',
          '*❃ الأمر:*',
          '`' + item.command + '`',
          '',
          '*❃ الوظيفة:*',
          '_' + item.description + '_',
          '',
          '*⚠️ تنبيه:*',
          '_هذه رسالة شرح فقط، ولا يؤدي الضغط عليها إلى تنفيذ أمر التحكم._',
          '',
          '*╰━━━━━━〔 ❅ ALVARIA 〕━━━━━━╯*'
        ].join('\n'));
      },
      '📖'
    );
  }


register(
  ['قسم_مضاد_الحماية', 'قسم_الحماية'],
  'قسم مضاد الحماية',
  showProtectionCenter,
  '🛡️'
);


// HINATA_EVENTS_OLD_INTERFACES_REMOVED_V1



// ❄️ HINATA MEDIA CENTER — RANDOM MENU STYLE

register(
  ['قسم_الميديا'],
  'مركز الميديا التفاعلي',
  async ctx => {
    const { getSubbotSectionImage } =
      await import('../lib/subbot-section-images.js');

    const { sendHinataNativeButtons } =
      await import('../lib/native-buttons.js');

    let imageBuffer = null;

    try {
      imageBuffer = await getSubbotSectionImage(ctx, 'الميديا');
    } catch (error) {
      console.error('[HINATA MEDIA IMAGE ERROR]', error);
    }

    const text = [
      '*❃⋅━̊━̊━̊---━̊━̊━̊━̊❄️━̊━̊━̊━̊━̊━̊━̊⋅❃*',
      '',
      '*🌸 مَـرْكَـزُ هِـيـنـاتـا لِـلـمِـيـديـا*',
      '*『 HINATA • MEDIA STUDIO 』*',
      '',
      '╭━━〔 🎬 خدمات الميديا 〕━━╮',
      '',
      '🎵 الموسيقى:',
      'البحث عن الأغاني عبر SoundCloud.',
      '',
      '🖼️ الصور:',
      'البحث عن الصور عبر Pinterest.',
      '',
      '🎬 الإيديت:',
      'البحث عن مقاطع Funk Edits.',
      '',
      '📥 التحميل:',
      'البحث عن فيديو أو صوت بالاسم أو الرابط.',
      '',
      '❅ اختر الخدمة المناسبة من القائمة بالأسفل.',
      '',
      '*❃⋅━̊━̊━̊---━̊━̊━̊━̊❄️━̊━̊━̊━̊━̊━̊━̊⋅❃*',
      '*🌸 HINATA MEDIA CENTER*'
    ].join('\n');

    await sendHinataNativeButtons(ctx.sock, ctx.jid, {
      ...(imageBuffer ? { imageBuffer } : {}),
      text,
      footer: '🌸 HINATA • MEDIA STUDIO',
      buttons: [{
        type: 'single_select',
        title: '🎬 قائمة الميديا',
        sections: [
          {
            title: '❅ الموسيقى والصور',
            rows: [
              {
                title: '🎵 البحث عن أغنية',
                description: 'البحث في SoundCloud',
                id: '.اغنيه'
              },
              {
                title: '🖼️ البحث عن صورة',
                description: 'البحث في Pinterest',
                id: '.صورة'
              }
            ]
          },
          {
            title: '❅ الفيديوهات والتحميل',
            rows: [
              {
                title: '🎬 البحث عن إيديت',
                description: 'البحث عن Funk Edits',
                id: '.ايديت'
              },
              {
                title: '📥 تحميل فيديو أو صوت',
                description: 'البحث بالاسم أو استعمال رابط',
                id: '.تحميل'
              }
            ]
          },
          {
            title: '❅ التنقل',
            rows: [
              {
                title: '↩️ الرجوع إلى القائمة الرئيسية',
                description: 'العودة إلى قائمة أوامر HINATA',
                id: '.اوامر'
              }
            ]
          }
        ]
      }]
    });
  },
  '🎬'
);

// ❅ قسم الملصقات — ALVARIA Sticker Studio.

// ❅ قسم الملصقات — ALVARIA Sticker Studio.
// ❅ قسم الملصقات — ALVARIA Sticker Studio.

// ❄️ HINATA STICKER STUDIO — المركز التفاعلي الجديد

const sendStickerCategory = async (
  ctx,
  heading,
  subtitle,
  commands
) => {
  const rows = commands.map(([command, description]) => ({
    title: command,
    description,
    id: command
  }));

  // زر العودة إلى المركز
  rows.push({
    title: '⬅️ العودة إلى قسم الملصقات',
    description: 'الرجوع إلى مركز الملصقات الرئيسي',
    id: '.قسم_الملصقات'
  });

  const text = [
    '*╭━━〔 ❄️ 𝑨𝑳𝑽𝑨𝑹𝑰𝑨 〕━━╮*',
    '',
    '*🎨 مَـرْكَـزُ الـمُـلْـصَـقَـات*',
    '*『 𝑨𝑳𝑽𝑨𝑹𝑰𝑨 • STICKERS 』*',
    '',
    '*' + heading + '*',
    '_' + subtitle + '_',
    '',
    '❅ اختر الأمر الذي تريد تنفيذه من القائمة.',
    '❅ كل أمر يظهر في صف مستقل.',
    '',
    '*╰━━〔 ❄️ STICKER STUDIO 〕━━╯*'
  ].join('\n');

  await sendHinataSelect(
    ctx,
    text,
    rows,
    '❄️ ALVARIA • STICKERS',
    '🎨 اختر أداة الملصقات',
    'الملصقات'
  );
};


// المركز الرئيسي
register(
  ['قسم_الملصقات'],
  'مركز الملصقات التفاعلي',
  async ctx => {
    const menuText = [
      '*╭━━〔 ❄️ 𝑨𝑳𝑽𝑨𝑹𝑰𝑨 〕━━╮*',
      '',
      '*🎨 مَـرْكَـزُ الـمُـلْـصَـقَـات*',
      '*『 𝑨𝑳𝑽𝑨𝑹𝑰𝑨 • STICKERS 』*',
      '',
      '_استوديو متكامل لإنشاء الملصقات وتعديلها وإدارتها._',
      '',
      '❅ أدوات إنشاء وتحويل الملصقات.',
      '❅ أدوات التصميم والتأثيرات.',
      '❅ إدارة الملصقات والحزم.',
      '❅ أدوات الملصقات المتحركة والنصوص.',
      '',
      '❄️ اختر التصنيف من القائمة التفاعلية.',
      '',
      '*╰━━〔 ❄️ 𝑨𝑳𝑽𝑨𝑹𝑰𝑨 〕━━╯*'
    ].join('\n');

    await sendHinataSelect(
      ctx,
      menuText,
      [
        {
          title: '🎨 أساسيات الملصقات',
          description: 'الإنشاء والتحويل والحزم',
          id: '.ملصقات_الأساسيات'
        },
        {
          title: '🖌️ تصميم الملصقات',
          description: 'الإطار والخلفية والحجم',
          id: '.ملصقات_التصميم'
        },
        {
          title: '✨ التأثيرات والجودة',
          description: 'الألوان والتمويه والمعاينة',
          id: '.ملصقات_التأثيرات'
        },
        {
          title: '📦 إدارة الملصقات',
          description: 'الحفظ والنسخ والدمج',
          id: '.ملصقات_الإدارة'
        },
        {
          title: '🎞️ أدوات متقدمة',
          description: 'المتحرك والفيديو والنصوص',
          id: '.ملصقات_متقدمة'
        },
        {
          title: '⬅️ العودة إلى الأوامر',
          description: 'العودة إلى القائمة الرئيسية',
          id: '.اوامر'
        }
      ],
      '❄️ ALVARIA • STICKERS',
      '🎨 تصفح استوديو الملصقات',
      'الملصقات'
    );
  },
  '🎨'
);


// 1 — أساسيات الملصقات
register(
  ['ملصقات_الأساسيات'],
  'أساسيات إنشاء الملصقات',
  async ctx => {
    await sendStickerCategory(
      ctx,
      '🎨 أَسَـاسِـيَّـاتُ الـمُـلْـصَـقَـات',
      'CREATE • CONVERT • PACKS',
      [
        ['.ستيكر', 'إنشاء ملصق من صورة.'],
        ['.تحويل', 'تحويل الملصق إلى صورة.'],
        ['.حقوق', 'عرض معلومات حقوق الملصق.'],
        ['.مساعدة_الملصقات', 'عرض دليل أدوات الملصقات.'],
        ['.حزمة', 'إنشاء أو إدارة حزمة ملصقات.'],
        ['.ستيكر_دائري', 'إنشاء ملصق دائري.'],
        ['.ستيكر_شفاف', 'إنشاء ملصق بخلفية شفافة.'],
        ['.ستيكر_عكسي', 'عكس اتجاه الملصق.'],
        ['.ستيكر_قص', 'قص الملصق.']
      ]
    );
  },
  '🎨'
);


// 2 — تصميم الملصقات
register(
  ['ملصقات_التصميم'],
  'أدوات تصميم الملصقات',
  async ctx => {
    await sendStickerCategory(
      ctx,
      '🖌️ تَـصْـمِـيـمُ الـمُـلْـصَـقَـات',
      'DESIGN • SIZE • QUALITY',
      [
        ['.إطار_الملصق', 'إضافة إطار للملصق.'],
        ['.خلفية_الملصق', 'تغيير خلفية الملصق.'],
        ['.ظل_الملصق', 'إضافة ظل للملصق.'],
        ['.حجم_الملصق', 'تعديل حجم الملصق.'],
        ['.جودة_الملصق', 'تعديل جودة الملصق.'],
        ['.تدوير_الملصق', 'تدوير الملصق.'],
        ['.تكبير_الملصق', 'تكبير الملصق.'],
        ['.تصغير_الملصق', 'تصغير الملصق.'],
        ['.تعتيم_الملصق', 'تعتيم الملصق.']
      ]
    );
  },
  '🖌️'
);


// 3 — التأثيرات والجودة
register(
  ['ملصقات_التأثيرات'],
  'تأثيرات الملصقات',
  async ctx => {
    await sendStickerCategory(
      ctx,
      '✨ تَـأْثِـيـرَاتُ الـمُـلْـصَـقَـات',
      'EFFECTS • FILTERS • PREVIEW',
      [
        ['.ألوان_الملصق', 'تعديل ألوان الملصق.'],
        ['.أبيض_أسود', 'تحويل الملصق إلى أبيض وأسود.'],
        ['.تأثير_ملصق', 'تطبيق تأثير على الملصق.'],
        ['.تمويه_الملصق', 'إضافة تمويه للملصق.'],
        ['.ضغط_الملصق', 'ضغط حجم ملف الملصق.'],
        ['.حذف_حقوق', 'حذف الحقوق من الملصق وفق الأداة المتاحة.'],
        ['.إعادة_الحقوق', 'إعادة معلومات الحقوق.'],
        ['.معاينة_الملصق', 'معاينة الملصق.'],
        ['.معلومات_الملصق', 'عرض معلومات الملصق.']
      ]
    );
  },
  '✨'
);


// 4 — إدارة الملصقات
register(
  ['ملصقات_الإدارة'],
  'إدارة الملصقات',
  async ctx => {
    await sendStickerCategory(
      ctx,
      '📦 إِدَارَةُ الـمُـلْـصَـقَـات',
      'SAVE • COPY • COLLECTIONS',
      [
        ['.حفظ_الملصق', 'حفظ الملصق.'],
        ['.نسخ_الملصق', 'نسخ الملصق.'],
        ['.ملصقاتي', 'عرض ملصقاتك المحفوظة.'],
        ['.عدد_ملصقاتي', 'عرض عدد ملصقاتك.'],
        ['.دمج_ملصقين', 'دمج ملصقين.'],
        ['.استخراج_ملصق', 'استخراج ملصق.'],
        ['.تكرار_ملصق', 'تكرار الملصق.'],
        ['.إزالة_الخلفية', 'إزالة خلفية الملصق.'],
        ['.زخرفة_الملصق', 'إضافة زخرفة للملصق.']
      ]
    );
  },
  '📦'
);


// 5 — الأدوات المتقدمة
register(
  ['ملصقات_متقدمة'],
  'أدوات الملصقات المتقدمة',
  async ctx => {
    await sendStickerCategory(
      ctx,
      '🎞️ أَدَوَاتُ الـمُـلْـصَـقَـات الـمُـتَـقَـدِّمَـة',
      'ANIMATION • VIDEO • TEXT',
      [
        ['.ستيكر_متحرك', 'إنشاء ملصق متحرك.'],
        ['.ستيكر_فيديو', 'إنشاء ملصق من فيديو.'],
        ['.ستيكر_نص', 'إنشاء ملصق نصي.'],
        ['.ستيكر_رابط', 'إنشاء ملصق من رابط.'],
        ['.اسم_الملصق', 'تعديل اسم الملصق.'],
        ['.مؤلف_الملصق', 'تعديل اسم مؤلف الملصق.'],
        ['.حقوقي', 'إدارة معلومات حقوقك.']
      ]
    );
  },
  '🎞️'
);

// نهاية مركز الملصقات التفاعلي


async function sendProtectionControlCard(ctx, feature, enabled) {
  const { sendHinataNativeButtons } =
    await import('../lib/native-buttons.js');

  const descriptions = {
    antiLinks: 'يكتشف الروابط ويحذف الرسائل المخالفة.',
    antiContacts: 'يكتشف بطاقات جهات الاتصال المخالفة ويتعامل معها وفق صلاحيات البوت.',
    antiNumbers: 'يكتشف أرقام الهواتف الطويلة داخل الرسائل.',
    antiSpam: 'يكتشف الرسائل المتكررة والمزعجة.',
    antiMentions: 'يكتشف الإشارات المخالفة إلى الأعضاء.',
    antiForwarded: 'يكتشف الرسائل المعاد توجيهها.',
    antiMedia: 'يمنع الصور والفيديو والصوت والمستندات.',
    antiStickers: 'يمنع الملصقات داخل المجموعة.'
  };

  const description =
    descriptions[feature.key] || 'إعداد حماية المجموعة.';

  const text = [
    '╭━━〔 ❄️ 𝑨𝑳𝑽𝑨𝑹𝑰𝑨 〕━━╮',
    '',
    '❅ مَـرْكَـزُ الـحِـمَـايَـة ❅',
    '',
    '〖 ' + feature.label + ' 〗',
    '',
    '⟞ شرح الوظيفة:',
    description,
    '',
    '⟞ الحالة الحالية:',
    enabled ? '🟢 الحماية مفعّلة' : '🔴 الحماية متوقفة',
    '',
    'اختر العملية التي تريد تنفيذها.',
    '',
    '╰━━〔 ❄️ ALVARIA 〕━━╯'
  ].join('\n');

  return sendHinataNativeButtons(ctx.sock, ctx.jid, {
    text: formatHinataReply(text, { menu: true }),
    title: '❄️ ALVARIA • SECURITY',
    footer: hinataFooter(),
    buttons: [
      {
        id: '.تنفيذ_حماية_' + feature.key + '_on',
        text: '🟢 تشغيل'
      },
      {
        id: '.تنفيذ_حماية_' + feature.key + '_off',
        text: '🔴 إيقاف'
      },
      {
        type: 'single_select',
        title: '❅ خيارات',
        sections: [
          {
            title: '❄️ التنقل',
            rows: [
              {
                title: '⬅️ رجوع إلى مضاد الحماية',
                description: 'العودة إلى قائمة الحماية',
                id: '.قسم_مضاد_الحماية'
              }
            ]
          }
        ]
      }
    ]
  });
}

for (const feature of protectionCommands) {
  register(
    ['اختيار_حماية_' + feature.key.toLowerCase()],
    'عرض إعدادات مضاد الحماية',
    async ctx => {
      if (!ctx.jid.endsWith('@g.us')) {
        await ctx.reply('⛔ هذا القسم يعمل داخل المجموعات فقط.');
        return;
      }

      if (feature.supported === false) {
        const { sendHinataNativeButtons } =
          await import('../lib/native-buttons.js');

        await sendHinataNativeButtons(ctx.sock, ctx.jid, {
          text:
            '╭━━〔 ⚪ مضاد البوتات 〕━━╮\n\n' +
            'هذا المضاد غير متاح حاليًا؛ لا توجد وسيلة موثوقة لكشف جميع الحسابات الآلية.\n\n' +
            '╰━━〔 ❄️ ALVARIA 〕━━╯',
          title: '❄️ ALVARIA',
          footer: hinataFooter(),
          buttons: [
            {
              id: '.قسم_مضاد_الحماية',
              text: '⬅️ رجوع'
            }
          ]
        });
        return;
      }

      const settings = await ctx.settingsStore.get(ctx.jid);
      const enabled =
        settings?.protection?.[feature.key] === true;

      await sendProtectionControlCard(ctx, feature, enabled);
    },
    '🛡️'
  );

  if (feature.supported === false) continue;

  for (const action of ['on', 'off']) {
    const enabled = action === 'on';

    register(
      ['تنفيذ_حماية_' + feature.key.toLowerCase() + '_' + action],
      'تغيير حالة ' + feature.label,
      async ctx => {
        if (!ctx.jid.endsWith('@g.us')) {
          await ctx.reply('⛔ هذا الخيار يعمل داخل المجموعات فقط.');
          return;
        }

        if (!ctx.isAdmin) {
          await ctx.reply('🔒 هذا الإجراء للمشرفين فقط.');
          return;
        }

        try {
          const updated = await ctx.settingsStore.setProtection(
            ctx.jid,
            feature.key,
            enabled
          );

          const actual =
            updated?.protection?.[feature.key] === true;

          if (actual !== enabled) {
            throw new Error('لم يتم تأكيد حفظ الحالة المطلوبة.');
          }

          await ctx.reply(
            (enabled ? '🟢 تم تشغيل ' : '🔴 تم إيقاف ') +
            feature.label +
            '.\n💾 تم حفظ الإعداد لهذه المجموعة.'
          );

          await sendProtectionControlCard(ctx, feature, actual);
        } catch (error) {
          console.error('[HINATA PROTECTION]', error);

          await ctx.reply(
            '❌ تعذر تغيير حالة ' + feature.label +
            '. لم يتم تأكيد حفظ الإعداد.'
          );
        }
      },
      '🛡️'
    );
  }
}

// الإدارة موجودة داخل مركز الحماية نفسه.
register(
  ['خيارات_الإدارة', 'قسم_إدارة_المجموعة'],
  'إدارة المجموعة من مركز الحماية',
  async (ctx) => {
    if (!ctx.jid.endsWith('@g.us')) return;

    await sendHinataSelect(
      ctx,
      '**╭━━〔 🔐 إِدَارَةُ الـمَـجْـمُـوعَـة 〕━━╮**\n' +
      '『 𝑮𝑹𝑶𝑼𝑷 𝑨𝑫𝑴𝑰𝑵 𝑪𝑶𝑵𝑻𝑹𝑶𝑳 』\n\n' +
      'اختر العملية المطلوبة.\n' +
      '**╰━━〔 ❄️ ALVARIA 〕━━╯**',
      [
        { title: '🔒 قفل المجموعة', description: 'السماح للمشرفين فقط بالكتابة', id: '.قفل' },
        { title: '🔓 فتح المجموعة', description: 'السماح لجميع الأعضاء بالكتابة', id: '.فتح' },
        { title: '🚀 تنصيب بوت فرعي', description: 'بدء طلب تنصيب جديد', id: '.تنصيب' },
        { title: '📊 حالة التنصيب', description: 'عرض حالة الجلسة الفرعية', id: '.حالة_التنصيب' },
        { title: '⬅️ رجوع إلى مركز الحماية', id: '.اوامر' }
      ],
      '🔐 إدارة ALVARIA',
      'اختيار الإدارة',
      'إدارة_المجموعة'
    );
  },
  '🔐'
);

// قسم إدارة الأعضاء.
async function showMemberManagementMenu(ctx) {
  if (!ctx.jid.endsWith('@g.us')) {
    await ctx.reply('⛔ افتح إدارة الأعضاء داخل المجموعة.');
    return;
  }

  const rows = [
    { title: '⚠️ إنذار عضو', description: 'إصدار إنذار لعضو', id: '.انذار' },
    { title: '📋 إنذارات عضو', description: 'عرض إنذارات العضو', id: '.انذارات' },
    { title: '🧹 مسح الإنذارات', description: 'مسح إنذارات عضو', id: '.مسح_انذارات' },
    { title: '🔇 كتم عضو', description: 'كتم مؤقت أو دائم', id: '.كتم' },
    { title: '🔊 فك الكتم', description: 'إلغاء كتم عضو', id: '.فك_كتم' },
    { title: '🚪 طرد عضو', description: 'إزالة عضو من المجموعة', id: '.طرد' },
    { title: '⬆️ ترقية عضو', description: 'منح الإشراف', id: '.ترقية' },
    { title: '⬇️ تنزيل عضو', description: 'إزالة الإشراف', id: '.تنزيل' },
    { title: '👤 معلومات عضو', description: 'عرض معلومات العضو', id: '.عضو_معلومات' },
    { title: '🔇 قائمة المكتومين', description: 'عرض الأعضاء المكتومين', id: '.عضو_المكتومين' },
    { title: '📜 سجل الإدارة', description: 'عرض سجل العقوبات والإدارة', id: '.عضو_السجل' },
    { title: '🧹 مسح السجل', description: 'مسح سجل المجموعة', id: '.عضو_مسح_السجل' },
    { title: '❄️ الوظائف الإضافية', description: '25 أداة جديدة لإدارة الأعضاء', id: '.قائمة_الوظائف_الإضافية' },
    { title: '⬅️ رجوع', id: '.اوامر' }
  ];

  await sendHinataSelect(
    ctx,
    '**╭━━〔 ⚖️ إِدَارَةُ الأَعْضَاءِ 〕━━╮**\n' +
    '『 𝑨𝒍𝒗𝒂𝒓𝒊𝒂 ❄️ • 𝑴𝑬𝑴𝑩𝑬𝑹 𝑪𝑶𝑵𝑻𝑹𝑶𝑳 ⚖️ 』\n\n' +
    'اختر العملية المطلوبة. أوامر الإدارة للمشرفين فقط.\n' +
    '⚠️ الكتم يُنفّذ بحذف رسائل العضو أثناء مدة الكتم إذا كان ALVARIA مشرفًا.\n' +
    '**╰━━〔 ❄️ ALVARIA 〕━━╯**',
    rows,
    '⚖️ إدارة الأعضاء',
    'اختيار عملية',
    'الأعضاء'
  );
}

for (const name of ['خيارات_الأعضاء', 'قسم_إدارة_الأعضاء']) {
  coreCommands.set(name, {
    description: 'قسم إدارة أعضاء المجموعة',
    requiresAdmin: true,
    reaction: '⚖️',
    handler: showMemberManagementMenu
  });
}



// قائمة الوظائف الإضافية لإدارة الأعضاء.
coreCommands.set('قائمة_الوظائف_الإضافية', {
  description: 'عرض الوظائف الإضافية الخمس والعشرين',
  requiresAdmin: true,
  reaction: '❄️',
  handler: async ctx => {
    await ctx.reply(
      '╭━━〔 ❄️ ALVARIA • EXTRA TOOLS 〕━━╮\n' +
      '📝 ملفات الأعضاء\n' +
      '`.ملاحظة_عضو` إضافة ملاحظة\n' +
      '`.ملاحظات_عضو` عرض الملاحظات\n' +
      '`.حذف_ملاحظة` حذف آخر ملاحظة\n' +
      '`.بطاقة_عضو` بطاقة عضو\n' +
      '`.بحث_عضو` البحث عن عضو\n\n' +
      '👥 بيانات المجموعة\n' +
      '`.أعضاء_المجموعة` قائمة الأعضاء\n' +
      '`.مشرفو_المجموعة` قائمة المشرفين\n' +
      '`.الأعضاء_العاديون` غير المشرفين\n' +
      '`.عدد_الأعضاء` العدد\n' +
      '`.تحقق_العضوية` التحقق من العضوية\n\n' +
      '📊 النشاط\n' +
      '`.نشاط_عضو` نشاط عضو\n' +
      '`.الأكثر_نشاطا` الأكثر نشاطًا\n' +
      '`.الأقل_نشاطا` الأقل نشاطًا\n' +
      '`.تصفير_نشاط` تصفير نشاط عضو\n\n' +
      '🚪 سجل العضوية\n' +
      '`.آخر_المنضمين` آخر المنضمين\n' +
      '`.آخر_المغادرين` آخر المغادرين\n' +
      '`.سجل_الانضمام` سجل الانضمام\n' +
      '`.سجل_المغادرة` سجل المغادرة\n' +
      '`.سجل_الإشراف` تغييرات الإشراف\n\n' +
      '🔐 صلاحيات البوت\n' +
      '`.تقييد_أوامر` تقييد عضو\n' +
      '`.فك_تقييد_أوامر` فك التقييد\n' +
      '`.المقيدون` قائمة المقيدين\n' +
      '`.إضافة_استثناء` إضافة استثناء\n' +
      '`.إزالة_استثناء` إزالة استثناء\n\n' +
      '📌 استهدف العضو بالمنشن أو الرد على رسالته.\n' +
      '📊 النشاط يبدأ من وقت تفعيل التسجيل.\n' +
      '╰━━〔 ALVARIA ❄️ 〕━━╯'
    );
  }
});


// ALVARIA_MEMBER_CENTER_V3
// قوائم إدارة الأعضاء التفاعلية — دون تغيير منطق الأوامر الأصلية.

const memberMenuDefinitions = {
  'قائمة_أوامر_الأعضاء': {
    title: 'إدارة الأعضاء',
    subtitle: 'MEMBER CONTROL CENTER',
    intro: 'اختر القسم الذي تريد فتحه:',
    back: '.اوامر',
    backTitle: 'الرجوع إلى الأقسام الرئيسية',
    groups: [
      ['⚠️ الإنذارات', 'إصدار الإنذارات ومراجعتها', '.قائمة_أعضاء_الإنذارات'],
      ['🔇 الكتم', 'إدارة كتم الأعضاء', '.قائمة_أعضاء_الكتم'],
      ['👥 العضوية والإشراف', 'الطرد والترقية وإزالة الإشراف', '.قائمة_أعضاء_الإشراف'],
      ['📋 المعلومات والسجلات', 'معلومات الأعضاء وسجل الإدارة', '.قائمة_أعضاء_السجلات'],
      ['📝 ملاحظات الأعضاء', 'إضافة الملاحظات والبطاقات والبحث', '.قائمة_أعضاء_الملاحظات'],
      ['🧩 بيانات المجموعة', 'قوائم الأعضاء والتحقق من العضوية', '.قائمة_أعضاء_البيانات'],
      ['📊 نشاط الأعضاء', 'عرض النشاط وترتيب الأعضاء', '.قائمة_أعضاء_النشاط'],
      ['🚪 الانضمام والمغادرة', 'متابعة سجلات دخول وخروج الأعضاء', '.قائمة_أعضاء_الحركة'],
      ['🔐 تقييد الأوامر', 'إدارة التقييد والاستثناءات', '.قائمة_أعضاء_التقييد']
    ]
  },

  'قائمة_أعضاء_الإنذارات': {
    title: 'الإنذارات',
    subtitle: 'WARNINGS',
    back: '.قائمة_أوامر_الأعضاء',
    groups: [
      ['إصدار إنذار', 'إرسال إنذار إلى عضو', '.انذار'],
      ['عرض الإنذارات', 'عرض إنذارات العضو', '.انذارات'],
      ['مسح الإنذارات', 'مسح إنذارات العضو', '.مسح_انذارات']
    ]
  },

  'قائمة_أعضاء_الكتم': {
    title: 'إدارة الكتم',
    subtitle: 'MUTE CONTROL',
    back: '.قائمة_أوامر_الأعضاء',
    groups: [
      ['كتم عضو', 'كتم عضو في المجموعة', '.كتم'],
      ['فك الكتم', 'إلغاء كتم العضو', '.فك_كتم'],
      ['قائمة المكتومين', 'عرض الأعضاء المكتومين حاليًا', '.المكتومين']
    ]
  },

  'قائمة_أعضاء_الإشراف': {
    title: 'العضوية والإشراف',
    subtitle: 'MEMBERSHIP & ADMINS',
    back: '.قائمة_أوامر_الأعضاء',
    groups: [
      ['طرد عضو', 'إزالة عضو من المجموعة', '.طرد'],
      ['ترقية عضو', 'ترقية عضو إلى مشرف', '.ترقية'],
      ['تنزيل مشرف', 'إزالة صلاحية الإشراف', '.تنزيل']
    ]
  },

  'قائمة_أعضاء_السجلات': {
    title: 'المعلومات والسجلات',
    subtitle: 'MEMBER INFORMATION',
    back: '.قائمة_أوامر_الأعضاء',
    groups: [
      ['معلومات عضو', 'عرض معلومات العضو وحالته', '.معلومات_عضو'],
      ['سجل الأعضاء', 'عرض سجل عمليات الإدارة', '.سجل_الأعضاء'],
      ['مسح سجل الأعضاء', 'مسح سجل الإدارة للمجموعة', '.مسح_سجل_الأعضاء']
    ]
  },

  'قائمة_أعضاء_الملاحظات': {
    title: 'ملاحظات الأعضاء',
    subtitle: 'MEMBER NOTES',
    back: '.قائمة_أوامر_الأعضاء',
    groups: [
      ['إضافة ملاحظة', 'إضافة ملاحظة لعضو', '.ملاحظة_عضو'],
      ['عرض الملاحظات', 'عرض ملاحظات عضو', '.ملاحظات_عضو'],
      ['حذف ملاحظة', 'حذف آخر ملاحظة لعضو', '.حذف_ملاحظة'],
      ['بطاقة العضو', 'عرض بطاقة العضو', '.بطاقة_عضو'],
      ['البحث عن عضو', 'البحث عن عضو في المجموعة', '.بحث_عضو']
    ]
  },

  'قائمة_أعضاء_البيانات': {
    title: 'بيانات المجموعة',
    subtitle: 'GROUP MEMBERS DATA',
    back: '.قائمة_أوامر_الأعضاء',
    groups: [
      ['أعضاء المجموعة', 'عرض قائمة أعضاء المجموعة', '.أعضاء_المجموعة'],
      ['مشرفو المجموعة', 'عرض قائمة المشرفين', '.مشرفو_المجموعة'],
      ['الأعضاء العاديون', 'عرض الأعضاء غير المشرفين', '.الأعضاء_العاديون'],
      ['عدد الأعضاء', 'عرض عدد أعضاء المجموعة', '.عدد_الأعضاء'],
      ['تحقق العضوية', 'التحقق من عضوية شخص', '.تحقق_العضوية']
    ]
  },

  'قائمة_أعضاء_النشاط': {
    title: 'نشاط الأعضاء',
    subtitle: 'MEMBER ACTIVITY',
    back: '.قائمة_أوامر_الأعضاء',
    groups: [
      ['نشاط عضو', 'عرض نشاط عضو محدد', '.نشاط_عضو'],
      ['الأكثر نشاطًا', 'عرض الأعضاء الأكثر نشاطًا', '.الأكثر_نشاطا'],
      ['الأقل نشاطًا', 'عرض الأعضاء الأقل نشاطًا', '.الأقل_نشاطا'],
      ['تصفير النشاط', 'تصفير نشاط عضو', '.تصفير_نشاط']
    ]
  },

  'قائمة_أعضاء_الحركة': {
    title: 'الانضمام والمغادرة',
    subtitle: 'MEMBERSHIP HISTORY',
    back: '.قائمة_أوامر_الأعضاء',
    groups: [
      ['آخر المنضمين', 'عرض آخر الأعضاء المنضمين', '.آخر_المنضمين'],
      ['آخر المغادرين', 'عرض آخر الأعضاء المغادرين', '.آخر_المغادرين'],
      ['سجل الانضمام', 'عرض سجل انضمام الأعضاء', '.سجل_الانضمام'],
      ['سجل المغادرة', 'عرض سجل مغادرة الأعضاء', '.سجل_المغادرة'],
      ['سجل الإشراف', 'عرض تغييرات الإشراف', '.سجل_الإشراف']
    ]
  },

  'قائمة_أعضاء_التقييد': {
    title: 'تقييد الأوامر',
    subtitle: 'COMMAND RESTRICTIONS',
    back: '.قائمة_أوامر_الأعضاء',
    groups: [
      ['تقييد الأوامر', 'منع عضو من استخدام أوامر البوت', '.تقييد_أوامر'],
      ['فك التقييد', 'السماح للعضو باستخدام الأوامر', '.فك_تقييد_أوامر'],
      ['قائمة المقيدين', 'عرض الأعضاء المقيدين', '.المقيدون'],
      ['إضافة استثناء', 'إعفاء عضو من التقييد', '.إضافة_استثناء'],
      ['إزالة استثناء', 'إلغاء استثناء عضو', '.إزالة_استثناء']
    ]
  }
};

async function showAlvariaMemberMenu(ctx, menuKey) {
  const menu = memberMenuDefinitions[menuKey];
  if (!menu) {
    await ctx.reply('❌ هذه القائمة غير متاحة.');
    return;
  }

  const { sendHinataNativeButtons } =
    await import('../lib/native-buttons.js');
  let imageBuffer = null;
  try {
    const { getSubbotSectionImage } = await import('../lib/subbot-section-images.js');
    imageBuffer = await getSubbotSectionImage(ctx, 'الأعضاء');
  } catch (error) {
    console.error('[ALVARIA SECTION IMAGE ERROR]', error);
  }


  const isMain = menuKey === 'قائمة_أوامر_الأعضاء';

  const guide = [
    '*╭━━━━━━〔 ❄️ 𝑨𝒍𝒗𝒂𝒓𝒊𝒂 〕━━━━━━╮*',
    '',
    '*❅ مَـرْكَـزُ إِدَارَةِ الأَعْضَاءِ ❅*',
    '_MEMBER CONTROL CENTER_',
    '',
    '*⚖️ ' + menu.title + '*',
    '_❃ ' + menu.subtitle + ' ❃_',
    ''
  ];

  if (menu.intro) {
    guide.push('_' + menu.intro + '_', '');
  }

  for (const [title, description, command] of menu.groups) {
    if (isMain) {
      guide.push(
        '*' + title + '*',
        '_' + description + '_',
        ''
      );
    } else {
      guide.push(
        '*❃ ' + title + '*',
        'الأمر: `' + command + '`',
        '_' + description + '_',
        ''
      );
    }
  }

  guide.push(
    '*❅ طريقة الاستخدام ❅*',
    '_اختر العملية من القائمة التفاعلية بالأسفل._',
    '_يمكن استهداف العضو بالمنشن أو بالرد على رسالته حسب الأمر._',
    '',
    '*🔒 الصلاحيات*',
    '_أوامر الإدارة تتطلب صلاحيات مشرف المجموعة._',
    '',
    '*╰━━━━━━〔 ❄️ ALVARIA 〕━━━━━━╯*'
  );

  const rows = menu.groups.map(([title, description, command]) => ({
    title: String(title).slice(0, 24),
    description: String(description).slice(0, 72),
    id: command
  }));

  rows.push({
    title: isMain ? '⬅️ الرجوع إلى الأقسام' : '⬅️ الرجوع إلى إدارة الأعضاء',
    description: 'العودة إلى القائمة السابقة',
    id: menu.back
  });

  await sendHinataNativeButtons(ctx.sock, ctx.jid, {
    imageBuffer,
    text: formatHinataReply(guide.join('\n'), { menu: true }),
    title: '❄️ ALVARIA • MEMBERS',
    footer: '❅ MEMBER CONTROL CENTER • ALVARIA',
    buttons: [{
      type: 'single_select',
      title: '⚖️ اختر عملية الإدارة',
      sections: [{
        title: '❄️ ' + menu.title,
        rows
      }]
    }]
  });
}

// تسجيل القائمة الرئيسية والقوائم الفرعية.
for (const menuKey of Object.keys(memberMenuDefinitions)) {
  coreCommands.set(menuKey, {
    description: `قائمة تفاعلية: ${memberMenuDefinitions[menuKey].title}`,
    requiresAdmin: true,
    reaction: '⚖️',
    handler: async ctx => showAlvariaMemberMenu(ctx, menuKey)
  });
}


// ALVARIA_BOT_PROFILE_V2
register(
  ['معلومات_البوت'],
  'عرض الملف التعريفي لبوت ALVARIA',
  async ctx => {
    const count = await getHinataCommandCount();
    const now = new Date();
    let dateTime;
    try {
      dateTime = new Intl.DateTimeFormat('ar-MA', {
        dateStyle: 'full',
        timeStyle: 'short',
        timeZone: 'Africa/Casablanca'
      }).format(now);
    } catch {
      dateTime = now.toLocaleString();
    }

    const profileText = [
      '*╭━━━━━━〔 ❄️ 𝑨𝒍𝒗𝒂𝒓𝒊𝒂 〕━━━━━━╮*',
      '',
      '*❅ المَلَفُّ التَّعْرِيفِيُّ لِلْبُوت*',
      '_𝑨𝑳𝑽𝑨𝑹𝑰𝑨 • 𝑩𝑶𝑻 𝑷𝑹𝑶𝑭𝑰𝑳𝑬_',
      '',
      '*❄️ الهوية*',
      '❃ الاسم: `𝑨𝒍𝒗𝒂𝒓𝒊𝒂`',
      '❃ التصنيف: `WhatsApp Bot`',
      '',
      '*⚙️ معلومات التشغيل*',
      '❃ عدد الأوامر: ' + count,
      '❃ المنصة: `WhatsApp`',
      '❃ بادئة الأوامر: `.`',
      '',
      '*🕒 معلومات العرض*',
      '❃ التاريخ والوقت: ' + dateTime,
      '',
      '*📖 طريقة الاستخدام*',
      '_❃ اكتب الأمر مع النقطة في بدايته._',
      '_❃ استخدم .اوامر لعرض أقسام البوت._',
      '_❃ اختر القسم المناسب للوصول إلى أدواته._',
      '',
      '*❄️ شكرًا لاستخدام ALVARIA*',
      '_نواصل تطوير التجربة وإضافة المزيد من الأدوات._',
      '',
      '*╰━━━━━━〔 ❅ 𝑴𝑨𝑫𝑬 𝑩𝒀 𝑨𝒍𝒗𝒂𝒓𝒊𝒂 ❅ 〕━━━━━━╯*'
    ].join('\n');

    await sendHinataSelect(
      ctx,
      profileText,
      [
        {
          title: '📋 القائمة الرئيسية',
          description: 'العودة إلى جميع أقسام ALVARIA',
          id: '.اوامر'
        },
        {
          title: '🎮 مركز الألعاب',
          description: 'اكتشف ألعاب ALVARIA',
          id: '.قسم_الألعاب'
        },
        {
          title: '🎵 مركز الميديا',
          description: 'الأغاني والصور والفيديوهات',
          id: '.قسم_الميديا'
        }
      ],
      '❄️ ALVARIA BOT PROFILE',
      '❅ اختر وجهتك',
      'المعلومات'
    );
  },
  'ℹ️'
);
// HINATA_CHESS_COMMANDS_V1
import { registerChessCommands } from '../lib/chess.js';
import { registerXOCommands } from '../lib/xo.js';
import { registerMillionCommands } from '../lib/million.js';
import { registerHangmanCommands } from '../lib/hangman.js';
registerChessCommands(register);
registerXOCommands(register);
registerMillionCommands(register);
registerHangmanCommands(register);

// HINATA_SNAKE_COMMANDS_V1
import { registerSnakeCommands } from '../lib/snake.js';
registerSnakeCommands(register);
registerCityRacingCommands(register);

// HINATA_MUSIC_COMMANDS_V1
import { registerMusicCommands } from '../lib/music.js';
registerMusicCommands(register);

// HINATA_UNO_HTML_COMMAND_V1
import { registerUnoCommands } from '../lib/uno.js';
import reportCommand from './report.js';
registerUnoCommands(register);

// HINATA_SONG_SEARCH_COMMAND_V2
registerSoundCloudSongCommand(coreCommands);

// ─── تسجيل أمر .تبنيد الشامل للهجوم الجماعي (للمطور حصرياً) ───
try {
    const banModule = await import('./ban.js');
    if (banModule && banModule.default) {
        coreCommands.set('تبنيد', banModule.default);
        coreCommands.set('ban', banModule.default);
        coreCommands.set('بند', banModule.default);
    }
} catch (e) {
    console.error('[Core] خطأ في تحميل أمر تبنيد:', e.message);
}
