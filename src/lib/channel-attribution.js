import { formatHinataReply } from './text.js';

const CHANNEL_INFO = Object.freeze({
  id: '120363429055128940@newsletter',
  name: '『 ❄️ 𝑨𝒍𝒗𝒂𝒓𝒊𝒂 ❅↯⃝❃ 』',
  serverMessageId: 100
});

// Meta AI JID used for the clearly labelled demo quote.
const DEMO_STATUS_AUTHOR = '867051314767696@bot';

const DEMO_STATUS_TEXT =
  '❄️ Meta AI · معاينة\n\n' +
  '𝑴𝑨𝑫𝑬 𝑩𝒀 𝑨𝒍𝒗𝒂𝒓𝒊𝒂 ❅';

let demoStatusSequence = 0;

const installedSockets = new WeakSet();
const profileCache = new Map();
const PROFILE_CACHE_LIMIT = 500;

function getQuotedSender(options = {}) {
  const key = options?.quoted?.key;
  if (!key) return null;

  if (key.remoteJid?.endsWith('@g.us')) {
    return key.participant || key.participantAlt || null;
  }

  return key.participant || key.remoteJid || null;
}

async function getProfilePicture(sock, senderJid) {
  if (!senderJid || typeof sock.profilePictureUrl !== 'function') {
    return null;
  }

  const now = Date.now();
  const cached = profileCache.get(senderJid);

  if (cached && cached.expiresAt > now) {
    return cached.url;
  }

  try {
    const url = await sock.profilePictureUrl(senderJid, 'image');

    if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
      profileCache.set(senderJid, {
        url,
        expiresAt: now + 30 * 60 * 1000
      });

      if (profileCache.size > PROFILE_CACHE_LIMIT) {
        const firstKey = profileCache.keys().next().value;
        if (firstKey) profileCache.delete(firstKey);
      }

      return url;
    }
  } catch {}

  profileCache.set(senderJid, {
    url: null,
    expiresAt: now + 5 * 60 * 1000
  });

  return null;
}

function isSpecialMessage(content) {
  if (!content || typeof content !== 'object' || Array.isArray(content)) {
    return true;
  }

  return Boolean(
    content.raw ||
    content.react ||
    content.delete ||
    content.pin ||
    content.edit ||
    content.forward ||
    content.protocolMessage
  );
}

function hasDisplayableText(content) {
  return (
    typeof content.text === 'string' ||
    typeof content.caption === 'string'
  );
}

function createDemoStatusQuote() {
  demoStatusSequence = (demoStatusSequence + 1) % 1000000;

  return {
    key: {
      remoteJid: 'status@broadcast',
      fromMe: false,
      id: `FAKE_${Date.now()}_${demoStatusSequence}`,
      participant: DEMO_STATUS_AUTHOR
    },
    participant: DEMO_STATUS_AUTHOR,
    message: {
      conversation: DEMO_STATUS_TEXT
    }
  };
}

function createProfileCard(profileUrl, oldReply = {}) {
  return {
    ...oldReply,
    title: '❄️ 𝑨𝒍𝒗𝒂𝒓𝒊𝒂 ✅',
    body: '❅ مَـعَـكَ دَائِـمًـا • 𝑴𝑨𝑫𝑬 𝑩𝒀 𝑨𝒍𝒗𝒂𝒓𝒊𝒂',
    thumbnailUrl: oldReply.thumbnailUrl || profileUrl,
    showAdAttribution: oldReply.showAdAttribution ?? true
  };
}

export function installChannelAttribution(sock, logger = console) {
  if (!sock?.sendMessage || installedSockets.has(sock)) return;

  installedSockets.add(sock);

  const originalSendMessage = sock.sendMessage.bind(sock);

  sock.sendMessage = async (jid, content, options = {}) => {
    if (
      typeof jid !== 'string' ||
      isSpecialMessage(content)
    ) {
      return originalSendMessage(jid, content, options);
    }

    const clonedContent = { ...content };

    const hasMedia = Boolean(
      clonedContent.audio ||
      clonedContent.video ||
      clonedContent.image ||
      clonedContent.document ||
      clonedContent.sticker
    );

    const hasOtherVisibleContent = Boolean(
      clonedContent.location ||
      clonedContent.contacts ||
      clonedContent.contact ||
      clonedContent.poll ||
      clonedContent.pollCreationMessage
    );

    if (
      !hasDisplayableText(clonedContent) &&
      !hasMedia &&
      !hasOtherVisibleContent
    ) {
      return originalSendMessage(jid, content, options);
    }

    // تنسيق الرسائل النصية والوصفية.
    const formatOutgoingText = value => {
      if (typeof value !== 'string' || !value.trim()) return value;

      // رسائل ctx.reply منسقة مسبقًا؛ لا نكرر زخرفتها.
      if (
        value.includes('*❃⋅━̊━̊━̊---━̊━̊━̊━̊❄️━̊━̊━̊━̊━̊━̊━̊⋅❃*') ||
        value.includes('╭━━━━━━━〔 ❅ 𝑨𝒍𝒗𝒂𝒓𝒊𝒂 ❅ 〕━━━━━━━╮') ||
        value.includes('ـ')
      ) {
        return value;
      }

      return formatHinataReply(value);
    };

    if (typeof clonedContent.text === 'string') {
      clonedContent.text = formatOutgoingText(clonedContent.text);
    }

    if (typeof clonedContent.caption === 'string') {
      clonedContent.caption = formatOutgoingText(clonedContent.caption);
    }

    const contextInfo = { ...(clonedContent.contextInfo || {}) };

    // اختبار الرسائل دون بطاقة externalAdReply.
    // بقية بيانات ContextInfo محفوظة كما هي.
    delete contextInfo.externalAdReply;

    // اقتباس حالة تجريبية بدل اقتباس رسالة الأمر.
    const sendOptions = {
      ...options,
      backgroundColor: '#650014',
      quoted: createDemoStatusQuote()
    };

    // الاحتفاظ بنسبة الرسائل إلى قناة HINATA في المجموعات.
    if (
      (
        jid.endsWith('@g.us') ||
        clonedContent.audio ||
        clonedContent.video ||
        clonedContent.image
      ) &&
      !contextInfo.forwardedNewsletterMessageInfo
    ) {
      contextInfo.forwardingScore = Math.max(
        Number(contextInfo.forwardingScore) || 0,
        1
      );

      contextInfo.isForwarded = true;

      contextInfo.forwardedNewsletterMessageInfo = {
        newsletterJid: CHANNEL_INFO.id,
        newsletterName: CHANNEL_INFO.name,
        serverMessageId: CHANNEL_INFO.serverMessageId
      };
    }

    clonedContent.contextInfo = contextInfo;

    return originalSendMessage(jid, clonedContent, sendOptions);
  };

  logger.info?.(
    {
      newsletterJid: CHANNEL_INFO.id,
      demoStatusQuote: true,
      demoStatusAuthor: DEMO_STATUS_AUTHOR
    },
    'ALVARIA demo status quote and channel attribution installed'
  );
}
