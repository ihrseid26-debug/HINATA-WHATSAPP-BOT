/**
 * @file src/commands/debug_subs.js
 * @description أمر تشخيصي لمعرفة مكان تخزين البوتات الفرعية في الذاكرة
 */

export default {
    name: 'فحص_الفرعية',
    command: ['فحص_الفرعية', 'debugsubs'],
    category: 'owner',
    ownerOnly: true,
    description: 'تشخيص البوتات الفرعية وكيفية تخزينها',

    async handler(ctx) {
        const { sock, message, subbotManager } = ctx;
        const chatId = ctx.jid || message?.key?.remoteJid;

        console.log('====== [DEBUG SUBS START] ======');
        console.log('subbotManager exists:', !!subbotManager);
        if (subbotManager) {
            console.log('subbotManager keys/properties:', Object.keys(subbotManager));
            console.log('subbotManager prototype methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(subbotManager)));
            
            // محاولة فحص الخصائص الداخلية المحتملة
            if (subbotManager.sessions) console.log('subbotManager.sessions type:', typeof subbotManager.sessions);
            if (subbotManager.subbots) console.log('subbotManager.subbots type:', typeof subbotManager.subbots);
        }
        console.log('====== [DEBUG SUBS END] ======');

        if (sock?.sendMessage && chatId) {
            await sock.sendMessage(chatId, { text: '✅ تم طباعة معلومات التشخيص في الونسول (Termux). راقب الشاشة هناك!' }, { quoted: message });
        }
    }
};
