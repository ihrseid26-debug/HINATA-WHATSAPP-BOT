import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BOT_ROOT = path.resolve(HERE, '../../..');
const PROJECT_ROOT = path.resolve(BOT_ROOT, '..');

const SERVER_PATH = path.join(
  PROJECT_ROOT, 'llama.cpp', 'build', 'bin', 'llama-server'
);

const MODEL_PATH = path.join(
  PROJECT_ROOT, 'HINATA-EVOLUTION', 'models',
  'Hala-700M.Q4_K_M.gguf'
);

const HOST = '127.0.0.1';
const PORT = 9931;
const BASE_URL = `http://${HOST}:${PORT}`;

let serverProcess = null;
let startupPromise = null;
let serverReady = false;
let generationQueue = Promise.resolve();
let lastServerError = '';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function startLocalModelServer(logger = console) {
  if (serverReady) return true;
  if (startupPromise) return startupPromise;

  startupPromise = (async () => {
    if (!existsSync(SERVER_PATH) || !existsSync(MODEL_PATH)) {
      logger.warn?.('Local model files are missing; AI fallback remains active.');
      return false;
    }

    lastServerError = '';

    const child = spawn(SERVER_PATH, [
      '-m', MODEL_PATH,
      '--host', HOST,
      '--port', String(PORT),
      '-c', '512',
      '-t', '3',
      '-tb', '2',
      '-np', '1',
      '-b', '128',
      '-ub', '64',
      '--jinja'
    ], {
      cwd: BOT_ROOT,
      shell: false,
      stdio: ['ignore', 'ignore', 'pipe']
    });

    serverProcess = child;
    let exited = false;

    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', chunk => {
      lastServerError = (lastServerError + chunk).slice(-2000);
    });

    child.on('error', error => {
      exited = true;
      serverReady = false;
      logger.warn?.({ err: error }, 'Could not launch local model server');
    });

    child.on('exit', (code, signal) => {
      exited = true;
      serverReady = false;
      if (serverProcess === child) serverProcess = null;

      if (code !== 0) {
        logger.warn?.({
          code,
          signal,
          details: lastServerError.slice(-1000)
        }, 'Local model server stopped');
      }
    });

    for (let attempt = 0; attempt < 120; attempt++) {
      if (exited) return false;

      try {
        const response = await fetch(`${BASE_URL}/health`, {
          signal: AbortSignal.timeout(1500)
        });

        if (response.ok) {
          serverReady = true;
          logger.info?.('Local HINATA model is ready on 127.0.0.1:9931');

          process.once('exit', () => {
            try {
              child.kill('SIGTERM');
            } catch {}
          });

          return true;
        }
      } catch {}

      await sleep(500);
    }

    logger.warn?.({
      details: lastServerError.slice(-1000)
    }, 'Local model startup timed out');

    try {
      child.kill('SIGTERM');
    } catch {}

    return false;
  })().finally(() => {
    startupPromise = null;
  });

  return startupPromise;
}

async function requestLocalReply(userText, context) {
  if (!serverReady) return null;

  const previous = Array.isArray(context)
    ? context.slice(-4).map(value => String(value).slice(0, 300))
    : [];

  const contextText = previous.length
    ? `\nسياق الرسائل السابقة من نفس المحادثة:\n${previous.join('\n')}`
    : '';

  try {
    const response = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'SmolLM2-135M-Instruct',
        messages: [
          {
            role: 'system',
            content:
              'أنت هيناتا، مساعدة محادثة ودودة. أجيبي باختصار وبأسلوب طبيعي. ' +
              'حاولي الرد بالعربية البسيطة إذا أمكن. افهمي سياق الكلام وإشارات المشاعر ' +
              'دون الادعاء بأن لديك مشاعر بشرية. لا تدّعي تنفيذ أوامر أو تغييرات. ' +
              'لا تطلبي كلمات مرور أو بيانات خاصة.'
          },
          {
            role: 'user',
            content: `${contextText}\n\nرسالة المستخدم الحالية:\n${String(userText).slice(0, 1000)}`
          }
        ],
        temperature: 0.65,
        top_p: 0.9,
        max_tokens: 60,
        stream: false
      }),
      signal: AbortSignal.timeout(45000)
    });

    if (!response.ok) return null;

    const data = await response.json();
    const answer = data?.choices?.[0]?.message?.content;

    if (typeof answer !== 'string') return null;

    const cleaned = answer
      .replace(/<\|[^|]*\|>/g, '')
      .trim()
      .slice(0, 1200);

    return cleaned || null;
  } catch {
    return null;
  }
}

export function generateLocalReply(userText, context = []) {
  const task = generationQueue.then(
    () => requestLocalReply(userText, context)
  );

  generationQueue = task.catch(() => null);
  return task;
}
