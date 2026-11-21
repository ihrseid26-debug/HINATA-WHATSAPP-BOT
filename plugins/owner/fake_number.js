/**
 * @file plugins/owner/fake_number.js
 * @description أمر جلب رقم وهمي وإدارة استقبال كود التحقق (SMS OTP) مع معالجة شاملة للتزامن والأخطاء والتخزين
 * ♢ •┆˹🪸╵ `𝙼𝙰𝙳𝙴 𝙱𝚈 🇷وْدْʏ`╷⇊˼
 */

import fs from 'fs';
import path from 'path';

// قائمة أرقام المطورة المعتمدة بدقة (تطابق تام للرقم وليس جزئي لتفادي الأخطاء)
const ALLOWED_DEVELOPERS = ['22383215406'];

const CONFIG = Object.freeze({
    CHANNEL_ID: '120363427347904077@newsletter',
    BOT_NAME: '𝑨𝑼𝑹𝑬𝙻𝑰𝑨 𝐁𝐎𝐓',
    API_BASE: 'https://api.instantnum.com/v1', // ⚠️ استبدل هذا الرابط بالـ API الفعلي للخدمة لاحقاً
    POLL_INTERVAL_MS: 10000, // 10 ثوانٍ
    MAX_ATTEMPTS: 30         // ~5 دقائق أقصى مدة انتظار
});

const SESSIONS_FILE = path.join(process.cwd(), 'database', 'fake_sessions.json');

// تأكد من وجود مجلد قاعدة البيانات مع معالجة الأخطاء
try {
    const dbDir = path.dirname(SESSIONS_FILE);
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }
} catch (e) {
    console.error('[FakeNum] خطأ في إنشاء مجلد قاعدة البيانات:', e.message);
}

// تخزين المؤقتات النشطة لمنع تداخل الطلبات وحمايتها عند إغلاق البوت
const activePolls = new Map();

const FOOTER = `* *♢ •┆˹🪸\u25f5 \`𝙼𝙰𝙳𝙴 𝙱𝚈 🇷وْدْʏ\`╷⇊˼*`;

function appendFooter(text) {
    return `${text}\n\n${FOOTER}`;
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

function formatShort(text, emoji = '❌') {
    return appendFooter(`*❮ ${emoji}┇ ${text} ❯*`);
}

// قراءة الجلسات المخزنة بأمان
function loadSessions() {
    try {
        if (fs.existsSync(SESSIONS_FILE)) {
            const raw = fs.readFileSync(SESSIONS_FILE, 'utf8');
            return JSON.parse(raw);
        }
    } catch (e) {
        console.error('[FakeNum] خطأ في قراءة ملف الجلسات:', e.message);
    }
    return {};
}

// حفظ الجلسات مع إلقاء الخطأ والتنبيه لعدم إخفائه
function saveSessions(data) {
    try {
        fs.writeFileSync(SESSIONS_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.error('[FakeNum] خطأ حرج في حفظ ملف الجلسات:', e.message);
        throw new Error('فشل حفظ بيانات الجلسة محلياً.');
    }
}

// دالة فحص وتطهير سياق الرسائل الواردة ضد التكرار والتداخل
async function checkSmsWorker(token, phone, chatId, sock) {
    const sessionKey = `${chatId}_${phone}`;
    let sessionData = activePolls.get(sessionKey);
    if (!sessionData) return;

    // منع تداخل الطلبات المتزامنة إذا استغرق الطلب السابق وقتاً أطول من الفاصل الزمني
    if (sessionData.isFetching) return;
    sessionData.isFetching = true;

    sessionData.attempts++;

    try {
        // انتهاء المهلة (5 دقائق)
        if (sessionData.attempts > CONFIG.MAX_ATTEMPTS) {
            stopPolling(sessionKey, true);
            removeSession(phone);
            await sock.sendMessage(chatId, {
                text: formatShort(`انتهت مهلة انتظار الكود للرقم +${phone} (5 دقائق) دون استلام أي رسالة.`, '⏰'),
                contextInfo: buildChannelContext()
            }).catch(() => {});
            return;
        }

        const smsRes = await fetch(`${CONFIG.API_BASE}/check-sms?token=${encodeURIComponent(token)}`, {
            headers: { 'Accept': 'application/json' }
        }).catch(() => null);

        if (!smsRes || !smsRes.ok) {
            sessionData.isFetching = false;
            return;
        }

        const smsData = await smsRes.json().catch(() => null);
        if (!smsData || typeof smsData !== 'object') {
            sessionData.isFetching = false;
            return;
        }

        // دعم مختلف مخططات الاستجابة للـ API
        const messagesList = Array.isArray(smsData) ? smsData : (smsData.messages || smsData.data?.messages || [smsData]);

        for (const msg of messagesList) {
            if (!msg || typeof msg !== 'object') continue;

            const smsText = msg.code || msg.sms || msg.text || msg.body || '';
            // الاعتماد حصرياً على معرّف فريد للرسالة إن وجد لمنع التكرار بصورة موثوقة
            const msgId = msg.id || msg.message_id || msg.uuid || (smsText ? Buffer.from(smsText).toString('base64') : null);

            if (smsText && msgId && !sessionData.receivedSmsIds.has(msgId)) {
                sessionData.receivedSmsIds.add(msgId);

                // إيقاف المراقبة وتنظيف الجلسة بنجاح
                stopPolling(sessionKey, true);
                removeSession(phone);

                await sock.sendMessage(chatId, {
                    text: appendFooter(
                        `*🔐 ¦ وصـل كـود / رسـالـة الـتـحـقـق!* \n\n` +
                        `*• الـرقم:* \`+${phone}\`\n` +
                        `*• المحتوى:* \`${smsText}\`\n\n` +
                        `*تم استلام الرمز بنجاح.*`
                    ),
                    contextInfo: buildChannelContext()
                }).catch(() => {});
                break;
            }
        }
    } catch (err) {
        console.error(`[FakeNum] خطأ أثناء فحص SMS للرقم +${phone}:`, err.message);
    } finally {
        if (activePolls.has(sessionKey)) {
            activePolls.get(sessionKey).isFetching = false;
        }
    }
}

// بدء مراقبة الجلسة
function startPolling(token, phone, chatId, sock) {
    const sessionKey = `${chatId}_${phone}`;
    if (activePolls.has(sessionKey)) return;

    const sessionData = {
        attempts: 0,
        receivedSmsIds: new Set(),
        isFetching: false,
        timer: null
    };

    sessionData.timer = setInterval(() => {
        checkSmsWorker(token, phone, chatId, sock);
    }, CONFIG.POLL_INTERVAL_MS);

    activePolls.set(sessionKey, sessionData);
}

// إيقاف المؤقت بأمان
function stopPolling(sessionKey, clearTimer = true) {
    if (activePolls.has(sessionKey)) {
        const data = activePolls.get(sessionKey);
        if (clearTimer && data.timer) {
            clearInterval(data.timer);
        }
        activePolls.delete(sessionKey);
    }
}

// حذف الجلسة من التخزين الدائم مع معالجة شاملة للأخطاء
function removeSession(phone) {
    try {
        const sessions = loadSessions();
        if (sessions[phone]) {
            delete sessions[phone];
            saveSessions(sessions);
        }
    } catch (e) {
        console.error(`[FakeNum] فشل حذف الجلسة للرقم +${phone}:`, e.message);
    }
}

// إعادة تشغيل مراقبة الجلسات المخزنة تلقائياً عند إعادة تشغيل البوت (تستدعى عند بدء التشغيل)
export function restorePendingSessions(sockInstance) {
    try {
        const sessions = loadSessions();
        const now = Date.now();
        const maxAgeMs = CONFIG.MAX_ATTEMPTS * CONFIG.POLL_INTERVAL_MS; // 5 دقائق كحد أقصى للصلاحية

        for (const [phone, session] of Object.entries(sessions)) {
            if (!session || !session.token || !session.chatId) continue;

            // التحقق من صلاحية الجلسة وعمرها الزمني لتفادي مراقبة جلسات قديمة منتهية الصلاحية
            if (now - (session.createdAt || 0) > maxAgeMs) {
                removeSession(phone);
                continue;
            }

            // استئناف المراقبة النشطة
            startPolling(session.token, phone, session.chatId, sockInstance);
        }
    } catch (e) {
        console.error('[FakeNum] فشل استعادة الجلسات المعلقة:', e.message);
    }
}

// معالجة عامة لإيقاف كافة المؤقتات عند إغلاق السيرفر أو البوت
process.once('SIGINT', () => {
    for (const [key, data] of activePolls.entries()) {
        if (data.timer) clearInterval(data.timer);
    }
    activePolls.clear();
});

process.once('SIGTERM', () => {
    for (const [key, data] of activePolls.entries()) {
        if (data.timer) clearInterval(data.timer);
    }
    activePolls.clear();
});

export default {
    name: 'رقم_وهمي',
    command: ['رقم_وهمي', 'fakenum', 'virtualnum', 'رقم'],
    category: 'owner',
    ownerOnly: true,
    description: 'جلب رقم وهمي ومتابعة استقبال كود التحقق تلقائياً مع التخزين الدائم واستعادة الجلسات',

    async execute(sock, message, args, extra = {}) {
        const chatId = extra.from || message.key.remoteJid;
        const senderJid = extra.sender || message.key.participant || message.key.remoteJid || '';
        const senderNum = senderJid.replace(/[^0-9]/g, '');

        // 1. التحقق الدقيق والآمن من رقم المطورة (تطابق تام وليس جزئي)
        const isOwner = ALLOWED_DEVELOPERS.some(dev => senderNum === dev);
        if (!isOwner) {
            sock.sendMessage(chatId, { react: { text: '❌', key: message.key } }).catch(() => {});
            return await sock.sendMessage(chatId, {
                text: formatShort('عـذراً، هـذا الأمـر مـخـصـص لـرقم الـمـطـورة فـقـط! ⛔', '🚫'),
                contextInfo: buildChannelContext()
            }, { quoted: message });
        }

        sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } }).catch(() => {});

        try {
            const response = await fetch(`${CONFIG.API_BASE}/get-number?service=whatsapp`, {
                method: 'GET',
                headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }
            }).catch(() => null);

            if (!response || !response.ok) {
                return await sock.sendMessage(chatId, {
                    text: formatShort('فشل الاتصال بخدمة الأرقام الوهمية أو أن رابط الـ API غير متاح حالياً.', '❌'),
                    contextInfo: buildChannelContext()
                }, { quoted: message });
            }

            const data = await response.json().catch(() => null);
            if (!data || typeof data !== 'object') {
                return await sock.sendMessage(chatId, {
                    text: formatShort('استجابة خادم الأرقام غير صالحة أو تالفة.', '❌'),
                    contextInfo: buildChannelContext()
                }, { quoted: message });
            }
            
            // التحقق من بنية المخطط للبيانات المستلمة
            const phoneNumber = data.phone || data.number || data.data?.phone || '';
            const sessionToken = data.token || data.id || data.data?.token || '';

            if (!phoneNumber || !sessionToken || typeof phoneNumber !== 'string' || typeof sessionToken !== 'string') {
                return await sock.sendMessage(chatId, {
                    text: appendFooter(
                        `*🌐 ¦ نـظـام الأرقـام الـوهـمـيـة*\n\n` +
                        `- *الحالة:* استجابة الخادم لا تطابق مخطط الـ API المطلوب (phone/token مفقودين).`
                    ),
                    contextInfo: buildChannelContext()
                }, { quoted: message });
            }

            // حماية البيانات وتخزين الجلسة الدائمة (ملاحظة: لزيادة الأمان المتقدم يمكن تشفير token بـ AES هنا)
            const sessions = loadSessions();
            sessions[phoneNumber] = { token: sessionToken, chatId, createdAt: Date.now() };
            saveSessions(sessions);

            await sock.sendMessage(chatId, {
                text: appendFooter(
                    `*📱 ¦ تـم إسـتـخـراج الـرقم بـنـجـاح!*\n\n` +
                    `*• الـرقم:* \`+${phoneNumber}\`\n` +
                    `*• الحالة:* بانتظار استقبال كود التحقق (SMS)...\n\n` +
                    `_البوت يراقب الرسائل الواردة وسيوافيك بالكود فور وصوله تلقائياً._`
                ),
                contextInfo: buildChannelContext()
            }, { quoted: message });

            // بدء المراقبة النشطة للجلسة
            startPolling(sessionToken, phoneNumber, chatId, sock);

        } catch (error) {
            await sock.sendMessage(chatId, {
                text: formatShort('حدث خطأ غير متوقع أثناء تنفيذ عملية جلب الرقم الوهمي.', '❌'),
                contextInfo: buildChannelContext()
            }, { quoted: message });
        }
    }
};
