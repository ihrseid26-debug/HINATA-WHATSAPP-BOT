function getPhoneNumber(ctx) {
  const raw = typeof ctx.text === 'string'
    ? ctx.text.trim()
    : '';

  if (!raw || !/^\+?[\d\s().-]+$/.test(raw)) {
    return null;
  }

  const number = raw.replace(/\D/g, '');

  return /^\d{8,15}$/.test(number) ? number : null;
}

export function registerAccountBlockingCommands(commands) {
  commands.set('حظر_موحد', {
    description: 'حظر رقم من جميع البوتات الفرعية',
    reaction: '🚫',

    handler: async ctx => {
      if (!ctx.subbotSessionId) {
        return ctx.reply('⛔ هذا الأمر متاح من البوتات الفرعية فقط.');
      }

      const number = getPhoneNumber(ctx);

      if (!number) {
        return ctx.reply(
          '⚠️ أرسل رقماً واحداً مع مفتاح الدولة.\n\n' +
          'مثال:\n.حظر_موحد 2126XXXXXXXX'
        );
      }

      if (typeof ctx.subbotManager?.blockAll !== 'function') {
        return ctx.reply(
          '❌ خدمة الحظر الموحد غير جاهزة. أعد تشغيل ALVARIA.'
        );
      }

      await ctx.reply(
        '⏳ بدأ تنفيذ طلب الحظر الموحد.\n' +
        `📱 الرقم: ${number}\n` +
        '🌸 تتم معالجة حسابات البوتات الفرعية على دفعات...'
      );

      try {
        const result = await ctx.subbotManager.blockAll(number);

        return ctx.reply(
          '╭━━〔 🚫 ALVARIA BLOCK 〕━━╮\n' +
          `📱 الرقم: ${number}\n` +
          `✅ أُرسلت طلبات الحظر: ${result.blocked}\n` +
          `ℹ️ محظور مسبقاً: ${result.already}\n` +
          `⏳ بانتظار اتصال البوت: ${result.queued}\n` +
          `⚠️ تعذّر الحظر: ${result.failed}\n` +
          `🛡️ تم تخطي حسابات الرقم نفسه: ${result.selfSkipped}\n` +
          '╰━━━━━━━━━━━━━━━━╯\n\n' +
          '🏷️ العلامة في سجل ALVARIA: 🚫 مبند\n' +
          'ملاحظة: الحسابات غير المتصلة ستُعالج عند عودتها للاتصال.'
        );
      } catch (error) {
        console.error('[ALVARIA UNIFIED BLOCK]', error);

        return ctx.reply(
          '❌ حدث خطأ أثناء تنفيذ الحظر الموحد.\n' +
          'لم يتم تأكيد نجاح جميع الحسابات.'
        );
      }
    }
  });
}
