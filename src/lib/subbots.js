import { rememberNewsletterMessages } from './newsletter-post-cache.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import makeWASocket, {
  Browsers,
  DisconnectReason,
  useMultiFileAuthState
} from '@whiskeysockets/baileys';
import pino from 'pino';
import { handleIncomingMessage } from '../command-router.js';
import { createGroupSettingsStore } from './group-settings.js';
import { installChannelAttribution } from './channel-attribution.js';
import { subbotMediaCache } from './subbot-media-cache.js';

function waitForPairingSignal(sock, timeoutMs = 25000) {
  return new Promise((resolve, reject) => {
    let settled = false;

    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      sock.ev.off('connection.update', listener);
      error ? reject(error) : resolve();
    };

    const listener = ({ qr, connection, lastDisconnect }) => {
      if (qr) {
        finish();
      } else if (connection === 'close') {
        finish(new Error(
          lastDisconnect?.error?.message ||
          'انقطع الاتصال قبل تجهيز رمز الربط.'
        ));
      }
    };

    const timer = setTimeout(() => {
      finish(new Error('انتهت مهلة انتظار إشارة الربط من واتساب.'));
    }, timeoutMs);

    sock.ev.on('connection.update', listener);
  });
}

export function createSubbotManager(config, settingsStore, logger, memberManager, memberExtras) {
  const sessionsDir = config.subbotSessionsDir || path.join(config.rootDir, 'sessions', 'subbots');
  const sessions = new Map();
  let channelIdLookupStarted = false;
  const MAX_SUBBOTS = 60;

  // HINATA_GLOBAL_SUBBOT_BLOCKLIST_V1
  const globalBlocklistFile = path.join(
    config.databaseDir,
    'subbots',
    'global-blocklist.json'
  );

  async function readGlobalBlocklist() {
    try {
      const data = JSON.parse(
        await fs.readFile(globalBlocklistFile, 'utf8')
      );

      return Array.isArray(data) ? data : [];
    } catch (error) {
      if (error?.code === 'ENOENT') return [];
      throw error;
    }
  }

  async function saveGlobalBlocklist(records) {
    await fs.mkdir(path.dirname(globalBlocklistFile), {
      recursive: true
    });

    const temporaryFile =
      `${globalBlocklistFile}.${process.pid}.tmp`;

    await fs.writeFile(
      temporaryFile,
      JSON.stringify(records, null, 2),
      'utf8'
    );

    await fs.rename(temporaryFile, globalBlocklistFile);
  }

  function blocklistContainsNumber(list, number) {
    return (list || []).some(item => {
      if (typeof item !== 'string') return false;

      const user = item.split('@')[0].split(':')[0];
      return user === number;
    });
  }

  async function applyGlobalBlockToEntry(entry, number) {
  if (!entry) {
    return { status: 'failed', reason: 'missing_entry' };
  }

  const cleanNumber = String(number || '').replace(/\D/g, '');

  if (!cleanNumber || cleanNumber.length < 7) {
    return { status: 'failed', reason: 'invalid_number' };
  }

  if (entry.phone && String(entry.phone).replace(/\D/g, '') === cleanNumber) {
    return { status: 'self' };
  }

  if (entry.status !== 'connected' || !entry.socket) {
    return { status: 'queued' };
  }

  const sock = entry.socket;
  const mapping = sock.signalRepository?.lidMapping;

  if (
    typeof sock.updateBlockStatus !== 'function' ||
    typeof sock.fetchBlocklist !== 'function' ||
    typeof mapping?.getLIDForPN !== 'function' ||
    typeof mapping?.getPNForLID !== 'function'
  ) {
    return { status: 'failed', reason: 'baileys_api_unavailable' };
  }

  const pnJid = `${cleanNumber}@s.whatsapp.net`;

  const normalizeNumber = value => {
    if (!value || typeof value !== 'string') return '';

    return value
      .split('@')[0]
      .split(':')[0]
      .replace(/\D/g, '');
  };

  const isNumberBlocked = async (list, lid) => {
    const lidUser = normalizeNumber(lid);

    for (const item of list || []) {
      const jid = typeof item === 'string'
        ? item
        : item?.jid || item?.attrs?.jid;

      if (!jid || typeof jid !== 'string' || !jid.includes('@')) {
        continue;
      }

      const [rawUser, rawServer] = jid.split('@');
      const server = String(rawServer || '').toLowerCase();
      const user = String(rawUser || '')
        .split(':')[0]
        .replace(/\D/g, '');

      // أرقام الهاتف: لا نقارنها بمعرّفات LID.
      if (
        server === 's.whatsapp.net' ||
        server === 'hosted'
      ) {
        if (user === cleanNumber) {
          return true;
        }

        continue;
      }

      // معرّفات LID: نقارن LID ثم نتحقق من الرقم المرتبط به.
      if (
        server === 'lid' ||
        server === 'hosted.lid'
      ) {
        if (user === lidUser) {
          return true;
        }

        try {
          const mappedPN = await mapping.getPNForLID(jid);

          if (normalizeNumber(mappedPN) === cleanNumber) {
            return true;
          }
        } catch {
          // تابع فحص بقية القائمة.
        }
      }
    }

    return false;
  };

  try {
    // جلب LID؛ Baileys يحاول USync عند عدم وجود الربط في التخزين.
    const lid = await mapping.getLIDForPN(pnJid);

    if (!lid) {
      return {
        status: 'failed',
        reason: 'lid_mapping_unavailable'
      };
    }

    // التأكد من أن LID يعود فعلاً إلى الرقم المطلوب.
    const resolvedPN = await mapping.getPNForLID(lid);

    if (normalizeNumber(resolvedPN) !== cleanNumber) {
      return {
        status: 'failed',
        reason: 'lid_mapping_mismatch'
      };
    }

    // التحقق من الحظر السابق.
    const currentList = await sock.fetchBlocklist();

    if (await isNumberBlocked(currentList, lid)) {
      return { status: 'already' };
    }

    // إرسال طلب الحظر باستخدام LID الصحيح.
    await sock.updateBlockStatus(lid, 'block');

    // لا نعتبر الطلب ناجحاً قبل فحص القائمة مجدداً.
    const verifiedList = await sock.fetchBlocklist();

    if (await isNumberBlocked(verifiedList, lid)) {
      return { status: 'blocked' };
    }

    return {
      status: 'failed',
      reason: 'block_not_verified'
    };

  } catch (error) {
    logger.warn(
      {
        err: error,
        phone: entry.phone,
        target: cleanNumber
      },
      'ALVARIA unified block failed for subbot'
    );

    return {
      status: 'failed',
      reason: error?.message || 'block_request_failed'
    };
  }
}

async function applyGlobalBlocksToEntry(entry) {
    try {
      const records = await readGlobalBlocklist();

      for (const record of records) {
        if (!/^\d{8,15}$/.test(String(record?.number || ''))) {
          continue;
        }

        await applyGlobalBlockToEntry(entry, record.number);
      }
    } catch (error) {
      logger.error(
        { err: error, phone: entry?.phone },
        'Could not apply ALVARIA global blocklist'
      );
    }
  }

  async function blockAll(number) {
    number = String(number || '').replace(/\D/g, '');

    if (!/^\d{8,15}$/.test(number)) {
      throw new Error('رقم الهاتف غير صالح.');
    }

    // احفظ الطلب أولاً حتى تتم معالجته عند عودة الجلسات.
    const records = await readGlobalBlocklist();

    if (!records.some(item => item?.number === number)) {
      records.push({
        number,
        label: '🚫 مبند',
        createdAt: Date.now()
      });

      await saveGlobalBlocklist(records);
    }

    const entries = [...sessions.values()];

    const result = {
      blocked: 0,
      already: 0,
      queued: 0,
      failed: 0,
      selfSkipped: 0
    };

    // لا نضغط على Termux أو واتساب بتشغيل 720 طلباً دفعة واحدة.
    let cursor = 0;
    const workerCount = Math.min(12, entries.length);

    async function worker() {
      while (cursor < entries.length) {
        const entry = entries[cursor++];

        const outcome = await applyGlobalBlockToEntry(
          entry,
          number
        );

        if (outcome.status === 'blocked') result.blocked++;
        else if (outcome.status === 'already') result.already++;
        else if (outcome.status === 'queued') result.queued++;
        else if (outcome.status === 'self') result.selfSkipped++;
        else result.failed++;
      }
    }

    await Promise.all(
      Array.from({ length: workerCount }, () => worker())
    );

    return result;
  }


  function makeSessionId(phone) {
    return `${phone}__${Date.now()}_${randomBytes(3).toString('hex')}`;
  }

  function parseSessionDirectory(name) {
    if (/^\d{8,15}$/.test(name)) {
      return { sessionId: name, phone: name, legacy: true };
    }

    const match = name.match(/^(\d{8,15})__(\d+_[a-f0-9]+)$/);
    if (!match) return null;

    return {
      sessionId: name,
      phone: match[1],
      legacy: false
    };
  }

  async function countSubbots() {
    await fs.mkdir(sessionsDir, { recursive: true });
    const entries = await fs.readdir(sessionsDir, { withFileTypes: true });

    return entries.filter(item =>
      item.isDirectory() && parseSessionDirectory(item.name)
    ).length;
  }

  async function startSession(
    sessionId,
    phone,
    requestCode = false,
    force = false,
    notify = null
  ) {
    const existing = sessions.get(sessionId);

    if (!force && existing &&
        ['connected', 'waiting', 'connecting', 'reconnecting'].includes(existing.status)) {
      return {
        status: existing.status,
        already: true,
        code: existing.code || null,
        sessionId
      };
    }

    const sessionDir = path.join(sessionsDir, sessionId);
    await fs.mkdir(sessionDir, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

    const entry = {
      sessionId,
      phone,
      status: 'connecting',
      code: null,
      socket: null,
      reconnecting: false,
      noReconnect: false,
      notify: notify || existing?.notify || null,
      ownerJid: notify?.ownerJid || existing?.ownerJid || null,
      ownerAltJid: notify?.ownerAltJid || existing?.ownerAltJid || null,
      notifiedConnected: existing?.notifiedConnected || false,
      createdAt: existing?.createdAt || Date.now()
    };

    sessions.set(sessionId, entry);

    if (entry.ownerJid || entry.ownerAltJid) {
      const fsPromises = await import('node:fs/promises');
      await fsPromises.writeFile(
        path.join(sessionDir, 'subbot-owner.json'),
        JSON.stringify({
          ownerJid: entry.ownerJid,
          ownerAltJid: entry.ownerAltJid
        }, null, 2),
        'utf8'
      );
    }

    if (force && existing?.socket) {
      try {
        existing.noReconnect = true;
        existing.socket.end(new Error('استبدال اتصال الجلسة'));
      } catch {}
    }

    const sessionSettingsStore = createGroupSettingsStore(
      path.join(config.databaseDir, 'subbots', sessionId)
    );

    const sock = makeWASocket({
      auth: state,
      browser: Browsers.macOS('Chrome'),
      printQRInTerminal: false,
      markOnlineOnConnect: false,
      syncFullHistory: false,
      logger: pino({ level: 'silent' }),
      mediaCache: subbotMediaCache
    });

    entry.socket = sock;
    installChannelAttribution(sock, logger);

    sock.ev.on('creds.update', saveCreds);

        // HINATA_NEWSLETTER_CACHE_LISTENER
    sock.ev.on('messages.upsert', ({ messages }) => {
      rememberNewsletterMessages(sock, messages);
    });

sock.ev.on('messages.upsert', ({ messages, type }) => {
      if (type !== 'notify' || !Array.isArray(messages)) return;

      for (const message of messages) {
        void (async () => {
          await handleIncomingMessage({
            sock,
            message,
            config,
            settingsStore: sessionSettingsStore,
            memberManager,
            memberExtras,
            subbotManager: manager,
                                            subbotSessionId: sessionId,
            subbotOwnerJid: entry.ownerJid,
            subbotOwnerAltJid: entry.ownerAltJid,
            logger
          });
        })().catch(error => {
          logger.error(
            { err: error, phone, sessionId },
            'Subbot message handler failed'
          );
        });
      }
    });

    sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
      if (sessions.get(sessionId) !== entry) return;

      if (connection === 'open') {
        entry.status = 'connected';
        entry.code = null;
        entry.reconnecting = false;
        console.log(`❄️ ALVARIA subbot connected: ${sessionId}`);

        // HINATA_TEMP_CHANNEL_ID_LOOKUP_V1
        if (!channelIdLookupStarted) {
          channelIdLookupStarted = true;

          void (async () => {
            try {
              console.log('🔎 جاري استخراج معرّف القناة عبر اتصال فرعي قائم...');

              const metadata = await sock.newsletterMetadata(
                'invite',
                '0029VbE4YgU8PgsK59l5hI2N'
              );

              if (!metadata?.id) {
                console.log('❌ لم يرجع واتساب معرّف القناة.');
                return;
              }

              console.log('╭━━━━━━〔 ❄️ ALVARIA CHANNEL RESULT 〕━━━━━━╮');
              console.log('📌 اسم القناة:', metadata.name);
              console.log('🆔 معرّف القناة:', metadata.id);
              console.log('🔗 الدعوة:', metadata.invite || 'غير متوفرة');
              console.log('╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯');
            } catch (error) {
              console.log('❌ فشل استخراج المعرّف:', error.message);
            }
          })();
        }

        void applyGlobalBlocksToEntry(entry);

        if (entry.notify?.mainSock &&
            entry.notify?.groupJid &&
            !entry.notifiedConnected) {
          entry.notifiedConnected = true;

          void entry.notify.mainSock.sendMessage(entry.notify.groupJid, {
            text:
              '╭━━〔 ❄️ ALVARIA SUBBOT 〕━━╮\n' +
              '✅ تم ربط البوت الفرعي بنجاح!\n' +
              `📱 الرقم: ${phone}\n` +
              `🆔 الجلسة: ${sessionId}\n` +
              '🍹 أصبحت جلستك جاهزة الآن.\n' +
              '╰━━━━━━━━━━━━━━━━╯'
          }).catch(error => {
            logger.warn(
              { err: error, phone, sessionId },
              'Could not announce subbot connection'
            );
          });
        }
      }

      if (connection === 'close' && !entry.reconnecting) {
        if (entry.noReconnect) return;

        const statusCode = lastDisconnect?.error?.output?.statusCode;

        if (statusCode === DisconnectReason.loggedOut) {
          entry.noReconnect = true;
          entry.status = 'logged_out';

          console.log(`⚠️ HINATA subbot logged out: ${sessionId}`);

          void (async () => {
            try {
              await fs.rm(sessionDir, {
                recursive: true,
                force: true
              });

              if (sessions.get(sessionId) === entry) {
                sessions.delete(sessionId);
              }

              entry.socket = null;

              logger.info(
                { phone, sessionId },
                'Logged-out subbot session deleted'
              );
            } catch (error) {
              logger.error(
                { err: error, phone, sessionId },
                'Could not delete logged-out subbot session'
              );
            }
          })();

          return;
        }

        entry.reconnecting = true;
        entry.status = 'reconnecting';

        setTimeout(async () => {
          if (sessions.get(sessionId) !== entry) return;

          try {
            await startSession(
              sessionId,
              phone,
              false,
              true,
              entry.notify
            );
          } catch (error) {
            entry.status = 'error';
            logger.error(
              { err: error, phone, sessionId },
              'Subbot reconnect failed'
            );
          }
        }, 3000);
      }
    });

    if (requestCode) {
      if (state.creds.registered) {
        entry.noReconnect = true;
        entry.status = 'error';
        try {
          sock.end(new Error('هذه الجلسة مسجلة بالفعل.'));
        } catch {}

        throw new Error(
          'مجلد الجلسة الجديدة يحتوي على بيانات مسجلة. لم نستخدم بيانات جلسة أخرى.'
        );
      }

      try {
        const normalizedPhone = String(phone).replace(/\D/g, '');

        if (!/^\d{8,15}$/.test(normalizedPhone)) {
          throw new Error('رقم الهاتف غير صالح.');
        }

        // انتظر إشارة QR من اتصال واتساب قبل طلب رمز الربط.
        await waitForPairingSignal(sock);

        if (sessions.get(sessionId) !== entry) {
          throw new Error('تم استبدال الجلسة أثناء التنصيب.');
        }

        const code = await sock.requestPairingCode(normalizedPhone);

        entry.code = code;
        entry.status = 'waiting';

        console.log(
          `❄️ Pairing code created for phone ending ${normalizedPhone.slice(-4)}`
        );

        return {
          status: 'waiting',
          code,
          phone: normalizedPhone,
          sessionId
        };
      } catch (error) {
        entry.noReconnect = true;
        entry.status = 'error';

        try {
          sock.end(error);
        } catch {}

        logger.error(
          { err: error, phone, sessionId },
          'Subbot pairing code request failed'
        );

        throw new Error(
          `تعذر إنشاء رمز الربط: ${error?.message || 'خطأ اتصال'}`
        );
      }
    }

    if (state.creds.registered) {
      entry.status = 'connecting';
      return { status: 'connecting', phone, sessionId };
    }

    return { status: 'not_registered', phone, sessionId };
  }

  async function create(phone, notify = null) {
    phone = String(phone || '').replace(/\D/g, '');

    if (!/^\d{8,15}$/.test(phone)) {
      throw new Error('رقم الهاتف غير صالح.');
    }

    await fs.mkdir(sessionsDir, { recursive: true });

    const count = await countSubbots();

    if (count >= MAX_SUBBOTS) {
      throw new Error('وصلنا إلى الحد الأقصى: 720 جلسة فرعية.');
    }

    // كل تنصيب جديد يحصل على معرّف ومجلد مستقلين.
    const sessionId = makeSessionId(phone);
    const sessionDir = path.join(sessionsDir, sessionId);

    await fs.mkdir(sessionDir, { recursive: false });

    return startSession(sessionId, phone, true, false, notify);
  }

  async function startExisting() {
    await fs.mkdir(sessionsDir, { recursive: true });

    const entries = await fs.readdir(sessionsDir, { withFileTypes: true });

    let restoredCount = 0;

    for (const item of entries) {
      if (restoredCount >= MAX_SUBBOTS) {
        logger.warn(
          { limit: MAX_SUBBOTS },
          'Subbot restore limit reached; remaining sessions were not started'
        );
        break;
      }
      if (!item.isDirectory()) continue;

      const parsed = parseSessionDirectory(item.name);
      if (!parsed) continue;

      try {
        const sessionDir = path.join(sessionsDir, item.name);
        const { state } = await useMultiFileAuthState(sessionDir);

        let ownerNotify = null;
        try {
          const fsPromises = await import('node:fs/promises');
          ownerNotify = JSON.parse(
            await fsPromises.readFile(
              path.join(sessionDir, 'subbot-owner.json'),
              'utf8'
            )
          );
        } catch {}

        if (state.creds.registered) {
          await startSession(
            parsed.sessionId,
            parsed.phone,
            false,
            false,
            ownerNotify
          );
          restoredCount++;
        }
      } catch (error) {
        logger.error(
          { err: error, phone: parsed.phone, sessionId: parsed.sessionId },
          'Could not restore subbot'
        );
      }
    }
  }

  function getStatus(phone) {
    const matching = [...sessions.values()]
      .filter(entry => entry.phone === String(phone))
      .sort((a, b) => b.createdAt - a.createdAt);

    return matching[0]?.status || 'not_found';
  }

  // إضافة دالة لجلب الجلسات الفرعية النشطة والمتصلة للتعميم
  function getActiveSessions() {
    return [...sessions.values()].filter(entry => 
      entry.status === 'connected' && entry.socket && entry.socket.ws
    );
  }

  const manager = { create, startExisting, getStatus, blockAll, getActiveSessions };
  return manager;
}
