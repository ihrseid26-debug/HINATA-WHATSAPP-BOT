const fs = require('node:fs');
const path = require('node:path');

const files = {
  validate: 'node_modules/@whiskeysockets/baileys/lib/Utils/validate-connection.js',
  socket: 'node_modules/@whiskeysockets/baileys/lib/Socket/socket.js',
  recv: 'node_modules/@whiskeysockets/baileys/lib/Socket/messages-recv.js',
  subbots: 'src/lib/subbots.js',
  core: 'src/commands/core.js'
};

const changes = [
  {
    file: 'validate',
    old: `        signalIdentities: [...(signalIdentities || []), identity],
        platform: platformNode?.attrs.name`,
    replacement: `        signalIdentities: [...(signalIdentities || []), identity],
        platform: platformNode?.attrs.name,
        registered: true`
  },
  {
    file: 'socket',
    old: `        if (!creds.me) {
            node = generateRegistrationNode(creds, config);`,
    replacement: `        if (!creds.me || (!!creds.pairingCode && !creds.registered)) {
            node = generateRegistrationNode(creds, config);`
  },
  {
    file: 'socket',
    old: `                            tag: 'link_code_pairing_nonce',
                            attrs: {},
                            content: '0'`,
    replacement: `                            tag: 'link_code_pairing_nonce',
                            attrs: {},
                            content: Buffer.alloc(1)`
  },
  {
    file: 'recv',
    old: `                const linkCodeCompanionReg = getBinaryNodeChild(node, 'link_code_companion_reg');
                const ref = toRequiredBuffer`,
    replacement: `                const linkCodeCompanionReg = getBinaryNodeChild(node, 'link_code_companion_reg');
                if (linkCodeCompanionReg?.attrs?.stage !== 'primary_hello') break;
                const ref = toRequiredBuffer`
  },
  {
    file: 'subbots',
    old: `import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState
} from '@whiskeysockets/baileys';`,
    replacement: `import makeWASocket, {
  Browsers,
  DisconnectReason,
  useMultiFileAuthState
} from '@whiskeysockets/baileys';`
  },
  {
    file: 'subbots',
    old: `    const sock = makeWASocket({
      auth: state,`,
    replacement: `    const sock = makeWASocket({
      auth: state,
      browser: Browsers.macOS('Chrome'),`
  },
  {
    file: 'core',
    old: `'✅ تم إنشاء جلسة البوت الفرعي.\\n' +`,
    replacement: `'⏳ جاري تسجيل الدخول إلى واتساب...\\n' +`
  }
];

const contents = {};
for (const [key, relative] of Object.entries(files)) {
  const full = path.resolve(relative);
  if (!fs.existsSync(full)) throw new Error(`الملف غير موجود: ${relative}`);
  contents[key] = fs.readFileSync(full, 'utf8');
}

for (const change of changes) {
  const source = contents[change.file];
  if (source.includes(change.replacement)) continue;
  if (!source.includes(change.old)) {
    throw new Error(`لم أجد الموضع المتوقع في: ${files[change.file]}`);
  }
  if (source.indexOf(change.old) !== source.lastIndexOf(change.old)) {
    throw new Error(`الموضع غير فريد في: ${files[change.file]}`);
  }
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.resolve(`backups/pairing-fix-${stamp}`);
fs.mkdirSync(backupDir, { recursive: true });

for (const [key, relative] of Object.entries(files)) {
  const target = path.resolve(relative);
  const backup = path.join(backupDir, relative.replaceAll('/', '__'));
  fs.copyFileSync(target, backup);
}

for (const change of changes) {
  let source = contents[change.file];
  if (!source.includes(change.replacement)) {
    source = source.replace(change.old, change.replacement);
    contents[change.file] = source;
  }
}

for (const [key, relative] of Object.entries(files)) {
  fs.writeFileSync(path.resolve(relative), contents[key]);
}

console.log('✅ تم تطبيق التعديلات.');
console.log(`📦 النسخ الاحتياطية: ${backupDir}`);
console.log('🌸 لم يتم تعديل أي مجلد جلسات.');
