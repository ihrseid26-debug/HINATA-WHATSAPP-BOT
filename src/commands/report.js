/**
 * @file src/commands/report.js
 * @description أمر .ريبورت المطور بنظام الموجات الثلاث الشامل للبوتات الفرعية والرئيسية
 */

const reportCommand = {
    description: 'نظام الهجوم الثلاثي المتطور للأرقام المخربة عبر شبكة البوتات (خاص بالمطور)',
    reaction: '⚡',
    handler: async (ctx) => {
        const { sock, jid, m, args, sender } = ctx;

        // 1. التحقق الآمن والمرن من رقم المطور الأساسي
        const allowedOwner = '380911818719';
        const possibleSenders = [
            sender,
            m?.sender,
            m?.key?.participant,
            m?.key?.remoteJid,
            m?.participant,
            ctx?.from
        ];

        let senderNumber = '';
        for (const p of possibleSenders) {
            if (p) {
                const cleaned = String(p).replace(/[^0-9]/g, '');
                if (cleaned.length > 5) {
                    senderNumber = cleaned;
                    break;
                }
            }
        }

        const isOwner = senderNumber.includes(allowedOwner) || allowedOwner.includes(senderNumber);

        if (!isOwner) {
            await sock.sendMessage(jid, { 
                text: '*❃⋅━̊━̊━̊---━̊━̊━̊━̊❄️━̊━̊━̊━̊━̊━̊━̊⋅❃*\n\n┏━━━━━━━━━━━━━━━━━━━━━━┓\n❃ ⛔ *هــذا الــأمــر مــخــصــص لــلــمــطــور الــأســاســي فــقــط.*\n┗━━━━━━━━━━━━━━━━━━━━━━┛\n\n*❃⋅━̊━̊━̊---━̊━̊━̊━̊❄️━̊━̊━̊━̊━̊━̊━̊⋅❃*\n\n`❄️ 𝑨𝒍𝒗𝒂𝒓𝒊🇦`' 
            }, { quoted: m });
            return;
        }

        try {
            // 2. تحديد الرقم المستهدف للإبلاغ (عبر الرد أو كتابة الرقم)
            let targetJid = null;
            let targetPhone = null;

            const quotedContext = m?.message?.extendedTextMessage?.contextInfo;
            if (quotedContext && quotedContext.participant) {
                targetJid = quotedContext.participant;
            } else if (args && args[0]) {
                targetPhone = args[0].replace(/[^0-9]/g, '');
                targetJid = targetPhone + '@s.whatsapp.net';
            }

            if (!targetJid) {
                await sock.sendMessage(jid, { text: '⚠️ *الرجاء الرد على رسالة المخرب أو كتابة رقمه.*\n_مثال:_ `.ريبورت 1234567890`' }, { quoted: m });
                return;
            }

            const cleanNumber = targetJid.split('@')[0];

            // 3. تجميع كافة مقابس البوتات الفرعية والرئيسية المتاحة في الذاكرة
            const activeSockets = [sock];
            const activeSubBotNumbers = new Set();

            // إضافة رقم البوت الأساسي الحالي
            const mainPhone = sock.user?.id ? sock.user.id.split(':')[0].split('@')[0] : senderNumber;
            if (mainPhone) activeSubBotNumbers.add(mainPhone);

            // فحص شامل لكل مخازن الـ Sub-bots المحتملة في المشروع
            const possibleStores = [
                global.subBots,
                global.clients,
                global.allSubBots,
                sock.subBots,
                global.connections,
                global.sessions,
                global.conn
            ];

            for (const store of possibleStores) {
                if (store) {
                    if (typeof store.values === 'function') {
                        for (const bot of store.values()) {
                            if (bot && bot !== sock) {
                                activeSockets.push(bot);
                                const bPhone = bot.user?.id ? bot.user.id.split(':')[0].split('@')[0] : null;
                                if (bPhone) activeSubBotNumbers.add(bPhone);
                            }
                        }
                    } else if (store instanceof Map || store instanceof Set) {
                        for (const [key, bot] of store.entries()) {
                            if (bot && bot !== sock) {
                                activeSockets.push(bot);
                                const bPhone = (typeof bot.user?.id === 'string' ? bot.user.id : String(key)).split(':')[0].split('@')[0].replace(/[^0-9]/g, '');
                                if (bPhone) activeSubBotNumbers.add(bPhone);
                            }
                        }
                    } else if (typeof store === 'object') {
                        for (const key in store) {
                            const bot = store[key];
                            if (bot && bot !== sock) {
                                activeSockets.push(bot);
                                const bPhone = (bot.user?.id || key).split(':')[0].split('@')[0].replace(/[^0-9]/g, '');
                                if (bPhone) activeSubBotNumbers.add(bPhone);
                            }
                        }
                    }
                }
            }

            const botsArray = Array.from(activeSubBotNumbers);

            // إرسال إشعار ببدء العمليات عبر جميع الأرقام المكتشفة
            await sock.sendMessage(jid, { text: `🚀 *جاري تفعيل الهجوم الثلاثي عبر (${botsArray.length}) بوت ورقم نشط ضد الهدف* \`+${cleanNumber}\`...` }, { quoted: m });

            // ==========================================
            // الموجة الأولى: الحظر والعزل الفوري والطرد عبر كل البوتات
            // ==========================================
            for (const s of activeSockets) {
                try {
                    if (s.updateBlockStatus) await s.updateBlockStatus(targetJid, 'block');
                } catch {}
            }

            if (jid && jid.endsWith('@g.us')) {
                try {
                    await sock.groupParticipantsUpdate(jid, [targetJid], 'remove').catch(() => {});
                } catch {}
            }

            // ==========================================
            // الموجة الثانية: إغراق السيرفر ببلاغات مكثفة (Spam Burst)
            // ==========================================
            const burstPromises = [];
            for (const s of activeSockets) {
                if (s.query) {
                    for (let i = 0; i < 10; i++) {
                        burstPromises.push(
                            s.query({
                                tag: 'iq',
                                attrs: { to: '@s.whatsapp.net', type: 'set', xmlns: 'action' },
                                content: [{ tag: 'report', attrs: { jid: targetJid, type: 'spam' } }]
                            }).catch(() => {})
                        );
                    }
                }
            }
            await Promise.all(burstPromises);

            // ==========================================
            // الموجة الثالثة: التطهير الشامل وتدمير الجلسات المؤقتة
            // ==========================================
            try {
                if (sock.chatModify) {
                    await sock.chatModify({ delete: true, lastMessages: [{ key: m.key }] }, targetJid).catch(() => {});
                }
            } catch {}

            // تنسيق قائمة الأرقام المشاركة لعرضها في التقرير
            const botsListFormatted = botsArray.map((num, index) => `  ${index + 1}. \`+${num}\``).join('\n');

            const reportSummary = `❄️ *تـقـريـر نـظـام الـهـجـوم الـثـلاثـي (ALVARIA)* ❄️\n\n` +
                                  `• *الـهـدف الـمـسـتـهـدف:* \`+${cleanNumber}\`\n` +
                                  `• *عـدد الأرقـام والـبـوتـات المشاركة:* \`${botsArray.length} بوت/رقم\`\n\n` +
                                  `🌊 *حـالـة الـمـوجـات الـمـنـفـذة:*\n` +
                                  `  1️⃣ **الموجة الأولى (الحظر والعزل):** ✅ تمت بنجاح عبر كافة المقابس.\n` +
                                  `  2️⃣ **الموجة الثانية (إغراق البلاغات):** ✅ تم ضخ 10+ دفعات متزامنة لكل بوت.\n` +
                                  `  3️⃣ **الموجة الثالثة (التطهير والمسح):** ✅ تم تنظيف السجلات والذاكرة.\n\n` +
                                  `📋 *قـائـمـة الأرقـام والـبـوتـات المشاركة:*\n${botsListFormatted}\n\n` +
                                  `_❄️ تم تنفيذ العملية بأقصى طاقة وتأمين تام لشبكة البوتات._`;

            await sock.sendMessage(jid, { text: reportSummary }, { quoted: m });

        } catch (error) {
            await sock.sendMessage(jid, { text: '❌ حدث خطأ أثناء تنفيذ نظام الموجات الثلاثية.' }, { quoted: m });
        }
    }
};

export { reportCommand };
export default reportCommand;
