const API = 'https://api.telegram.org';

const DECORATION =
  '❃⋅━̊━̊━̊---━̊━̊━̊━̊❄️━̊━̊━̊━̊━̊━̊━̊⋅❃';

const FOOTER = '❄️ 𝑨𝒍𝒗𝒂𝒓𝒊𝒂';

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function startTelegramInstaller({ subbotManager, logger }) {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();

  if (!token) {
    logger.warn('Telegram installer disabled: missing token.');
    return;
  }

  let offset = 0;
  let globalLastRequest = 0;
  const lastRequests = new Map();

  async function telegram(method, body = {}) {
    const response = await fetch(`${API}/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(40000)
    });

    const data = await response.json();

    if (!data.ok) {
      throw new Error(data.description || 'Telegram API error');
    }

    return data.result;
  }

  async function send(chatId, text) {
    return telegram('sendMessage', {
      chat_id: chatId,
      text,
      disable_web_page_preview: true
    });
  }

  function decorated(title, content) {
    return (
      `${DECORATION}\n\n` +
      `${title}\n\n` +
      `${content}\n\n` +
      `${DECORATION}\n\n` +
      FOOTER
    );
  }

  async function sendPairingMessage(chatId, phone, code) {
    const safeCode = escapeHtml(code);

    const message =
      `${DECORATION}\n\n` +
      `🌸 <b>HINATA SUBBOT SYSTEM</b>\n\n` +
      `🎉 تم إنشاء جلسة واتساب بنجاح!\n` +
      `📱 الرقم: <code>${escapeHtml(phone)}</code>\n\n` +
      `🔐 <b>رمز الربط الخاص بك:</b>\n\n` +
      `📋 <code>${safeCode}</code>\n\n` +
      `${DECORATION}\n\n` +
      `${FOOTER}`;

    const keyboard = {
      inline_keyboard: [
        [
          {
            text: '📋 نسخ رمز الربط',
            copy_text: {
              text: String(code)
            }
          }
        ]
      ]
    };

    try {
      return await telegram('sendMessage', {
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
        reply_markup: keyboard,
        disable_web_page_preview: true
      });
    } catch (error) {
      logger.warn(
        { message: error.message },
        'Telegram copy button unavailable; sending code without button.'
      );

      // بديل للأجهزة أو إصدارات تيليجرام التي لا تدعم زر النسخ.
      return telegram('sendMessage', {
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      });
    }
  }

  async function handleMessage(message) {
    if (!message?.text || message.chat?.type !== 'private') return;

    const chatId = String(message.chat.id);
    const senderId = String(message.from?.id || '');
    const text = message.text.trim();

    if (text === '/start') {
      await send(
        chatId,
        decorated(
          '🌸 HINATA SUBBOT INSTALLER',
          '✨ أهلاً بك في نظام تنصيب واتساب الفرعي!\n\n' +
          '📌 لإنشاء بوت واتساب فرعي أرسل:\n\n' +
          '/tansib 212XXXXXXXXX\n\n' +
          '🌍 اكتب مفتاح الدولة مع رقم الهاتف.\n' +
          '🔢 أرقام فقط دون مسافات أو علامات.'
        )
      );
      return;
    }

    if (!/^\/tansib(?:@\w+)?(?:\s|$)/i.test(text)) return;

    const match = text.match(
      /^\/tansib(?:@\w+)?\s+(\d{8,15})$/i
    );

    if (!match) {
      await send(
        chatId,
        decorated(
          '⚠️ طريقة الاستخدام',
          '❌ صيغة الرقم غير صحيحة.\n\n' +
          'انسخ المثال وعدّل الرقم:\n\n' +
          '/tansib 212XXXXXXXXX\n\n' +
          '🌍 مفتاح الدولة + رقم الهاتف.'
        )
      );
      return;
    }

    const phone = match[1];
    const now = Date.now();
    const previous = lastRequests.get(senderId) || 0;

    if (now - previous < 120000) {
      await send(
        chatId,
        decorated(
          '⏳ انتظر قليلاً',
          'يمكنك طلب تنصيب جديد بعد مرور دقيقتين.'
        )
      );
      return;
    }

    if (now - globalLastRequest < 15000) {
      await send(
        chatId,
        decorated(
          '⏳ النظام مشغول',
          'هناك طلب تنصيب آخر قيد المعالجة. حاول بعد قليل.'
        )
      );
      return;
    }

    lastRequests.set(senderId, now);
    globalLastRequest = now;

    await send(
      chatId,
      decorated(
        '⏳ HINATA INSTALLER',
        `جاري إنشاء جلسة واتساب...\n\n📱 الرقم: ${phone}\n\nيرجى الانتظار.`
      )
    );

    try {
      const result = await subbotManager.create(phone, {
        ownerJid: `${phone}@s.whatsapp.net`
      });

      if (!result?.code) {
        await send(
          chatId,
          decorated(
            '⚠️ تعذر إصدار الرمز',
            `الحالة: ${result?.status || 'غير معروفة'}\n\nحاول لاحقاً.`
          )
        );
        return;
      }

      // الرمز يظهر داخل الرسالة نفسها، مع زر نسخ مباشر.
      await sendPairingMessage(chatId, phone, result.code);

      await send(
        chatId,
        decorated(
          '✨ طريقة ربط واتساب',
          '1️⃣ افتح واتساب في الهاتف صاحب الرقم.\n' +
          '2️⃣ ادخل إلى الأجهزة المرتبطة.\n' +
          '3️⃣ اختر ربط جهاز.\n' +
          '4️⃣ اختر الربط باستخدام رقم الهاتف.\n' +
          '5️⃣ أدخل رمز الربط الموجود في الرسالة السابقة.\n\n' +
          '⚠️ لا تشارك رمز الربط مع أي شخص.'
        )
      );
    } catch (error) {
      lastRequests.delete(senderId);

      logger.error(
        { err: error, phone },
        'Telegram subbot installation failed'
      );

      await send(
        chatId,
        decorated(
          '❌ فشل التنصيب',
          'تعذر إنشاء جلسة واتساب حالياً.\n' +
          'تحقق من الرقم واتصال HINATA وحاول لاحقاً.'
        )
      );
    }
  }

  async function poll() {
    while (true) {
      try {
        const updates = await telegram('getUpdates', {
          offset,
          timeout: 25,
          allowed_updates: ['message']
        });

        for (const update of updates) {
          offset = update.update_id + 1;

          try {
            await handleMessage(update.message);
          } catch (error) {
            logger.warn(
              { err: error },
              'Telegram installer message failed'
            );
          }
        }
      } catch (error) {
        logger.warn(
          { message: error.message },
          'Telegram installer polling error'
        );

        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }

  void poll();

  logger.info('HINATA Telegram installer started.');
}
