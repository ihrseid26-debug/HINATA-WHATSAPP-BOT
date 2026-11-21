// HINATA_GROUP_DEVICE_AUDIT_V2
// Device presence is not proof of automation.

function normalizeJid(value) {
  return String(value || '')
    .trim()
    .replace(/:\d+@/, '@');
}

function getParticipantJid(participant) {
  const candidates = typeof participant === 'string'
    ? [participant]
    : [
        participant?.id,
        participant?.jid,
        participant?.phoneNumber,
        participant?.lid
      ];

  return candidates
    .filter(value => typeof value === 'string')
    .map(normalizeJid)
    .find(value =>
      value.includes('@') &&
      !value.endsWith('@g.us') &&
      !value.endsWith('@broadcast')
    ) || null;
}


// HINATA_TEMPORARY_DEVICE_LOCK_V1
const deviceAuditUnlockTimers = new Map();

export async function temporarilyLockGroup(sock, groupJid, logger) {
  if (!groupJid?.endsWith('@g.us')) {
    return { locked: false, reason: 'invalid_group' };
  }

  try {
    const metadata = await sock.groupMetadata(groupJid);

    // لا نغيّر قفلًا كان موجودًا قبل الفحص.
    if (metadata?.announce === true) {
      return { locked: false, alreadyLocked: true };
    }

    const botIds = [
      sock.user?.id,
      sock.user?.lid
    ].filter(Boolean).map(normalizeJid);

    const botParticipant = (metadata.participants || []).find(item => {
      const ids = [
        item.id,
        item.jid,
        item.lid,
        item.phoneNumber
      ].filter(Boolean).map(normalizeJid);

      return ids.some(id => botIds.includes(id));
    });

    if (!['admin', 'superadmin'].includes(botParticipant?.admin)) {
      return { locked: false, reason: 'bot_not_admin' };
    }

    await sock.groupSettingUpdate(groupJid, 'announcement');

    const oldTimer = deviceAuditUnlockTimers.get(groupJid);
    if (oldTimer) clearTimeout(oldTimer);

    const timer = setTimeout(async () => {
      try {
        const current = await sock.groupMetadata(groupJid);

        // لا نفتح المجموعة إذا كان أحد المشرفين قد فتحها يدويًا.
        if (current?.announce === true) {
          await sock.groupSettingUpdate(groupJid, 'not_announcement');
          await sock.sendMessage(groupJid, {
            text:
              '🔓 🌸 ALVARIA SECURITY\n' +
              'انتهت مدة القفل الوقائي المؤقت (60 ثانية).\n' +
              'يمكن للأعضاء إرسال الرسائل مجددًا.'
          });
        }
      } catch (error) {
        logger?.warn?.(
          { err: error, jid: groupJid },
          'ALVARIA temporary device lock auto-unlock failed'
        );
      } finally {
        if (deviceAuditUnlockTimers.get(groupJid) === timer) {
          deviceAuditUnlockTimers.delete(groupJid);
        }
      }
    }, 60_000);

    timer.unref?.();
    deviceAuditUnlockTimers.set(groupJid, timer);

    return { locked: true, seconds: 60 };
  } catch (error) {
    logger?.warn?.(
      { err: error, jid: groupJid },
      'ALVARIA temporary device lock failed'
    );
    return { locked: false, reason: 'lock_failed' };
  }
}

function getMentionText(jid) {
  return '@' + String(jid || '').split('@')[0].split(':')[0];
}

export async function inspectMemberDevices(sock, participant) {
  const jid = getParticipantJid(participant);

  if (!jid || typeof sock.getUSyncDevices !== 'function') {
    return { ok: false, count: 0, jid };
  }

  try {
    const devices = await sock.getUSyncDevices(
      [jid],
      true,
      true
    );

    const unique = new Set();

    for (const device of devices || []) {
      const number = Number(device?.device);

      if (Number.isInteger(number) && number > 0) {
        unique.add(`${device.user || jid}:${number}`);
      }
    }

    return {
      ok: true,
      count: unique.size,
      jid
    };
  } catch {
    return { ok: false, count: 0, jid };
  }
}

export async function auditGroupDevices(sock, participants) {
  const list = Array.isArray(participants) ? participants : [];

  let scanned = 0;
  let devicesTotal = 0;
  let failed = 0;

  const seen = new Set();
  const membersWithDevices = [];

  for (const participant of list) {
    const jid = getParticipantJid(participant);

    if (!jid || seen.has(jid)) continue;
    seen.add(jid);

    const result = await inspectMemberDevices(sock, participant);

    if (!result.ok) {
      failed += 1;
      continue;
    }

    scanned += 1;
    devicesTotal += result.count;

    if (result.count > 0) {
      membersWithDevices.push({
        jid,
        count: result.count
      });
    }
  }

  return {
    scanned,
    devicesTotal,
    membersWithDevices,
    membersWithDevicesCount: membersWithDevices.length,
    failed,
    totalMembers: seen.size
  };
}

export async function handleDeviceJoinAudit(
  sock,
  update,
  settingsStore,
  logger
) {
  if (
    update?.action !== 'add' ||
    !update?.id?.endsWith('@g.us')
  ) {
    return;
  }

  const groupJid = update.id;

  try {
    const settings = await settingsStore.get(groupJid);

    if (settings?.protection?.antiBots !== true) return;

    for (const participant of update.participants || []) {
      const result = await inspectMemberDevices(sock, participant);

      if (!result.ok || result.count === 0 || !result.jid) continue;

      const lockResult = await temporarilyLockGroup(sock, groupJid, logger);
      const lockNotice = lockResult.locked
        ? '🔒 تم قفل المجموعة مؤقتًا لمدة 60 ثانية.'
        : lockResult.alreadyLocked
          ? '🔒 المجموعة مقفلة مسبقًا، ولم نغيّر إعدادها.'
          : lockResult.reason === 'bot_not_admin'
            ? '⚠️ لم يتم القفل: يجب ترقية ALVARIA إلى مشرف.'
            : '⚠️ تعذّر تطبيق القفل المؤقت.';

      const mention = getMentionText(result.jid);

      await sock.sendMessage(groupJid, {
        text:
          '╭━━〔 🌸 ALVARIA • SECURITY 〕━━╮\n' +
          `👤 العضو: ${mention}\n` +
          '🔎 فحص الأجهزة عند دخول عضو جديد\n' +
          `📱 الأجهزة الإضافية المكتشفة: ${result.count}\n` +
          lockNotice + '\n' +
          '⚠️ تم اكتشاف أجهزة إضافية مرتبطة بهذا الحساب.\n' +
          '👑 يمكن للمشرفين مراجعة نشاط المجموعة.\n' +
          '╰━━━━━━━━━━━━━━━━━━━━╯',
        mentions: [result.jid]
      });
    }
  } catch (error) {
    logger?.warn?.(
      { err: error, jid: groupJid },
      'ALVARIA device join audit failed'
    );
  }
}
