import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';

const storageDir = path.join(
  os.homedir(),
  'HINATA-SUBBOTS',
  'HINATA-EVOLUTION',
  'storage',
  'shared'
);

const dataFile = path.join(storageDir, 'language-patterns.json');

const MAX_WORDS = 1000;
const MAX_TOKENS_PER_MESSAGE = 15;
const MAX_COUNT = 1000000;

const STOP_WORDS = new Set([
  'من','في','على','الى','إلى','عن','مع','هذا','هذه','ذلك','تلك',
  'انا','أنا','انت','أنت','هو','هي','هم','نحن','كان','كانت',
  'يكون','تكون','ما','لا','لم','لن','قد','كل','ثم','او','أو',
  'و','ف','ب','ل','الذي','التي','الذين','اذا','إذا','أن','إن',
  'هل','كم','يا','بين','بعد','قبل','عند','حتى','كيف','ماذا',
  'the','a','an','is','are','was','were','to','of','in','on',
  'for','and','or','but','i','you','he','she','it','we','they',
  'me','my','your','this','that','with','from','as','at','be'
]);

let queue = Promise.resolve();

function hash(value) {
  return createHash('sha256')
    .update(String(value))
    .digest('hex');
}

function serial(task) {
  const operation = queue.then(task, task);
  queue = operation.then(() => undefined, () => undefined);
  return operation;
}

function emptyData() {
  return {
    version: 1,
    totalMessages: 0,
    words: {},
    notifiedGroups: {},
    optedOutMembers: {},
    updatedAt: null
  };
}

async function readData() {
  try {
    const raw = await fs.readFile(dataFile, 'utf8');
    const data = JSON.parse(raw);

    if (
      !data ||
      typeof data !== 'object' ||
      !data.words ||
      typeof data.words !== 'object' ||
      !data.notifiedGroups ||
      typeof data.notifiedGroups !== 'object' ||
      !data.optedOutMembers ||
      typeof data.optedOutMembers !== 'object'
    ) {
      throw new Error('ملف التعلّم المشترك غير صالح.');
    }

    return data;
  } catch (error) {
    if (error.code === 'ENOENT') return emptyData();
    throw error;
  }
}

async function writeData(data) {
  await fs.mkdir(storageDir, { recursive: true });

  const temporary = dataFile + '.' + randomUUID() + '.tmp';

  try {
    await fs.writeFile(
      temporary,
      JSON.stringify(data, null, 2),
      { encoding: 'utf8', mode: 0o600 }
    );

    await fs.rename(temporary, dataFile);
  } catch (error) {
    await fs.unlink(temporary).catch(() => {});
    throw error;
  }
}

function containsSensitiveContent(text) {
  const patterns = [
    /https?:\/\/\S+/i,
    /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i,
    /\b(?:password|passwd|secret|token|api key)\b/i,
    /(?:كلمة المرور|كلمة السر|رمز التحقق|كود التحقق)/i,
    /\b(?:\+?\d[\d\s().-]{7,}\d)\b/
  ];

  return patterns.some(pattern => pattern.test(text));
}

function tokenize(text) {
  return [
    ...new Set(
      (text.normalize('NFKC')
        .toLocaleLowerCase()
        .replace(/ـ/g, '')
        .replace(/[أإآ]/g, 'ا')
        .replace(/[ًٌٍَُِّْ]/g, '')
        .match(/[\p{L}\p{M}]{2,}/gu) || [])
        .filter(word =>
          word.length <= 20 &&
          !STOP_WORDS.has(word)
        )
    )
  ].slice(0, MAX_TOKENS_PER_MESSAGE);
}

async function sendNotice(sock, jid) {
  await sock.sendMessage(jid, {
    text:
      '🧠 تنبيه من HINATA\n\n' +
      'بدأ البوت تعلّم أنماط الكلمات الشائعة في هذه المجموعة.\n' +
      'يُحفظ عدد مرات ظهور الكلمات فقط، ولا تُحفظ نصوص الرسائل أو أسماء مرسليها.\n\n' +
      'لإيقاف مساهمتك في التعلّم أرسل:\n' +
      '.تعلم_ايقاف\n\n' +
      'ولإعادة تفعيلها أرسل:\n' +
      '.تعلم_تشغيل'
  });
}

export async function handleSharedLanguageMessage({
  sock,
  jid,
  senderJid,
  body,
  isGroup,
  fromMe,
  prefix = '.'
}) {
  if (
    !isGroup ||
    fromMe ||
    !jid ||
    !senderJid ||
    typeof body !== 'string'
  ) {
    return false;
  }

  const text = body.trim();

  if (!text) return false;

  const stopCommand = prefix + 'تعلم_ايقاف';
  const startCommand = prefix + 'تعلم_تشغيل';

  if (
    text === stopCommand ||
    text === startCommand
  ) {
    await serial(async () => {
      const data = await readData();
      const memberHash = hash(senderJid);

      if (text === stopCommand) {
        data.optedOutMembers[memberHash] = true;
      } else {
        delete data.optedOutMembers[memberHash];
      }

      await writeData(data);
    });

    await sock.sendMessage(jid, {
      text: text === stopCommand
        ? '🔒 تم إيقاف مساهمتك في التعلّم اللغوي المشترك.'
        : '📚 تمت إعادة تفعيل مساهمتك في التعلّم اللغوي المشترك.'
    });

    return true;
  }

  // لا نتعلم من الأوامر.
  if (text.startsWith(prefix)) return false;

  // لا نحفظ الرسائل التي قد تتضمن بيانات خاصة.
  if (containsSensitiveContent(text)) return false;

  const words = tokenize(text);
  if (!words.length) return false;

  await serial(async () => {
    const data = await readData();

    const groupHash = hash(jid);
    const memberHash = hash(senderJid);

    // إظهار التنبيه قبل بدء جمع الأنماط من المجموعة.
    if (data.notifiedGroups[groupHash] !== true) {
      await sendNotice(sock, jid);
      data.notifiedGroups[groupHash] = true;
      await writeData(data);
      return;
    }

    // العضو الذي اختار الإيقاف لا يساهم.
    if (data.optedOutMembers[memberHash] === true) {
      return;
    }

    data.totalMessages = Math.min(
      MAX_COUNT,
      data.totalMessages + 1
    );

    for (const word of words) {
      data.words[word] = Math.min(
        MAX_COUNT,
        (data.words[word] || 0) + 1
      );
    }

    const sorted = Object.entries(data.words)
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_WORDS);

    data.words = Object.fromEntries(sorted);
    data.updatedAt = new Date().toISOString();

    await writeData(data);
  });

  return false;
}
