import {
  extractSoundStickerInfo,
  installSoundStickerCodec,
  registerPendingSoundSticker,
  unwrapSoundStickerMessage,
} from './wire.js';

/**
 * Send a native WhatsApp sticker or sound sticker using an active Baileys 7.x socket
 * WITHOUT modifying any files inside `node_modules/@whiskeysockets/baileys`.
 */
export async function sendSoundSticker(sock, jid, options = {}) {
  if (!sock || typeof sock.relayMessage !== 'function' || typeof sock.waUploadToServer !== 'function') {
    throw new Error('A connected Baileys socket with relayMessage and waUploadToServer is required');
  }
  if (!jid) {
    throw new Error('Target WhatsApp JID is required');
  }

  const baileys = options.baileys || await import('@whiskeysockets/baileys');
  const { proto, generateWAMessage, prepareWAMessageMedia } = baileys;
  installSoundStickerCodec(proto);

  let media;
  if (options.webpBuffer) {
    media = {
      webpBuffer: options.webpBuffer,
      width: options.width || 512,
      height: options.height || 512,
      isAnimated: options.isAnimated ?? Boolean(options.audioBuffer),
      emojis: Array.isArray(options.emojis)
        ? options.emojis
        : options.emojis
          ? [String(options.emojis)]
          : [options.audioBuffer ? '🔊' : '✨'],
      audioBuffer: options.audioBuffer || null,
      audioSeconds: options.audioSeconds || null,
      audioMimetype: options.audioMimetype || (options.audioBuffer ? 'audio/ogg; codecs=opus' : null),
      soundSha256: options.soundSha256 || null,
      exifMeta: options.exifMeta || null,
    };
  } else {
    throw new Error('HINATA sound-sticker sender expects webpBuffer and audioBuffer');
  }

  const userJid = sock.authState?.creds?.me?.id || sock.user?.id;
  if (!userJid) {
    throw new Error('Baileys socket is missing authenticated userJid (authState.creds.me.id / user.id)');
  }

  const stickerContent = {
    sticker: media.webpBuffer,
    width: media.width,
    height: media.height,
    isAnimated: media.isAnimated,
    mimetype: 'image/webp',
    ...(options.mentions?.length ? { mentions: options.mentions } : {}),
  };

  let audioMsg = null;
  let audioBytes = null;
  if (media.audioBuffer) {
    const audioPrepared = await prepareWAMessageMedia({
      audio: media.audioBuffer,
      mimetype: media.audioMimetype || 'audio/ogg; codecs=opus',
      ptt: false,
      ...(media.audioSeconds != null ? { seconds: media.audioSeconds } : {}),
    }, {
      upload: sock.waUploadToServer,
      logger: options.logger || sock.logger,
      jid,
      mediaUploadTimeoutMs: options.mediaUploadTimeoutMs,
    });
    audioMsg = audioPrepared.audioMessage;
    audioBytes = proto.Message.AudioMessage.encode(audioMsg).finish();
  }

  const fullMsg = await generateWAMessage(jid, stickerContent, {
    userJid,
    upload: sock.waUploadToServer,
    logger: options.logger || sock.logger,
    quoted: options.quoted,
    ephemeralExpiration: options.ephemeralExpiration,
    mediaUploadTimeoutMs: options.mediaUploadTimeoutMs,
  });

  if (fullMsg.message?.stickerMessage) {
    fullMsg.message.stickerMessage.stickerSentTs = Date.now();

    if (audioMsg) {
      fullMsg.message.stickerMessage.audioMessage = audioMsg;
      fullMsg.message.stickerMessage.premium = options.premium ?? 0;
      fullMsg.message.stickerMessage.emojis = media.emojis.join('');
    }

    if (audioBytes) {
      registerPendingSoundSticker(fullMsg.message.stickerMessage, {
        audioBytes,
        premium: options.premium ?? 0,
        emojis: media.emojis.join(''),
      });
    }
  }

  await sock.relayMessage(jid, fullMsg.message, {
    messageId: fullMsg.key.id,
    useCachedGroupMetadata: options.useCachedGroupMetadata,
    statusJidList: options.statusJidList,
  });

  return {
    messageId: fullMsg.key.id,
    fullMsg,
    hasAudio: Boolean(audioBytes),
    isAnimated: media.isAnimated,
    width: media.width,
    height: media.height,
    webpBytes: media.webpBuffer.length,
    audioBytes: media.audioBuffer?.length || 0,
    audioSeconds: media.audioSeconds || 0,
    soundSha256: media.soundSha256 || null,
  };
}

/**
 * Download both the WebP sticker and (if present) the embedded Ogg/Opus audio
 * from an inbound `audioStickerMessage` or `stickerMessage`.
 */
export async function downloadSoundSticker(msg, options = {}, ctx = undefined) {
  const baileys = options.baileys || await import('@whiskeysockets/baileys');
  const { proto, downloadMediaMessage } = baileys;
  installSoundStickerCodec(proto);

  const info = extractSoundStickerInfo(msg);
  if (!info) {
    throw new Error('Message does not contain a sticker');
  }

  const stickerBuffer = await downloadMediaMessage(
    { key: msg.key, message: { stickerMessage: info.stickerMessage } },
    'buffer',
    options.downloadOptions || {},
    ctx,
  );

  let audioBuffer = null;
  if (info.hasAudio) {
    audioBuffer = await downloadMediaMessage(
      { key: msg.key, message: { audioMessage: info.audioMessage } },
      'buffer',
      options.downloadOptions || {},
      ctx,
    );
  }

  return {
    stickerBuffer,
    audioBuffer,
    emojis: info.emojis,
    isAnimated: info.isAnimated,
    audioSeconds: info.audioSeconds,
    audioMimetype: info.audioMimetype,
    stickerMessage: info.stickerMessage,
    audioMessage: info.audioMessage,
    unwrappedMessage: unwrapSoundStickerMessage(msg.message || msg),
  };
}
