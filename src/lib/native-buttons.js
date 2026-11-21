import * as baileys from '@whiskeysockets/baileys';
import { randomBytes } from 'node:crypto';

function getBaileysExport(name) {
  return (
    baileys[name] ||
    baileys.Utils?.[name] ||
    baileys.WABinary?.[name] ||
    baileys.default?.[name]
  );
}

export function verifyNativeButtonsSupport() {
  const generator = getBaileysExport('generateWAMessageFromContent');

  if (typeof generator !== 'function') {
    throw new Error('Baileys لا يصدّر generateWAMessageFromContent');
  }

  return {
    generateWAMessageFromContent: 'OK',
    generateMessageIDV2:
      typeof getBaileysExport('generateMessageIDV2') === 'function'
        ? 'OK'
        : 'Fallback'
  };
}

export async function sendHinataNativeButtons(
  sock,
  jid,
  {
    text,
    title = '❄️ 𝑨𝒍𝒗𝒂𝒓𝒊𝒂',
    footer = '`❄️ 𝑨𝒍𝒗𝒂𝒓𝒊𝒂`',
    buttons = [],
    mentions = [],
    imageUrl = null,
    imageBuffer = null
  }
) {
  if (!sock || typeof sock.relayMessage !== 'function') {
    throw new Error('Baileys relayMessage غير متاح');
  }

  if (!Array.isArray(buttons) || buttons.length < 1 || buttons.length > 10) {
    throw new Error('عدد الأزرار غير صالح');
  }

  const generateWAMessageFromContent =
    getBaileysExport('generateWAMessageFromContent');

  const generateMessageIDV2 =
    getBaileysExport('generateMessageIDV2') ||
    getBaileysExport('generateMessageID');

  if (typeof generateWAMessageFromContent !== 'function') {
    throw new Error('تعذر تحميل مولّد رسائل Baileys');
  }

  const userJid =
    sock.user?.id ||
    sock.authState?.creds?.me?.id;

  if (!userJid) {
    throw new Error('لم يتم العثور على هوية جلسة ALVARIA');
  }

  let messageId = '';

  try {
    if (typeof generateMessageIDV2 === 'function') {
      messageId = generateMessageIDV2(userJid);
    }
  } catch {}

  if (!messageId) {
    messageId = '3EB0' + randomBytes(8).toString('hex').toUpperCase();
  }

  const nativeButtons = buttons.map(button => {
    if (button?.type === 'cta_copy') {
      if (!button.text || !button.code) {
        throw new Error('بيانات زر نسخ الكود غير صالحة');
      }

      return {
        name: 'cta_copy',
        buttonParamsJson: JSON.stringify({
          display_text: Array.from(String(button.text)).slice(0, 24).join(''),
          copy_code: String(button.code)
        })
      };
    }
    if (button?.type === 'single_select') {
      if (!button.title || !Array.isArray(button.sections)) {
        throw new Error('بيانات قائمة الاختيار غير صالحة');
      }

      return {
        name: 'single_select',
        buttonParamsJson: JSON.stringify({
          title: String(button.title).slice(0, 24),
          sections: button.sections
        })
      };
    }

    if (!button?.id || !button?.text) {
      throw new Error('زر بدون اسم أو معرّف');
    }

    return {
      name: 'quick_reply',
      buttonParamsJson: JSON.stringify({
        display_text: String(button.text).slice(0, 24),
        id: String(button.id)
      })
    };
  });

  // تجهيز صورة رأس الرسالة التفاعلية
  let mediaHeader = {};

  let imageInput = imageBuffer;

  if (!imageInput && imageUrl) {
    imageInput = { url: imageUrl };
  }

  if (imageInput) {
    const prepareWAMessageMedia =
      getBaileysExport('prepareWAMessageMedia');

    if (typeof prepareWAMessageMedia !== 'function') {
      throw new Error('Baileys لا يوفّر prepareWAMessageMedia');
    }

    if (typeof sock.waUploadToServer !== 'function') {
      throw new Error('رفع الصور غير متاح في اتصال واتساب');
    }

    const prepared = await prepareWAMessageMedia(
      { image: imageInput },
      { upload: sock.waUploadToServer.bind(sock) }
    );

    if (!prepared?.imageMessage) {
      throw new Error('تعذر تجهيز صورة رأس القائمة');
    }

    mediaHeader = {
      hasMediaAttachment: true,
      imageMessage: prepared.imageMessage
    };
  }

  const interactiveMessage = {
    header: {
      title: String(title),
      hasMediaAttachment: Boolean(mediaHeader.hasMediaAttachment),
      ...(mediaHeader.imageMessage
        ? { imageMessage: mediaHeader.imageMessage }
        : {})
    },
    body: {
      text: String(text)
    },
    footer: {
      text: String(footer)
    },
    nativeFlowMessage: {
      buttons: nativeButtons
    }
  };

  if (Array.isArray(mentions) && mentions.length) {
    interactiveMessage.contextInfo = {
      mentionedJid: mentions.filter(
        value => typeof value === 'string' && value.includes('@')
      )
    };
  }

  const messageOptions = {
    userJid,
    messageId,
    timestamp: new Date()
  };

  if (sock.logger) {
    messageOptions.logger = sock.logger;
  }

  const fullMessage = await generateWAMessageFromContent(
    jid,
    { interactiveMessage },
    messageOptions
  );

  if (!fullMessage?.message || !fullMessage?.key?.id) {
    throw new Error('فشل تكوين رسالة الأزرار');
  }

  // رسائل cta_copy تُرسل مباشرة دون تغليفها كمستند.
  // بقية أزرار HINATA تحتفظ ببنية الإرسال القديمة.
  const isCopyCodeButton = buttons.some(
    button => button?.type === 'cta_copy'
  );

  const wireMessage = isCopyCodeButton
    ? fullMessage.message
    : {
        documentWithCaptionMessage: {
          message: {
            ...fullMessage.message
          }
        }
      };

  const additionalNodes = [
    {
      tag: 'biz',
      attrs: {},
      content: [
        {
          tag: 'interactive',
          attrs: {
            type: 'native_flow',
            v: '1'
          },
          content: [
            {
              tag: 'native_flow',
              attrs: {
                v: '9',
                name: 'mixed'
              }
            }
          ]
        }
      ]
    }
  ];

  if (!String(jid).endsWith('@g.us')) {
    additionalNodes.push({
      tag: 'bot',
      attrs: {
        biz_bot: '1'
      }
    });
  }

  await sock.relayMessage(jid, wireMessage, {
    messageId: fullMessage.key.id,
    additionalNodes
  });

  return fullMessage;
}
