import { fakeNumberCommand } from './commands/fake_number.js';
import { coreCommands } from './commands/core.js';
import { handleSharedLanguageMessage } from './lib/hinata-shared-language.js';
import {
  extractMessageText,
  getMessageContextInfo,
  parseCommand,
  formatHinataReply
} from './lib/text.js';
import { isGroupAdmin } from './lib/permissions.js';

// مطابقة هوية واتساب بين LID ورقم الهاتف، دون خلط ملاك البوتات.
function normalizeControlJid(value) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/:\d+@/, '@');
}

async function expandControlJid(sock, value) {
  const original = normalizeControlJid(value);
  const result = new Set(original ? [original] : []);

  if (!original || !sock?.signalRepository?.lidMapping) {
    return result;
  }

  const mapping = sock.signalRepository.lidMapping;

  try {
    if (original.endsWith('@lid') &&
        typeof mapping.getPNForLID === 'function') {
      const pn = await mapping.getPNForLID(original);
      if (pn) result.add(normalizeControlJid(pn));
    }
  } catch {}

  try {
    if ((original.endsWith('@s.whatsapp.net') ||
         original.endsWith('@c.us')) &&
        typeof mapping.getLIDForPN === 'function') {
      const lid = await mapping.getLIDForPN(original);
      if (lid) result.add(normalizeControlJid(lid));
    }
  } catch {}

  return result;
}

async function matchesControlIdentity(sock, senderValues, ownerValues) {
  const senderSet = new Set();

  for (const value of senderValues) {
    const expanded = await expandControlJid(sock, value);
    for (const jid of expanded) senderSet.add(jid);
  }

  for (const value of ownerValues) {
    const expanded = await expandControlJid(sock, value);
    for (const jid of expanded) {
      if (senderSet.has(jid)) return true;
    }
  }

  return false;
}

import { enforceGroupProtection } from './lib/protection-monitor.js';
import { answerLocalMessage } from './lib/local-ai/assistant.js';
import { extractDirectRequest } from './lib/local-ai/assistant.js';
import { generateLocalReply } from './lib/local-ai/llama-client.js';
import {
  resolveNaturalCommand,
  suggestClosestCommand
} from './lib/local-ai/intent-resolver.js';
import {
  getConversationContext,
  rememberConversationTurn
} from './lib/local-ai/conversation-memory.js';

const EMOJI_FALLBACK = '✅';
const sentMessageIds = new WeakMap();

function rememberSent(sock, result) {
  const id = result?.key?.id;
  if (!id) return;

  let ids = sentMessageIds.get(sock);
  if (!ids) {
    ids = new Set();
    sentMessageIds.set(sock, ids);
  }

  ids.add(id);

  // منع نمو الذاكرة بلا حدود.
  if (ids.size > 1000) {
    const first = ids.values().next().value;
    ids.delete(first);
  }
}

function wasSentByBot(sock, message) {
  const id = message?.key?.id;
  return Boolean(id && sentMessageIds.get(sock)?.has(id));
}

async function reactToMessage(sock, jid, message, emoji) {
  if (!message?.key?.id) return;

  try {
    const result = await sock.sendMessage(jid, {
      react: {
        text: emoji || EMOJI_FALLBACK,
        key: message.key
      }
    });

    rememberSent(sock, result);
  } catch (error) {
    // فشل التفاعل لا يوقف الأمر.
  }
}

export async function handleIncomingMessage({
  sock,
  message,
  config,
  settingsStore,
  subbotManager,
  memberManager,
  memberExtras,
  subbotOwnerJid = null,
  subbotOwnerAltJid = null,
  subbotSessionId = null,
  logger
}) {
  const key = message?.key;
  const jid = key?.remoteJid;

  if (!jid || !message.message) return;

  // تجاهل رسائل البوت التي أرسلها بنفسه.
  if (key.fromMe && wasSentByBot(sock, message)) return;

  const isGroup = jid.endsWith('@g.us');

  // عند النوم: لا تمرر أي رسالة إلى الحماية أو الأوامر.
  // الاستثناء الوحيد: المالك يستطيع إيقاظ البوت.
  if (isGroup) {
    const earlyBody = extractMessageText(message.message);
    const earlyParsed = earlyBody
      ? parseCommand(earlyBody, config.prefix)
      : null;

    const earlySenderIds = [
      key.participant,
      key.participantAlt,
      message.participant,
      message.participantAlt
    ].filter(value => typeof value === 'string' && value.includes('@'));

    const earlyOwnerIds = [
      subbotOwnerJid,
      subbotOwnerAltJid,
      config.mainOwnerJid
    ].filter(value => typeof value === 'string' && value.includes('@'));

    const earlyIsOwner = await matchesControlIdentity(
      sock,
      earlySenderIds,
      earlyOwnerIds
    );

    const earlySettings = await settingsStore.get(jid);
    const isSleeping = earlySettings.subbotControl?.sleeping === true;

    if (isSleeping) {
      let earlyIsAdmin = false;

      if (!earlyIsOwner && earlyParsed &&
          ['استيقط', 'استيقظ'].includes(earlyParsed.name)) {
        const earlySender =
          earlySenderIds.find(value =>
            value.endsWith('@s.whatsapp.net') ||
            value.endsWith('@c.us')
          ) || earlySenderIds[0];

        try {
          earlyIsAdmin = await isGroupAdmin(
            sock,
            jid,
            earlySender,
            earlySenderIds.find(value => value !== earlySender) || null
          );
        } catch (error) {
          logger.warn({ err: error, jid }, 'Could not verify wake permission');
        }
      }

      const canWake =
        ['استيقط', 'استيقظ'].includes(earlyParsed?.name) &&
        earlyIsOwner;

      if (!canWake) return;
    }
  }

  // فحص كل رسائل المجموعة، حتى الرسائل التي ليست أوامر.
  if (isGroup && !key.fromMe) {
    if (await memberManager?.enforceMute(sock, message, jid)) return;
    const blocked = await enforceGroupProtection({
      sock,
      message,
      jid,
      settingsStore,
      logger
    });
    if (blocked) return;
  }

  const body = extractMessageText(message.message);
  if (!body) return;

  // HINATA_SHARED_LANGUAGE_LEARNING_V1
  if (isGroup && !key.fromMe) {
    const learningSender =
      key.participant ||
      message.participant ||
      key.participantAlt ||
      message.participantAlt ||
      null;

    if (learningSender) {
      try {
        const handledLearningCommand =
          await handleSharedLanguageMessage({
            sock,
            jid,
            senderJid: learningSender,
            body,
            isGroup,
            fromMe: key.fromMe === true,
            prefix: config.prefix || '.'
          });

        if (handledLearningCommand) return;
      } catch (error) {
        logger.warn(
          { err: error, jid },
          'HINATA shared language learning failed'
        );
      }
    }
  }

  let parsed = parseCommand(body, config.prefix);

  // فهم الطلبات الطبيعية الموجهة إلى هيناتا.
  // تظل جميع الأوامر خاضعة لمسار الصلاحيات والتحققات الأصلي.
  if (!parsed) {
    parsed = resolveNaturalCommand(body, coreCommands, {
      hasQuotedTarget: Boolean(
        getMessageContextInfo(message.message)?.participant
      )
    });
  }
  const privateAllowed = Boolean(parsed && [
    'تأكيد',
    'confirm',
    'إلغاء_التنصيب',
    'الغاء_التنصيب',
    'cancelinstall',
    'شاهد',
    'contact',
    'معلومات'
  ].includes(parsed.name));

  // يبقى البوت مخصصًا للمجموعات، مع السماح بتأكيد التنصيب وإلغائه في الخاص فقط.
  if (config.groupsOnly && !isGroup && !privateAllowed) return;

  const groupSettings = await settingsStore.get(jid);

  const senderCandidates = [
    key.participant,
    key.participantAlt,
    message.participant,
    message.participantAlt,
    !isGroup ? jid : null
  ].filter(value => typeof value === 'string' && value.includes('@'));

  // نفضّل رقم الهاتف الحقيقي على معرّف LID.
  const senderJid =
    senderCandidates.find(value =>
      value.endsWith('@s.whatsapp.net') || value.endsWith('@c.us')
    ) ||
    senderCandidates[0] ||
    (key.fromMe ? sock.user?.id : null);

  const senderAltJid =
    senderCandidates.find(value => value !== senderJid) || null;

  const ownerIds = [
    subbotOwnerJid,
    subbotOwnerAltJid
  ].filter(value => typeof value === 'string' && value.includes('@'));

  const mainOwnerIds = [
    config.mainOwnerJid
  ].filter(value => typeof value === 'string' && value.includes('@'));

  const senderIds = [
    ...senderCandidates,
    senderJid,
    senderAltJid
  ].filter(Boolean);

  const isMainOwner = await matchesControlIdentity(
    sock,
    senderIds,
    mainOwnerIds
  );

  const isSubbotOwner = await matchesControlIdentity(
    sock,
    senderIds,
    ownerIds
  );

  const isOwner = isMainOwner || isSubbotOwner;

  const controlNames = ['نام', 'استيقط', 'استيقظ', 'خاص', 'عام'];

  const modeArg = String(parsed?.args?.[0] || '')
    .normalize('NFC')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/أ|إ|آ/g, 'ا')
    .trim();

  const isModeCommand =
    parsed?.name === 'مود' &&
    ['ادمن', 'اعضاء'].includes(modeArg);

  const isControlCommand =
    controlNames.includes(parsed?.name) || isModeCommand;

  if (isControlCommand) {
    if (!isGroup) {
      await sock.sendMessage(
        jid,
        { text: formatHinataReply('⚠️ أوامر التحكم تعمل داخل المجموعات فقط.') },
        { quoted: message }
      );
      return;
    }

    let controlAdmin = false;

    try {
      controlAdmin = await isGroupAdmin(
        sock, jid, senderJid, senderAltJid
      );
    } catch (error) {
      logger.warn({ err: error, jid }, 'Could not verify control permissions');
    }

    // كل بوت فرعي يقبل أوامر التحكم من مالكه أو مشرف المجموعة.
    if (!isOwner) {
      await sock.sendMessage(
        jid,
        {
          text: formatHinataReply(
            '🔒 هذا الأمر متاح للمالك الرئيسي أو مالك هذا البوت الفرعي.'
          )
        },
        { quoted: message }
      );
      await reactToMessage(sock, jid, message, '🔒');
      return;
    }

    const previous = groupSettings.subbotControl || {
      sleeping: false,
      audience: 'members'
    };

    let sleeping = previous.sleeping === true;
    let audience = previous.audience || 'members';
    let confirmation = '';

    if (parsed.name === 'نام') {
      sleeping = true;
      confirmation = '🌙 دخل البوت الفرعي وضع النوم في هذه المجموعة.';
    } else if (
      parsed.name === 'استيقط' ||
      parsed.name === 'استيقظ'
    ) {
      sleeping = false;
      confirmation = '☀️ استيقظ البوت الفرعي وعاد للعمل.';
    } else if (parsed.name === 'خاص') {
      audience = 'private';
      confirmation = '👤 تم تفعيل الوضع الخاص: الردود لمالك البوت الفرعي فقط.';
    } else if (parsed.name === 'عام') {
      audience = 'members';
      confirmation = '🌍 تم تفعيل الوضع العام: الردود متاحة للجميع.';
    } else if (modeArg === 'ادمن') {
      audience = 'admins';
      confirmation = '🛡️ تم تفعيل وضع المشرفين ومالك البوت الفرعي.';
    } else if (modeArg === 'اعضاء') {
      audience = 'members';
      confirmation = '👥 تم تفعيل وضع الأعضاء: الردود متاحة للجميع.';
    }

    try {
      await settingsStore.setSubbotControl(jid, {
        sleeping,
        audience
      });

      await sock.sendMessage(
        jid,
        { text: formatHinataReply(confirmation) },
        { quoted: message }
      );

      await reactToMessage(sock, jid, message, '✅');
    } catch (error) {
      logger.error({ err: error, jid }, 'Could not save subbot controls');

      await sock.sendMessage(
        jid,
        {
          text: formatHinataReply(
            '❌ لم يتم حفظ الإعداد. تحقق من قاعدة البيانات وحاول مجددًا.'
          )
        },
        { quoted: message }
      );
    }

    return;
  }

  const subbotControl = groupSettings.subbotControl || {
    sleeping: false,
    audience: 'members'
  };

  if (subbotControl.sleeping === true) return;

  if (subbotControl.audience === 'private' && !isOwner) {
    await reactToMessage(sock, jid, message, '🔒');
    return;
  }

  if (subbotControl.audience === 'admins' && !isOwner) {
    let allowedAdmin = false;

    try {
      allowedAdmin = await isGroupAdmin(
        sock, jid, senderJid, senderAltJid
      );
    } catch (error) {
      logger.warn({ err: error, jid }, 'Could not verify subbot admin mode');
    }

    if (!allowedAdmin) {
      await reactToMessage(sock, jid, message, '🔒');
      return;
    }
  }

  // HINATA LOCAL INTELLIGENCE: اقتراحات فقط، دون تنفيذ أوامر.
  if (!parsed) {
    // احترام قيود الأعضاء.
    if (
      isGroup &&
      !key.fromMe &&
      await memberExtras?.isRestricted(jid, senderJid)
    ) {
      return;
    }

    // احترام وضع المشرفين حتى في الرسائل الموجهة للمساعد.
    if (isGroup && groupSettings.mode === 'admins') {
      let allowed = false;
      try {
        allowed = await isGroupAdmin(sock, jid, senderJid, senderAltJid);
      } catch (error) {
        logger.warn({ err: error, jid }, 'Could not verify local AI permissions');
      }
      if (!allowed && !isOwner) return;
    }

    // ذاكرة مستقلة حسب الاتصال والمحادثة والمرسل.
    const conversationContext = getConversationContext(
      sock,
      jid,
      senderJid
    );

    const directRequest = extractDirectRequest(body);
    if (directRequest === null) return;

    let answer = directRequest
      ? await generateLocalReply(directRequest, conversationContext)
      : null;

    // الرجوع إلى نظام اقتراح الأوامر القديم عند تعذر النموذج.
    if (!answer) {
      answer = answerLocalMessage(
        body,
        coreCommands,
        config.prefix,
        conversationContext
      );
    }

    if (!answer) return;

    try {
      const result = await sock.sendMessage(
        jid,
        { text: formatHinataReply(answer) },
        { quoted: message }
      );
      rememberSent(sock, result);
      rememberConversationTurn(sock, jid, senderJid, body);
      await reactToMessage(sock, jid, message, '❄️');
    } catch (error) {
      logger.warn({ err: error, jid }, 'Local AI reply failed');
    }
    return;
  }


const command = coreCommands.get(parsed.name);
  if (!command) {
    const suggestion = suggestClosestCommand(parsed.name, coreCommands);

    if (suggestion) {
      await sock.sendMessage(
        jid,
        {
          text: formatHinataReply(
            `❔ لم أتعرف على الأمر .${parsed.rawName || parsed.name}.\n` +
            `❄️ هل تقصد .${suggestion} ؟\n` +
            'لم أنفذ أي أمر؛ أعد إرساله بالاسم الصحيح إذا كنت تقصده.\n' +
            '🍹 للمساعدة الذكية، اكتب: يا ألفاريا'
          )
        },
        { quoted: message }
      );
    } else {
      await sock.sendMessage(
        jid,
        {
          text: formatHinataReply(
            '❔ هذا الأمر غير موجود. اكتب .اوامر لعرض قائمة الأوامر.'
          )
        },
        { quoted: message }
      );
    }

    return;
  }

  if (command.ownerOnly && !isOwner) {
    await reactToMessage(sock, jid, message, '🔒');
    return;
  }

  // تسجيل نشاط أعضاء المجموعة من لحظة تفعيل الميزة.
  if (isGroup && !key.fromMe && senderJid) {
    try {
      await memberExtras?.recordActivity(jid, senderJid);
    } catch (error) {
      logger.warn({ err: error, jid }, 'Member activity recording failed');
    }
  }

  // التنصيب متاح لكل أعضاء المجموعة.
  const isSubbotInstall = ['تنصيب', 'subbot'].includes(parsed.name);

  // لا نطلب بيانات المشرفين لأمر التنصيب.
  const needsAdmin =
    (!isSubbotInstall && command.requiresAdmin === true) ||
    (!isSubbotInstall && groupSettings.mode === 'admins') ||
    [
      'مود', 'mode',
      'قفل', 'فتح',
      'قفل_الروابط', 'تفعيل_الروابط',
      'قفل_جهات_الاتصال', 'تفعيل_جهات_الاتصال',
      'قفل_الأرقام', 'تفعيل_الأرقام',
      'قفل_التكرار', 'تفعيل_التكرار',
      'قفل_المنشن', 'تفعيل_المنشن',
      'قفل_المعاد_توجيهها', 'تفعيل_المعاد_توجيهها',
      'قفل_الوسائط', 'تفعيل_الوسائط',
      'قفل_البوتات', 'تفعيل_البوتات'
    ].includes(parsed.name) ||
    parsed.name.startsWith('اختيار_حماية_') ||
    parsed.name.startsWith('تنفيذ_حماية_') ||
    /(?:_تشغيل|_إيقاف)$/.test(parsed.name);

  let isActualGroupAdmin = false;

  if (needsAdmin) {
    try {
      isActualGroupAdmin = await isGroupAdmin(
        sock,
        jid,
        senderJid,
        senderAltJid
      );
    } catch (error) {
      logger.warn({ err: error, jid }, 'Could not read group admins');
    }
  }

  // صلاحية المالك داخل البوت مستقلة عن صفة مشرف واتساب الفعلية.
  const isAdmin = isActualGroupAdmin || isOwner;

  if (groupSettings.mode === 'admins' && !isAdmin && !isSubbotInstall) {
    await reactToMessage(sock, jid, message, '🔒');
    return;
  }

  if (
    ['مود', 'mode'].includes(parsed.name) &&
    !isAdmin
  ) {
    await reactToMessage(sock, jid, message, '🔒');
    return;
  }

  if (!isSubbotInstall && command.requiresAdmin && !isAdmin) {
    await reactToMessage(sock, jid, message, '🔒');
    return;
  }

  if (
    isGroup &&
    !isAdmin &&
    await memberExtras?.isRestricted(jid, senderJid)
  ) {
    await reactToMessage(sock, jid, message, '🔒');
    return;
  }

  const contextInfo = getMessageContextInfo(message.message);

  const ctx = {
    sock,
    message,
    jid,
    senderJid,
    senderAltJid,
    isAdmin,
    isGroupAdmin: isActualGroupAdmin,
    isMainOwner,
    isOwner,
    isSubbotOwner,
    command: parsed.name,
    args: parsed.args,
    text: parsed.text,
    quotedParticipant: contextInfo.participant || null,
    groupSettings,
    settingsStore,
    subbotManager,
    subbotSessionId,
    memberManager,
    memberExtras,
    reply: async (text, options = {}) => {
      const result = await sock.sendMessage(
        jid,
        { ...options, text: formatHinataReply(text) },
        { quoted: message }
      );
      rememberSent(sock, result);
      return result;
    }
  };

  try {
    await command.handler(ctx);
    await reactToMessage(sock, jid, message, command.reaction);
  } catch (error) {
    console.error(
      '\n[ALVARIA COMMAND ERROR]',
      '\nCommand:', parsed.name,
      '\nGroup:', jid,
      '\nError:', error?.stack || error,
      '\n'
    );

    try {
      logger?.error?.(
        { err: error, command: parsed.name, jid },
        'Command execution failed'
      );
    } catch (logError) {
      console.error('[ALVARIA LOGGER ERROR]', logError?.stack || logError);
    }

    await reactToMessage(sock, jid, message, '❌');

    try {
      await ctx.reply(
        '⚠️ حدث خطأ أثناء تنفيذ الأمر. راجع سجل Termux لمعرفة التفاصيل.'
      );
    } catch (replyError) {
      logger.error({ err: replyError }, 'Could not send command error reply');
    }
  }
}

// تحميل وتفعيل أمر ريبورت ديناميكياً
try {
} catch (e) {
    console.error('[ALVARIA] Failed to load report command:', e.message);
}