/**
 * @file src/lib/subbot-broadcast.js
 * @description وحدة مركزية لتوزيع وتنفيذ المهام والأوامر على جميع البوتات الفرعية النشطة بالتوازي في HINATA
 * ♢ •┆˹🪸╵ `𝙼𝙰𝙳𝙴 𝙱𝚈 𝚁𝙾𝙳𝚈`╷⇊˼
 */

/**
 * تنفيذ وظيفة معينة بالتوازي على جميع البوتات الفرعية النشطة والبوت الرئيسي
 * 
 * @param {Object} options خيارات التشغيل
 * @param {Object} options.mainSock كائن الـ socket للبوت الحالي/الرئيسي
 * @param {Object} options.subbotManager مدير البوتات الفرعية في النظام
 * @param {Function} options.taskWorker الدالة التنفيذية التي ستعمل على كل sock (تستقبل sock وترجع Promise)
 * @param {number} [options.concurrency=5] أقصى عدد لمهام التزامن في نفس الوقت
 * @param {number} [options.timeoutMs=8000] أقصى مهلة زمنية لكل بوت فرعي
 * @returns {Promise<Object>} تقرير مفصل بالنتائج (إجمالي، نجاح، فشل)
 */
export async function executeSubbotBroadcast({
    mainSock,
    subbotManager,
    taskWorker,
    concurrency = 5,
    timeoutMs = 8000
}) {
    const startTime = Date.now();
    const bots = [];
    const seenSocks = new WeakSet();

    // 1. إضافة البوت الحالي أو الرئيسي إذا كان صالحاً ومتاعباً
    if (mainSock && mainSock.user && mainSock.ws) {
        bots.push({
            id: mainSock.user.id || 'main-session',
            label: 'الـرئـيـسـي',
            sock: mainSock
        });
        seenSocks.add(mainSock);
    }

    // 2. جلب الجلسات الفرعية النشطة من مدير الجلسات بأمان تام
    if (subbotManager) {
        try {
            let activeSessions = [];
            if (typeof subbotManager.getActiveSessions === 'function') {
                activeSessions = await subbotManager.getActiveSessions();
            } else if (typeof subbotManager.getActiveSubBots === 'function') {
                activeSessions = subbotManager.getActiveSubBots();
            }

            for (const session of (activeSessions || [])) {
                const sessionSock = session.sock || session;
                if (!sessionSock || !sessionSock.user || !sessionSock.ws || seenSocks.has(sessionSock)) {
                    continue;
                }
                seenSocks.add(sessionSock);

                const sessionId = sessionSock.user.id || `sub-${Math.random().toString(36).slice(2, 8)}`;
                const sessionLabel = session.ownerNumber ? `فـرعـي (${session.ownerNumber})` : 'فـرعـي';
                
                bots.push({
                    id: sessionId,
                    label: sessionLabel,
                    sock: sessionSock
                });
            }
        } catch (err) {
            console.error('[Broadcast] خطأ أثناء جلب الجلسات الفرعية النشطة:', err.message);
        }
    }

    const totalBots = bots.length;
    if (totalBots === 0) {
        return {
            total: 0,
            success: 0,
            failed: 0,
            duration: 0,
            details: []
        };
    }

    // إعداد هيكل المهام مع معرّفات فرعية لمنع التداخل
    const tasks = bots.map((bot, index) => ({
        bot,
        index: index + 1
    }));

    const statsMap = new Map();
    bots.forEach(b => statsMap.set(b.id, { label: b.label, success: 0, failed: 0, error: null }));

    // دالة مهلة زمنية آمنة (Timeout Wrapper) لكل مهمة بوت فرعي
    const runWithTimeout = (promise, ms) => {
        let timer;
        const timeoutPromise = new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('انتهت مهلة التنفيذ')), ms);
        });
        return Promise.race([
            promise.finally(() => clearTimeout(timer)),
            timeoutPromise
        ]);
    };

    // نظام تشغيل المهام بالتزامن (Worker Pool)
    let nextIndex = 0;
    const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
        while (true) {
            const currentIndex = nextIndex++;
            if (currentIndex >= tasks.length) return;
            
            const { bot } = tasks[currentIndex];
            const botStat = statsMap.get(bot.id);

            try {
                // تنفيذ المهمة الأصلية الممررة مع وضع مهلة زمنية صارمة
                await runWithTimeout(taskWorker(bot.sock, bot), timeoutMs);
                botStat.success++;
            } catch (err) {
                botStat.failed++;
                botStat.error = err.message;
            }
        }
    });

    await Promise.all(workers);

    // تجميع النتائج النهائية
    let totalSuccess = 0;
    let totalFailed = 0;
    const details = [];

    for (const [id, stat] of statsMap.entries()) {
        totalSuccess += stat.success;
        totalFailed += stat.failed;
        details.push({
            id,
            label: stat.label,
            success: stat.success,
            failed: stat.failed,
            error: stat.error
        });
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    return {
        total: totalBots,
        success: totalSuccess,
        failed: totalFailed,
        duration,
        details
    };
}
