/**
 * @file src/lib/contact-viewer.js
 * @description استخراج الرقم الحقيقي حتى لو كان الحساب بـ LID أو Username عبر فحص الذاكرة والـ Store
 * ♢ •┆˹🪸╵ `𝙼𝙰𝙳𝙴 𝙱𝚈 𝚁𝙾𝙳Y`╷⇊˼
 */

import { jidNormalizedUser } from '@whiskeysockets/baileys';

const CHANNEL_ID = '120363427347904077@newsletter';
const BOT_NAME = '𝑨𝑼𝑹𝑬𝑳𝑰𝑨 𝐁𝐎𝐓';
const FOOTER = `* *♢ •┆˹🪸\u25f5 \`𝙼𝙰ْدِے ʙʏ ʀوْدْʏ\`╷⇊˼*`;

function appendFooter(text) {
    return `${text}\n\n${FOOTER}`;
}

const buildChannelContext = () => ({
    forwardingScore: 999,
    isForwarded: true,
    forwardedNewsletterMessageInfo: {
        newsletterJid: CHANNEL_ID,
        newsletterName: BOT_NAME,
        serverMessageId: -1,
    },
});

export async function handleShowContact(ctx) {
    const { sock, message, jid, senderJid } = ctx;
    const chatId = jid || message?.key?.remoteJid;
    if (!chatId || !message) return;

    try {
        let targetJid = null;
        let displayName = 'غير معروف';
        let phone = 'غير مستخرج';

        const botNumber = sock.user?.id ? sock.user.id.split('@')[0].split(':')[0] : '';
        const isGroup = chatId.endsWith('@g.us');

        const msgContent = message.message;
        const contextInfo = 
            msgContent?.extendedTextMessage?.contextInfo || 
            msgContent?.imageMessage?.contextInfo || 
            msgContent?.videoMessage?.contextInfo || 
            msgContent?.documentMessage?.contextInfo ||
            msgContent?.contactMessage?.contextInfo;

        const quotedMessage = contextInfo?.quotedMessage;
        const quotedParticipant = contextInfo?.participant;

        const contactMsg = msgContent?.contactMessage || quotedMessage?.contactMessage;
        const contactsArrayMsg = msgContent?.contactsArrayMessage?.contacts || quotedMessage?.contactsArrayMessage?.contacts;

        let vcardText = '';
        if (contactMsg) {
            displayName = contactMsg.displayName || 'بطاقة اتصال';
            vcardText = contactMsg.vcard || '';
            if (contactMsg.phoneNumber) {
                phone = String(contactMsg.phoneNumber).replace(/[^\d]/g, '');
            }
        } else if (contactsArrayMsg && contactsArrayMsg.length > 0) {
            displayName = contactsArrayMsg[0].displayName || 'قائمة جهات اتصال';
            vcardText = contactsArrayMsg[0].vcard || '';
            if (contactsArrayMsg[0].phoneNumber) {
                phone = String(contactsArrayMsg[0].phoneNumber).replace(/[^\d]/g, '');
            }
        }

        // 1. في الدردشة الخاصة (Private Chat)
        if (!isGroup && !contactMsg && !quotedMessage) {
            targetJid = jidNormalizedUser(senderJid || chatId);
            const directNum = targetJid.split('@')[0].split(':')[0];
            if (directNum && directNum !== botNumber && directNum.length >= 7 && directNum.length <= 15 && !targetJid.includes('@lid')) {
                phone = directNum;
                displayName = message.pushName || 'مستخدم خاص';
            }
        }

        // 2. تحليل vCard
        if (vcardText && (phone === 'غير مستخرج' || !phone)) {
            const waidMatch = vcardText.match(/waid=(\d{7,15})/i);
            if (waidMatch) {
                phone = waidMatch[1];
            } else {
                const telMatches = [...vcardText.matchAll(/TEL[^:]*:(?:tel:)?([+\d\s()-]+)/gi)];
                for (const match of telMatches) {
                    const cleaned = match[1].replace(/[^\d]/g, '');
                    if (cleaned.length >= 7 && cleaned.length <= 15) {
                        phone = cleaned;
                        break;
                    }
                }
            }
        }

        // 3. فحص الـ quotedParticipant والتعامل مع الـ LID والبحث في الـ Store
        if ((phone === 'غير مستخرج' || !phone) && quotedParticipant) {
            targetJid = jidNormalizedUser(quotedParticipant);
        } else if (!isGroup && phone === 'غير مستخرج') {
            targetJid = jidNormalizedUser(chatId);
        }

        // محاولة فك شفرة الـ LID عبر lidMapping أو البحث في مخزن البوت
        if (targetJid && targetJid.includes('@lid')) {
            try {
                const mapping = sock.signalRepository?.lidMapping;
                if (mapping && typeof mapping.getPNForLID === 'function') {
                    const resolvedPN = await mapping.getPNForLID(targetJid);
                    if (resolvedPN) {
                        const normPN = resolvedPN.split('@')[0].split(':')[0].replace(/[^\d]/g, '');
                        if (normPN.length >= 7 && normPN.length <= 15 && normPN !== botNumber) {
                            phone = normPN;
                            targetJid = `${phone}@s.whatsapp.net`;
                        }
                    }
                }

                // إذا فشل الـ mapping، نبحث في الـ store إن وجد (contacts / chats)
                if (phone === 'غير مستخرج' && sock.store) {
                    const contact = sock.store.contacts?.[targetJid];
                    if (contact && contact.id) {
                        const storeNum = contact.id.split('@')[0].split(':')[0];
                        if (storeNum.length >= 7 && storeNum.length <= 15) {
                            phone = storeNum;
                            targetJid = `${phone}@s.whatsapp.net`;
                        }
                    }
                }
            } catch (e) {
                console.error('[ContactViewer] خطأ في مطابقة LID:', e.message);
            }
        }

        // التحقق النهائي من الرقم
        if (phone !== 'غير مستخرج') {
            const pureDigits = phone.replace(/[^\d]/g, '');
            if (pureDigits.length < 7 || pureDigits.length > 15 || pureDigits === botNumber) {
                phone = 'غير مستخرج';
            } else {
                phone = pureDigits;
                targetJid = `${phone}@s.whatsapp.net`;
            }
        }

        const displayJid = targetJid || quotedParticipant || chatId;
        const isHiddenOrUser = phone === 'غير مستخرج';

        const responseText = appendFooter(
`*🔍 [ مـعـلـومـات جـهـة الـاتـصـال ] 🔍*
*˚.𖦹 ⋅━ׄ━ׄ━ׄ━ׄ┄ׅ━ׄ ˹🪷˼‏ ━ׄ┄ׅ━ׄ━ׄ━ׄ━ׄ⋅ 𖦹.˚*

*🝮 الاسـم ˼‏👤˹ ⇣*
* *•「 ${displayName} 」•*

*🝮 رقـم الـهـاتـف ˼‏📞˹ ⇣*
* *•「 ${!isHiddenOrUser ? '+' + phone : 'محمي أو مسجل بيوزر (رقم مخفي)'} 」•*

*🝮 مـعـرف الـحـسـاب (JID) ˼‏🆔˹ ⇣*
* *•「 ${displayJid} 」•*

*˚.𖦹 ⋅━ׄ━ׄ━ׄ━ׄ┄ׅ━ׄ ˹🪷˼‏ ━ׄ┄ׅ━ׄ━ׄ━ׄ━ׄ⋅ 𖦹.˚*`
        );

        if (sock?.sendMessage) {
            await sock.sendMessage(chatId, { react: { text: '👁️', key: message.key } }).catch(() => {});
            await sock.sendMessage(chatId, {
                text: responseText,
                contextInfo: buildChannelContext()
            }, { quoted: message });
        }

    } catch (err) {
        console.error('[ContactViewer Error]:', err);
        if (sock?.sendMessage) {
            await sock.sendMessage(chatId, { text: '❌ حدث خطأ أثناء استخراج معلومات جهة الاتصال.' }, { quoted: message });
        }
    }
}

export function registerContactViewerCommands(commands) {
    commands.set('شاهد', {
        name: 'شاهد',
        command: ['شاهد', 'contact', 'معلومات'],
        description: 'عرض معلومات ورقم جهة الاتصال',
        reaction: '👁️',
        handler: handleShowContact
    });
}
