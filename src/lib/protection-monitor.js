const spamCache = new Map();
const temporaryLocks = new Map();

const SPAM_WINDOW = 10000;
const SPAM_LIMIT = 3;
const TEMP_LOCK_MS = 15000;

function unwrapMessage(message) {
  let current = message || {};

  for (let i = 0; i < 8; i += 1) {
    const next =
      current.ephemeralMessage?.message ||
      current.viewOnceMessage?.message ||
      current.viewOnceMessageV2?.message ||
      current.viewOnceMessageV2Extension?.message ||
      current.documentWithCaptionMessage?.message;

    if (!next) break;
    current = next;
  }

  return current;
}

function normalizeJid(value) {
  return String(value || '')
    .trim()
    .replace(/:\d+@/, '@');
}

function participantIds(participant) {
  return [
    participant?.id,
    participant?.lid,
    participant?.jid,
    participant?.phoneNumber
  ]
    .filter(value => typeof value === 'string')
    .map(normalizeJid);
}

function findParticipant(metadata, candidates) {
  const wanted = new Set(
    candidates.filter(Boolean).map(normalizeJid)
  );

  return metadata?.participants?.find(participant =>
    participantIds(participant).some(id => wanted.has(id))
  ) || null;
}

function isAdminParticipant(participant) {
  return (
    participant?.admin === 'admin' ||
    participant?.admin === 'superadmin'
  );
}

function getText(content) {
  return String(
    content?.conversation ||
    content?.extendedTextMessage?.text ||
    content?.imageMessage?.caption ||
    content?.videoMessage?.caption ||
    content?.documentMessage?.caption ||
    content?.documentWithCaptionMessage?.message?.documentMessage?.caption ||
    ''
  );
}

function getContextInfo(content) {
  const types = [
    'extendedTextMessage',
    'imageMessage',
    'videoMessage',
    'audioMessage',
    'documentMessage',
    'stickerMessage'
  ];

  for (const type of types) {
    if (content?.[type]?.contextInfo) {
      return content[type].contextInfo;
    }
  }

  return content?.messageContextInfo || {};
}

function hasPhoneNumber(text) {
  const matches =
    String(text).match(/(?:\+?\d[\d\s().-]{6,}\d)/g) || [];

  return matches.some(value => {
    const digits = value.replace(/\D/g, '');
    return digits.length >= 8 && digits.length <= 15;
  });
}

function hasLink(text) {
  return /(?:https?:\/\/|www\.)\S+|(?:chat\.whatsapp\.com|wa\.me|whatsapp\.com|t\.me)\/?\S*|(?:[a-z0-9-]+\.)+(?:com|net|org|info|biz|io|me|co|ma|ly|gg|dev|app|xyz|site|online|shop|tv|uk|fr|de|es|ru|jp|us|edu|gov)\b/i.test(
    String(text || '')
  );
}

function detectViolation(content, protection, senderKey, jid) {
  const text = getText(content);
  const info = getContextInfo(content);

  if (
    protection.antiContacts &&
    (content.contactMessage || content.contactsArrayMessage)
  ) {
    return {
      key: 'antiContacts',
      label: 'جهات الاتصال',
      lock: true,
      kick: true
    };
  }

  if (protection.antiLinks && hasLink(text)) {
    return {
      key: 'antiLinks',
      label: 'الروابط',
      lock: true,
      kick: false
    };
  }

  if (protection.antiNumbers && hasPhoneNumber(text)) {
    return {
      key: 'antiNumbers',
      label: 'الأرقام الهاتفية',
      lock: false,
      kick: false
    };
  }

  if (
    protection.antiMentions &&
    Array.isArray(info.mentionedJid) &&
    info.mentionedJid.length > 0
  ) {
    return {
      key: 'antiMentions',
      label: 'المنشن',
      lock: false,
      kick: false
    };
  }

  if (
    protection.antiForwarded &&
    (
      info.isForwarded === true ||
      Number(info.forwardingScore || 0) > 0
    )
  ) {
    return {
      key: 'antiForwarded',
      label: 'إعادة التوجيه',
      lock: false,
      kick: false
    };
  }

  if (protection.antiStickers && content.stickerMessage) {
    return {
      key: 'antiStickers',
      label: 'الملصقات',
      lock: false,
      kick: false
    };
  }

  if (
    protection.antiMedia &&
    [
      'imageMessage',
      'videoMessage',
      'audioMessage',
      'documentMessage'
    ].some(type => content[type])
  ) {
    return {
      key: 'antiMedia',
      label: 'الوسائط',
      lock: false,
      kick: false
    };
  }

  if (protection.antiSpam && text.trim()) {
    const normalizedText = text
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');

    const cacheKey = `${jid}:${senderKey}:${normalizedText}`;
    const now = Date.now();
    const old = spamCache.get(cacheKey);

    const entry =
      old && now - old.firstAt <= SPAM_WINDOW
        ? {
            firstAt: old.firstAt,
            count: old.count + 1
          }
        : {
            firstAt: now,
            count: 1
          };

    spamCache.set(cacheKey, entry);

    if (spamCache.size > 3000) {
      for (const [key, value] of spamCache) {
        if (now - value.firstAt > SPAM_WINDOW * 2) {
          spamCache.delete(key);
        }
      }
    }

    if (entry.count >= SPAM_LIMIT) {
      return {
        key: 'antiSpam',
        label: 'التكرار المزعج',
        lock: false,
        kick: false
      };
    }
  }

  return null;
}

async function getFreshGroupState(sock, jid, sender, senderAlt) {
  const metadata = await sock.groupMetadata(jid);

  const bot = findParticipant(metadata, [
    sock.user?.id,
    sock.user?.lid
  ]);

  const offender = findParticipant(metadata, [
    sender,
    senderAlt
  ]);

  return {
    metadata,
    bot,
    botIsAdmin: isAdminParticipant(bot),
    offender,
    offenderIsAdmin: isAdminParticipant(offender)
  };
}

async function lockGroupTemporarily(sock, jid, metadata, logger) {
  if (metadata?.announce === true) {
    return {
      ok: false,
      reason: 'already-locked'
    };
  }

  if (temporaryLocks.has(jid)) {
    return {
      ok: true,
      reason: 'already-locked-by-protection'
    };
  }

  await sock.groupSettingUpdate(jid, 'announcement');

  const timer = setTimeout(async () => {
    try {
      const current = await sock.groupMetadata(jid);

      if (current?.announce === true) {
        await sock.groupSettingUpdate(jid, 'not_announcement');
      }
    } catch (error) {
      logger?.warn?.(
        { err: error, jid },
        'Temporary protection unlock failed'
      );
    } finally {
      temporaryLocks.delete(jid);
    }
  }, TEMP_LOCK_MS);

  timer.unref?.();
  temporaryLocks.set(jid, timer);

  return {
    ok: true,
    reason: 'temporary-lock'
  };
}

function validRemovalJid(participant) {
  const candidates = [
    participant?.id,
    participant?.jid
  ];

  return candidates.find(value =>
    typeof value === 'string' &&
    (
      value.endsWith('@s.whatsapp.net') ||
      value.endsWith('@c.us')
    )
  ) || null;
}

async function deleteViolation(sock, jid, key) {
  if (!key?.id || !key?.remoteJid) {
    throw new Error('Invalid message key; deletion was not attempted.');
  }

  await sock.sendMessage(jid, {
    delete: key
  });

  return true;
}

async function sendContactReport(sock, jid, result) {
  const report = [
    '╭━━〔 🛡️ ALVARIA SECURITY 〕━━╮',
    '🚨 اكتُشفت بطاقة جهة اتصال مخالفة.',
    '',
    `🗑️ حذف الرسالة: ${result.deleted ? '✅ تم' : '❌ فشل'}`,
    `🔒 قفل المجموعة: ${
      result.locked
        ? '✅ تم'
        : result.alreadyLocked
          ? '⚪ كانت مقفلة مسبقًا'
          : '❌ لم يتم'
    }`,
    `🚪 إزالة العضو: ${
      result.kicked
        ? '✅ تمت'
        : result.kickSkipped
          ? '⚠️ لم تتم: تعذر التحقق أو الحذف'
          : '❌ لم تتم'
    }`,
    `⏱️ مدة القفل المؤقت: ${TEMP_LOCK_MS / 1000} ثانية`,
    '',
    '👑 المشرفون مستثنون من الحماية.',
    '╰━━〔 ❄️ ALVARIA 〕━━╯'
  ].join('\n');

  await sock.sendMessage(jid, {
    text: report
  }).catch(() => {});
}

async function handleContactViolation({
  sock,
  jid,
  key,
  sender,
  senderAlt,
  logger,
  state
}) {
  const result = {
    deleted: false,
    locked: false,
    alreadyLocked: false,
    kicked: false,
    kickSkipped: false
  };

  if (!state.botIsAdmin) {
    logger?.warn?.(
      { jid },
      'Bot is not a group admin; contact moderation unavailable'
    );

    result.kickSkipped = true;
    await sendContactReport(sock, jid, result);
    return true;
  }

  if (!state.offender || state.offenderIsAdmin) {
    result.kickSkipped = true;
    await sendContactReport(sock, jid, result);
    return true;
  }

  const operations = await Promise.allSettled([
    deleteViolation(sock, jid, key),
    lockGroupTemporarily(sock, jid, state.metadata, logger)
  ]);

  if (operations[0].status === 'fulfilled') {
    result.deleted = true;
  } else {
    logger?.error?.(
      { err: operations[0].reason, jid },
      'Contact message deletion failed'
    );
  }

  if (operations[1].status === 'fulfilled') {
    result.locked = operations[1].value?.ok === true;
    result.alreadyLocked =
      operations[1].value?.reason === 'already-locked';
  } else {
    logger?.error?.(
      { err: operations[1].reason, jid },
      'Contact temporary lock failed'
    );
  }

  // لا نحاول إزالة العضو إذا لم ينجح حذف الرسالة.
  if (result.deleted) {
    try {
      const latest = await getFreshGroupState(
        sock,
        jid,
        sender,
        senderAlt
      );

      if (
        latest.botIsAdmin &&
        latest.offender &&
        !latest.offenderIsAdmin
      ) {
        const target = validRemovalJid(latest.offender);

        if (target) {
          await sock.groupParticipantsUpdate(
            jid,
            [target],
            'remove'
          );

          result.kicked = true;
        } else {
          result.kickSkipped = true;
        }
      } else {
        result.kickSkipped = true;
      }
    } catch (error) {
      result.kickSkipped = true;

      logger?.error?.(
        { err: error, jid },
        'Contact offender removal failed'
      );
    }
  } else {
    result.kickSkipped = true;
  }

  await sendContactReport(sock, jid, result);
  return true;
}

export async function enforceGroupProtection({
  sock,
  message,
  jid,
  settingsStore,
  logger
}) {
  if (!jid?.endsWith('@g.us') || !message?.message) {
    return false;
  }

  const key = message.key || {};

  if (key.fromMe) return false;

  let settings;

  try {
    settings = await settingsStore.get(jid);
  } catch (error) {
    logger?.error?.(
      { err: error, jid },
      'Protection settings read failed'
    );
    return false;
  }

  const protection = settings?.protection || {};

  if (!Object.values(protection).some(value => value === true)) {
    return false;
  }

  const sender = key.participant || message.participant;
  const senderAlt = key.participantAlt || message.participantAlt;

  if (!sender && !senderAlt) return false;

  let state;

  try {
    state = await getFreshGroupState(
      sock,
      jid,
      sender,
      senderAlt
    );
  } catch (error) {
    logger?.warn?.(
      { err: error, jid },
      'Fresh group metadata unavailable; moderation skipped'
    );
    return false;
  }

  if (!state.offender) return false;

  // المشرفون مستثنون من جميع المضادات.
  if (state.offenderIsAdmin) return false;

  const content = unwrapMessage(message.message);
  const senderKey = normalizeJid(sender || senderAlt);

  const violation = detectViolation(
    content,
    protection,
    senderKey,
    jid
  );

  if (!violation) return false;

  if (violation.key === 'antiContacts') {
    return handleContactViolation({
      sock,
      jid,
      key,
      sender,
      senderAlt,
      logger,
      state
    });
  }

  if (!state.botIsAdmin) {
    logger?.warn?.(
      { jid, violation: violation.label },
      'Bot is not admin; violating message cannot be deleted'
    );
    return true;
  }

  let deleted = false;

  try {
    await deleteViolation(sock, jid, key);
    deleted = true;
  } catch (error) {
    logger?.error?.(
      { err: error, jid, violation: violation.label },
      'Violation message deletion failed'
    );
  }

  // الروابط فقط تقفل المجموعة بعد نجاح حذف الرسالة.
  if (deleted && violation.lock) {
    try {
      const lockResult = await lockGroupTemporarily(
        sock,
        jid,
        state.metadata,
        logger
      );

      if (!lockResult.ok) {
        logger?.warn?.(
          { jid, reason: lockResult.reason },
          'Group was not locked by protection'
        );
      }
    } catch (error) {
      logger?.error?.(
        { err: error, jid },
        'Violation temporary lock failed'
      );
    }
  }

  return true;
}
