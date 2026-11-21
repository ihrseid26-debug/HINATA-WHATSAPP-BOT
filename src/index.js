import { rememberNewsletterMessages } from './lib/newsletter-post-cache.js';
import 'dotenv/config';
import fs from 'node:fs/promises';
import readline from 'node:readline/promises';
import process from 'node:process';
import makeWASocket, { DisconnectReason, useMultiFileAuthState } from '@whiskeysockets/baileys';
import pino from 'pino';
import { config } from './config.js';
import { createGroupSettingsStore } from './lib/group-settings.js';
import { createSubbotManager } from './lib/subbots.js';
import { createMemberManager } from './lib/member-management.js';
import { createMemberExtras } from './lib/member-extras.js';
import { handleIncomingMessage } from './command-router.js';
import { installChannelAttribution } from './lib/channel-attribution.js';
import { handleMarasemParticipantUpdate } from './lib/marasem.js';
import { handleDeviceJoinAudit } from './lib/group-device-audit.js';
import { startAutonomousManager } from './lib/autonomous/manager.js';

const logger = pino({ level: config.logLevel });
const settingsStore = createGroupSettingsStore(config.databaseDir);
const memberManager = createMemberManager(config.databaseDir, logger);
const memberExtras = createMemberExtras(config.databaseDir, logger);
const subbotManager = createSubbotManager(config, settingsStore, logger, memberManager, memberExtras);

void import('./lib/telegram-installer.js').then(({ startTelegramInstaller }) => {
  startTelegramInstaller({ subbotManager, logger });
}).catch(error => {
  logger.error({ err: error }, 'Telegram installer startup failed');
});
let subbotsRestored = false;
let reconnecting = false;

async function askPhoneNumber() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question('أدخل رقم واتساب مع رمز الدولة، أرقام فقط ومن دون +: ');
    return answer.replace(/\D/g, '');
  } finally {
    rl.close();
  }
}

async function startBot() {
  startAutonomousManager(logger);

  if (!subbotsRestored) {
    await subbotManager.startExisting();
    subbotsRestored = true;
  }
  await fs.mkdir(config.sessionDir, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(config.sessionDir);

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    markOnlineOnConnect: false,
    syncFullHistory: false,
    logger: pino({ level: 'silent' })
  });

  installChannelAttribution(sock, logger);

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('group-participants.update', async update => {
    logger.info({
      action: update?.action || 'unknown',
      participantCount: Array.isArray(update?.participants)
        ? update.participants.length
        : 0
    }, 'Group participants update received');

    try {
      await memberManager.recordParticipantUpdate(update);
    } catch (error) {
      logger.warn({ err: error }, 'Member manager participant update failed');
    }

    try {
      await memberExtras.recordParticipantUpdate(update);
    } catch (error) {
      logger.warn({ err: error }, 'Member extras participant update failed');
    }

    try {
      await handleDeviceJoinAudit(sock, update, settingsStore, logger);
    } catch (error) {
      logger.warn({ err: error }, 'Device join audit failed');
    }

    try {
      await handleMarasemParticipantUpdate(sock, update, settingsStore, logger);
    } catch (error) {
      logger.warn({
        err: error,
        action: update?.action || 'unknown'
      }, 'Marasem participant update handler failed');
    }
  });

  sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
    if (connection === 'connecting') logger.info('Connecting to WhatsApp...');
    if (connection === 'open') {
      logger.info('ALVARIA connected successfully.');
      console.log('\n❄️ ALVARIA متصل بواتساب — يعمل في المجموعات فقط.');

      console.log('\n🔎 بدأ فحص القنوات المتابعة...');

      (async () => {
        try {
          if (typeof sock.newsletterFetchAllParticipating !== 'function') {
            console.log('❌ دالة جلب القنوات غير متاحة في هذا الاتصال.');
            return;
          }

          const result = await sock.newsletterFetchAllParticipating();

          console.log('✅ انتهى طلب جلب القنوات.');
          console.log('نوع النتيجة:', Array.isArray(result) ? 'Array' : typeof result);
          console.log('مفاتيح النتيجة:',
            result && typeof result === 'object'
              ? Object.keys(result)
              : []
          );

          console.log('\n========== RAW CHANNEL DATA ==========');
          try {
            console.log(JSON.stringify(result, null, 2)?.slice(0, 15000));
          } catch {
            console.log('تعذر تحويل النتيجة إلى JSON.');
          }

          const found = [];
          const visited = new WeakSet();

          function scan(value) {
            if (!value || typeof value !== 'object') return;
            if (visited.has(value)) return;
            visited.add(value);

            if (
              typeof value.id === 'string' &&
              value.id.endsWith('@newsletter')
            ) {
              found.push({
                id: value.id,
                name: value.name || 'بدون اسم',
                invite: value.invite || ''
              });
            }

            for (const child of Object.values(value)) scan(child);
          }

          scan(result);

          console.log('\n========== ALVARIA CHANNEL SEARCH ==========');

          if (!found.length) {
            console.log('لم نعثر على عناصر بمعرّف @newsletter في النتيجة.');
          } else {
            for (const channel of found) {
              console.log('❄️ الاسم:', channel.name);
              console.log('🆔 المعرّف:', channel.id);
              console.log('🔗 الدعوة:', channel.invite || 'غير متوفرة');
              console.log('------------------------------');
            }
          }

          console.log('========== END CHANNEL SEARCH ==========\n');
        } catch (error) {
          console.error('❌ فشل فحص القنوات:', error?.stack || error);
        }
      })();
    }
if (connection === 'close' && !reconnecting) {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      if (statusCode === DisconnectReason.loggedOut) {
        logger.error('WhatsApp session logged out. Remove the session only if you intentionally want to pair again.');
        console.error('⛔ تم تسجيل خروج الجلسة. لا تحذف مجلد sessions إلا إذا أردت ربطًا جديدًا.');
        return;
      }
      reconnecting = true;
      logger.warn({ statusCode }, 'Connection closed; reconnecting in 3 seconds.');
      setTimeout(async () => {
        reconnecting = false;
        try {
          await startBot();
        } catch (error) {
          logger.error({ err: error }, 'Reconnect attempt failed');
        }
      }, 3000);
    }
  });

    // HINATA_NEWSLETTER_CACHE_LISTENER
  sock.ev.on('messages.upsert', ({ messages }) => {
    rememberNewsletterMessages(sock, messages);
  });

sock.ev.on('messages.upsert', async ({ messages, type }) => {
    logger.info({
      type,
      count: Array.isArray(messages) ? messages.length : 0
    }, '[DEBUG] messages.upsert received');

    if (type !== 'notify' || !Array.isArray(messages)) return;

    for (const message of messages) {
      try {
        await handleIncomingMessage({ sock, message, config, settingsStore, subbotManager, memberManager, memberExtras, logger });
      } catch (error) {
        logger.error({ err: error }, 'Unhandled message handler error');
      }
    }
  });

  if (!state.creds.registered) {
    const phoneNumber = await askPhoneNumber();
    if (!/^\d{8,15}$/.test(phoneNumber)) {
      throw new Error('رقم الهاتف غير صالح. استخدم رمز الدولة ثم الأرقام فقط، من 8 إلى 15 رقمًا.');
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
    const code = await sock.requestPairingCode(phoneNumber);
    console.log(`\n🔐 رمز ربط ALVARIA: ${code}\nافتح واتساب > الأجهزة المرتبطة > ربط جهاز > الربط برقم الهاتف.`);
  }
}

process.on('unhandledRejection', (error) => logger.error({ err: error }, 'Unhandled promise rejection'));
process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'Uncaught exception');
  process.exitCode = 1;
});

startBot().catch((error) => {
  logger.fatal({ err: error }, 'ALVARIA failed to start');
  console.error('❌ تعذر تشغيل ALVARIA:', error?.message || error);
  process.exitCode = 1;
});
