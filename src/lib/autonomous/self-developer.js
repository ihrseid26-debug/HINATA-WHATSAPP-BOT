import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { generateLocalReply } from '../local-ai/llama-client.js';

const ROOT = process.cwd();

const PROPOSALS = path.join(
  ROOT,
  'storage/hinata-autonomous',
  'proposals'
);

const ALLOWED_FILES = [
  'src/lib/autonomous/manager.js',
  'src/lib/local-ai/learning-engine.js',
  'src/lib/local-ai/llama-client.js',
  'src/lib/hinata-evolution.js'
];

const MAX_FILE_SIZE = 18000;
const MAX_OUTPUT = 5000;

function safeName(file) {
  return file.replaceAll('/', '__').replaceAll('.', '_');
}

async function readAllowedFile(file) {
  if (!ALLOWED_FILES.includes(file)) {
    throw new Error('File is not allowed');
  }

  const fullPath = path.resolve(ROOT, file);

  if (!fullPath.startsWith(path.resolve(ROOT) + path.sep)) {
    throw new Error('Invalid path');
  }

  const stat = await fs.stat(fullPath);

  if (!stat.isFile() || stat.size > MAX_FILE_SIZE) {
    throw new Error('File is too large or invalid');
  }

  return fs.readFile(fullPath, 'utf8');
}

export async function analyzeFileForImprovement(file) {
  const source = await readAllowedFile(file);

  const prompt = [
    'أنت محلل برمجي لمشروع HINATA.',
    'حلل الكود التالي وابحث عن أخطاء أو تحسينات حقيقية.',
    'لا تدّعِ وجود مشكلة دون دليل.',
    'لا تطلب الوصول إلى النظام أو الأسرار.',
    'لا تقترح حذف الحماية أو تجاوز الصلاحيات.',
    'لا تغيّر واجهات الدوال العامة دون ضرورة واضحة.',
    'أخرج تقريراً عربياً مختصراً يتضمن:',
    '1. وظيفة الملف.',
    '2. المشاكل المؤكدة إن وجدت.',
    '3. التحسينات المقترحة.',
    '4. مخاطر كل تحسين.',
    '5. اختبارات التحقق المطلوبة.',
    '',
    `اسم الملف: ${file}`,
    '',
    'الكود:',
    source
  ].join('\n');

  const analysis = await generateLocalReply(prompt);

  if (!analysis || typeof analysis !== 'string') {
    throw new Error('Local model returned no analysis');
  }

  await fs.mkdir(PROPOSALS, { recursive: true });

  const id = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

  const proposal = {
    id,
    file,
    createdAt: new Date().toISOString(),
    sourceHash: crypto
      .createHash('sha256')
      .update(source)
      .digest('hex'),
    analysis: analysis.slice(0, MAX_OUTPUT),
    status: 'proposal-only'
  };

  const output = path.join(
    PROPOSALS,
    `${id}-${safeName(file)}.json`
  );

  await fs.writeFile(
    output,
    JSON.stringify(proposal, null, 2),
    { flag: 'wx', mode: 0o600 }
  );

  return proposal;
}

export async function analyzeAllAllowedFiles() {
  const results = [];

  for (const file of ALLOWED_FILES) {
    try {
      const proposal = await analyzeFileForImprovement(file);

      results.push({
        file,
        success: true,
        id: proposal.id
      });
    } catch (error) {
      results.push({
        file,
        success: false,
        error: String(error.message || error)
      });
    }
  }

  return results;
}
