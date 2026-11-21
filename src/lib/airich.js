import { AIRich, Toolkit } from '@kaels/casileys';

function ensureToolkitCompatibility() {
  if (typeof Toolkit.stringifyEscaped === 'function') return;

  Toolkit.stringifyEscaped = (value) => JSON.stringify(value).replace(
    /[<>&\u2028\u2029]/g,
    (char) => ({
      '<': '\\u003c',
      '>': '\\u003e',
      '&': '\\u0026',
      '\u2028': '\\u2028',
      '\u2029': '\\u2029'
    })[char]
  );
}

export function registerAIRichCommands(commands) {
  if (!(commands instanceof Map)) {
    throw new TypeError('AIRich commands registry must be a Map');
  }

  if (commands.has('واجهة')) {
    throw new Error('Command واجهة already exists; refusing to overwrite it');
  }

  const airichTestCommand = {
    description: 'إرسال رسالة بتنسيق AIRich',
    reaction: '✨',

    handler: async (ctx) => {
      ensureToolkitCompatibility();

      const rich = new AIRich(ctx.sock, {
        dynamic: false,
        unsupportedTypeAlert: false
      });

      rich.addHeading('🌸 ALVARIA • التجربة الأولى');
      rich.addText('أهلًا بك! هذه أول تجربة لتصميم الرسائل المتطورة في ALVARIA.');
      rich.addTip('نختبر الآن تنسيق Rich Response ومدى توافقه مع WhatsApp.');

      const built = await rich.build(ctx.jid, {
        forwarded: false,
        notification: false,
        includesUnifiedResponse: true,
        includesSubmessages: true
      });

      if (!built?.message || !built?.key?.id) {
        throw new Error('AIRich did not return a valid WhatsApp message');
      }

      const richResponse =
        built.message?.botForwardedMessage?.message?.richResponseMessage;

      if (
        !richResponse ||
        typeof richResponse.unifiedResponse?.data !== 'string' ||
        !richResponse.unifiedResponse.data
      ) {
        throw new Error('AIRich unified response data was not generated');
      }

      // إزالة بيانات التوثيق العشوائية التي تولدها المكتبة.
      const botMetadata = built.message?.messageContextInfo?.botMetadata;

      if (botMetadata && Object.hasOwn(botMetadata, 'verificationMetadata')) {
        delete botMetadata.verificationMetadata;
      }

      const targetJid = built.key.remoteJid || ctx.jid;

      await ctx.sock.relayMessage(targetJid, built.message, {
        messageId: built.key.id
      });
    }
  };

  commands.set('واجهة', airichTestCommand);
  commands.set('تجربه', airichTestCommand);
}
