import { getMessageContextInfo } from './text.js';

const META_AI_BOT = '867051314767696';
const MAX_MENTIONS = 20;

function normalizeParticipant(jid) {
  if (typeof jid !== 'string') return null;

  const value = jid.trim().replace(/:\d+@/, '@');

  if (
    !value.endsWith('@s.whatsapp.net') &&
    !value.endsWith('@lid') &&
    !value.endsWith('@c.us')
  ) {
    return null;
  }

  return value;
}

export function registerMetaAICommands(commands) {
  commands.set('ميتا', {
    description: 'إنشاء مجموعة WhatsApp AI وإضافة Meta AI',
    requiresAdmin: true,
    reaction: '🤖',

    handler: async ctx => {
      const sock = ctx.sock;

      if (!ctx.jid?.endsWith('@g.us')) {
        await ctx.reply('⚠️ هذا الأمر يعمل داخل المجموعات فقط.');
        return;
      }

      if (
        typeof sock?.aiGroupCreate !== 'function' ||
        typeof sock?.aiGroupAddBot !== 'function'
      ) {
        await ctx.reply(
          '❌ ميزة مجموعات AI غير متاحة في اتصال هذا البوت.\n' +
          'تحقق من تشغيل الاتصال باستخدام toxic-baileys.'
        );
        return;
      }

      const contextInfo = getMessageContextInfo(
        ctx.message?.message
      );

      const rawMentions = Array.isArray(contextInfo?.mentionedJid)
        ? contextInfo.mentionedJid
        : [];

      const participants = [
        ...new Set(rawMentions.map(normalizeParticipant).filter(Boolean))
      ];

      if (participants.length > MAX_MENTIONS) {
        await ctx.reply(
          `⚠️ الحد الأقصى للأعضاء الذين يمكن اختيارهم هو ${MAX_MENTIONS}.`
        );
        return;
      }

      const subject = 'HINATA • Meta AI';

      await ctx.reply(
        '⏳ جارٍ إنشاء مجموعة الذكاء الاصطناعي وإضافة Meta AI...\n' +
        'قد تستغرق العملية بعض الوقت.'
      );

      let group;

      try {
        group = await sock.aiGroupCreate(
          subject,
          participants
        );
      } catch (error) {
        console.error('[HINATA META] Group creation failed:', error);

        await ctx.reply(
          '❌ لم يتم إنشاء مجموعة AI.\n' +
          'قد لا تكون الميزة متاحة لحساب واتساب أو إصدار الاتصال الحالي.\n' +
          `التفاصيل: ${String(error?.message || 'خطأ غير معروف').slice(0, 250)}`
        );
        return;
      }

      if (!group?.id) {
        await ctx.reply(
          '⚠️ لم يرجع واتساب معرّف المجموعة بعد الإنشاء، لذلك تعذر تأكيد العملية.'
        );
        return;
      }

      let added;

      try {
        added = await sock.aiGroupAddBot(
          group.id,
          META_AI_BOT
        );
      } catch (error) {
        console.error('[HINATA META] Adding Meta AI failed:', error);

        await ctx.reply(
          '⚠️ تم إنشاء مجموعة AI، لكن تعذرت إضافة Meta AI.\n' +
          `معرّف المجموعة: ${group.id}\n` +
          `التفاصيل: ${String(error?.message || 'خطأ غير معروف').slice(0, 250)}`
        );
        return;
      }

      const successful = Array.isArray(added) &&
        added.some(item => String(item?.status) === '200');

      if (!successful) {
        await ctx.reply(
          '⚠️ تم إنشاء مجموعة AI، لكن واتساب لم يؤكد إضافة Meta AI.\n' +
          `معرّف المجموعة: ${group.id}\n` +
          'قد تكون الميزة غير مفعلة لحسابك.'
        );
        return;
      }

      await ctx.reply(
        '✅ تم إنشاء مجموعة الذكاء الاصطناعي بنجاح!\n\n' +
        '🤖 Meta AI: تمت إضافة الحساب بنجاح.\n' +
        `👥 الأعضاء الذين اخترتهم: ${participants.length}\n` +
        `🆔 معرّف المجموعة: ${group.id}\n\n` +
        'يمكنك الآن استخدام المجموعة الجديدة.'
      );
    }
  });
}
