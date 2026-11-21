export function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFC')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .trim()
    .toLowerCase();
}

function unwrapMessage(message) {
  let current = message;
  for (let i = 0; i < 5 && current; i += 1) {
    const wrapper = current.ephemeralMessage
      || current.viewOnceMessage
      || current.viewOnceMessageV2
      || current.documentWithCaptionMessage;
    if (!wrapper?.message) break;
    current = wrapper.message;
  }
  return current || {};
}


export function extractMessageText(rawMessage = {}) {
  const queue = [rawMessage];
  const visited = new Set();

  const wrappers = [
    'ephemeralMessage',
    'viewOnceMessage',
    'viewOnceMessageV2',
    'viewOnceMessageV2Extension',
    'documentWithCaptionMessage',
    'deviceSentMessage',
    'editedMessage'
  ];

  const responseKeys = [
    'id',
    'row_id',
    'button_id',
    'selectedButtonId',
    'selectedRowId',
    'selected_row_id',
    'selectedId',
    'selected_id',
    'rowId',
    'name'
  ];

  function extractNativeId(response) {
    const native = response?.nativeFlowResponseMessage;
    if (!native) return '';

    let params = native.paramsJson;

    if (typeof params === 'string') {
      try {
        params = JSON.parse(params);
      } catch {
        return '';
      }
    }

    if (!params || typeof params !== 'object') return '';

    for (const key of responseKeys) {
      const value = params[key];

      if (
        typeof value === 'string' &&
        value.trim()
      ) {
        return value.trim();
      }
    }

    return '';
  }

  while (queue.length) {
    const current = queue.shift();

    if (!current || typeof current !== 'object') continue;
    if (visited.has(current)) continue;

    visited.add(current);

    const direct =
      current.conversation ??
      current.extendedTextMessage?.text ??
      current.imageMessage?.caption ??
      current.videoMessage?.caption ??
      current.documentMessage?.caption ??
      current.buttonsResponseMessage?.selectedButtonId ??
      current.templateButtonReplyMessage?.selectedId ??
      current.listResponseMessage?.singleSelectReply?.selectedRowId;

    if (typeof direct === 'string' && direct.trim()) {
      return direct.trim();
    }

    const nativeId = extractNativeId(
      current.interactiveResponseMessage
    );

    if (nativeId) return nativeId;

    // بعض إصدارات واتساب تضع الرد داخل غلاف رسالة.
    for (const wrapper of wrappers) {
      if (current[wrapper]?.message) {
        queue.push(current[wrapper].message);
      }
    }

    // فحص أشكال الردود التفاعلية المتداخلة.
    if (current.message) queue.push(current.message);

    if (current.interactiveResponseMessage) {
      queue.push(current.interactiveResponseMessage);
    }

    if (current.nativeFlowResponseMessage) {
      const id = extractNativeId({
        nativeFlowResponseMessage: current.nativeFlowResponseMessage
      });

      if (id) return id;
    }
  }

  return '';
}

export function parseCommand(text, prefix = '.') {
  const original = String(text ?? '').trim();
  if (!original.startsWith(prefix)) return null;

  const withoutPrefix = original.slice(prefix.length).trim();
  if (!withoutPrefix) return null;

  const firstSpace = withoutPrefix.search(/\s/);
  const rawName = firstSpace === -1 ? withoutPrefix : withoutPrefix.slice(0, firstSpace);
  const rest = firstSpace === -1 ? '' : withoutPrefix.slice(firstSpace + 1).trim();
  const name = normalizeText(rawName).replace(/[ـ]/g, '');
  if (!name) return null;

  return {
    name,
    args: rest ? rest.split(/\s+/u) : [],
    text: rest,
    rawName
  };
}

const LATIN_STYLES = [
  {
    lower: Array.from('𝐚𝐛𝐜𝐝𝐞𝐟𝐠𝐡𝐢𝐣𝐤𝐥𝐦𝐧𝐨𝐩𝐪𝐫𝐬𝐭𝐮𝐯𝐰𝐱𝐲𝐳'),
    upper: Array.from('𝐀𝐁𝐂𝐃𝐄𝐅𝐆𝐇𝐈𝐉𝐊𝐋𝐌𝐍𝐎𝐏𝐐𝐑𝐒𝐓𝐔𝐕𝐖𝐗𝐘𝐙')
  },
  {
    lower: Array.from('𝒶𝒷𝒸𝒹𝑒𝒻𝑔𝒽𝒾𝒿𝓀𝓁𝓂𝓃𝑜𝓅𝓆𝓇𝓈𝓉𝓊𝓋𝓌𝓍𝓎𝓏'),
    upper: Array.from('𝒜ℬ𝒞𝒟ℰℱ𝒢ℋℐ𝒥𝒦ℒℳ𝒩𝒪𝒫𝒬ℛ𝒮𝒯𝒰𝒱𝒲𝒳𝒴𝒵')
  },
  {
    lower: Array.from('𝕒𝕓𝕔𝕕𝕖𝕗𝕘𝕙𝕚𝕛𝕜𝕝𝕞𝕟𝕠𝕡𝕢𝕣𝕤𝕥𝕦𝕧𝕨𝕩𝕪𝕫'),
    upper: Array.from('𝔸𝔹ℂ𝔻𝔼𝔽𝔾ℍ𝕀𝕁𝕂𝕃𝕄ℕ𝕆ℙℚℝ𝕊𝕋𝕌𝕍𝕎𝕏𝕐ℤ')
  }
];

function mapAlphabet(text, style) {
  return Array.from(text, (char) => {
    const code = char.codePointAt(0);
    if (code >= 97 && code <= 122) return style.lower[code - 97];
    if (code >= 65 && code <= 90) return style.upper[code - 65];
    return char;
  }).join('');
}

export function decorateText(text, styleIndex = 0) {
  const input = String(text ?? '').trim();
  if (!input) return '';
  const index = Math.max(0, Math.min(LATIN_STYLES.length - 1, Number(styleIndex) || 0));
  const style = LATIN_STYLES[index];
  // Arabic letters are kept readable and decorated with simple framing marks.
  const containsArabic = /[\u0600-\u06FF]/u.test(input);
  const converted = mapAlphabet(input, style);
  return containsArabic ? `『 ${converted} 』` : converted;
}

export function getMessageContextInfo(rawMessage = {}) {
  const message = unwrapMessage(rawMessage);
  return message.extendedTextMessage?.contextInfo
    || message.imageMessage?.contextInfo
    || message.videoMessage?.contextInfo
    || message.documentMessage?.contextInfo
    || {};
}




// ═══════════════ ❅ HINATA • WHATSAPP PREMIUM STYLE ═══════════════

const HINATA_SEPARATOR =
  '*❃⋅━̊━̊━̊---━̊━̊━̊━̊❄️━̊━̊━̊━̊━̊━̊━̊⋅❃*';

const HINATA_STYLE = Object.freeze({
  top: HINATA_SEPARATOR,
  innerTop: '┏━━━━━━━━━━━━━━━━━━━━━━┓',
  innerBottom: '┗━━━━━━━━━━━━━━━━━━━━━━┛',
  bottom: HINATA_SEPARATOR,
  signature: '`❄️ 𝑨𝒍𝒗𝒂𝒓𝒊𝒂`',
  separator: '┊ ─────── ❃ ─────── ┊'
});

function stretchArabicWord(word) {
  const letters = [...word];
  const connectable = /[بتثجحخسشصضطظعغفقكلمنهيئىپچگ]/u;
  let result = '';

  for (let i = 0; i < letters.length; i += 1) {
    result += letters[i];

    if (
      i < letters.length - 1 &&
      connectable.test(letters[i]) &&
      /[\u0621-\u064A\u067E\u0686\u06AF]/u.test(letters[i + 1])
    ) {
      result += 'ــ';
    }
  }

  return result;
}
function decorateArabicSafely(value) {
  const protectedParts = [];

  const protectedText = String(value ?? '').replace(
    /https?:\/\/[^\s]+|www\.[^\s]+|`[^`]*`|\.[\p{L}\p{N}_ـ]+|@\d+/gu,
    match => {
      const key = `HINATAPROTECTED${protectedParts.length}X`;
      protectedParts.push(match);
      return key;
    }
  );

  let result = protectedText.replace(
    /[\u0621-\u064A]+/gu,
    word => stretchArabicWord(word)
  );

  result = result.replace(
    /HINATAPROTECTED(\d+)X/g,
    (_, index) => protectedParts[Number(index)] ?? ''
  );

  return result;
}

const LATIN_BOLD_MAP = Object.freeze({
  A:'𝐀',B:'𝐁',C:'𝐂',D:'𝐃',E:'𝐄',F:'𝐅',G:'𝐆',H:'𝐇',I:'𝐈',J:'𝐉',K:'𝐊',L:'𝐋',M:'𝐌',
  N:'𝐍',O:'𝐎',P:'𝐏',Q:'𝐐',R:'𝐑',S:'𝐒',T:'𝐓',U:'𝐔',V:'𝐕',W:'𝐖',X:'𝐗',Y:'𝐘',Z:'𝐙',
  a:'𝐚',b:'𝐛',c:'𝐜',d:'𝐝',e:'𝐞',f:'𝐟',g:'𝐠',h:'𝐡',i:'𝐢',j:'𝐣',k:'𝐤',l:'𝐥',m:'𝐦',
  n:'𝐧',o:'𝐨',p:'𝐩',q:'𝐪',r:'𝐫',s:'𝐬',t:'𝐭',u:'𝐮',v:'𝐯',w:'𝐰',x:'𝐱',y:'𝐲',z:'𝐳'
});

function decorateLatinSafely(value) {
  const protectedParts = [];

  // علامات Unicode خاصة لا تتحول إلى حروف مزخرفة.
  const safe = String(value ?? '').replace(
    /https?:\/\/[^\s]+|www\.[^\s]+|`[^`]*`|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|\.[\p{L}\p{N}_ـ]+|@[0-9]+/gu,
    match => {
      const key = `\uE000${protectedParts.length}\uE001`;
      protectedParts.push(match);
      return key;
    }
  );

  const decorated = [...safe]
    .map(char => LATIN_BOLD_MAP[char] || char)
    .join('');

  return decorated.replace(
    /\uE000(\d+)\uE001/gu,
    (_, index) => protectedParts[Number(index)] ?? ''
  );
}

function styleArabicLines(value) {
  return value.split('\n').map(line => {
    if (!/[\u0600-\u06FF]/u.test(line)) return line;

    // منع تكرار علامة ❃ إذا كانت موجودة مسبقًا.
    if (/^\s*❃(?:\s|$)/u.test(line)) return line;

    // إضافة العلامة دون تغيير زخارف واتساب القديمة.
    if (line.includes('*') || line.includes('_')) {
      return `❃ ${line}`;
    }

    return `❃ *_${line}_*`;
  }).join('\n');
}

export function formatHinataReply(value, options = {}) {
  const raw = String(value ?? '').trim();

  if (!raw) return '';

  // القوائم والأقسام تحتفظ بتصميمها الأصلي.
  if (options.menu === true) return raw;

  // منع تكرار الفاصل الرسمي.
  if (raw.includes(HINATA_SEPARATOR)) return raw;

  const decorated = decorateArabicSafely(
    decorateLatinSafely(raw)
  ).trim();

  const body = styleArabicLines(decorated);

  const hasOwnLayout =
    /(?:^|\n)\s*(?:╭|┏|╔|╰|┗|╚).*(?:〔|━|─|═)/u.test(raw) &&
    /(?:^|\n)\s*(?:╰|┗|╚)/u.test(raw);

  if (hasOwnLayout) return body;

  return [
    HINATA_STYLE.top,
    '',
    HINATA_STYLE.innerTop,
    ...body.split('\n'),
    HINATA_STYLE.innerBottom,
    '',
    HINATA_STYLE.bottom,
    '',
    HINATA_STYLE.signature
  ].join('\n');
}


// ═══════════════ ❅ END HINATA STYLE ═══════════════
