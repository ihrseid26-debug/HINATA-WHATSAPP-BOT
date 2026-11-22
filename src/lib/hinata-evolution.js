// HINATA_EVOLUTION_BRIDGE_V2
import path from 'node:path';
import { config } from '../config.js';
import { loadConfig } from '../evolution/core/config.js';
import { HinataBrain } from '../evolution/core/brain.js';
import { generateLocalReply } from './local-ai/llama-client.js';
import {
  observeLearningTurn,
  getLearningStatus
} from './local-ai/learning-engine.js';

const evolutionStorage = path.join(config.databaseDir, 'evolution');

const evolutionConfig = loadConfig({
  HINATA_NAME: 'HINATA',
  HINATA_MODE: 'local',
  HINATA_LOCAL_ENABLED: 'false'
});

let brainPromise = null;

async function getEvolutionBrain() {
  if (!brainPromise) {
    const brain = new HinataBrain(evolutionConfig, {
      storageDir: evolutionStorage
    });

    brainPromise = brain.initialize()
      .then(() => brain)
      .catch(error => {
        brainPromise = null;
        throw error;
      });
  }

  return brainPromise;
}

async function learnSafely(input, answer = '') {
  try {
    return await observeLearningTurn(input, answer);
  } catch (error) {
    console.warn('[HINATA LEARNING] Could not save learning:', error);
    return null;
  }
}

async function handleEvolutionCommand(ctx) {
  const input = String(ctx.text || '').trim();

  if (!input) {
    let statusText = '🧠 HINATA LEARNING ENGINE';

    try {
      const status = await getLearningStatus();
      statusText +=
        `\n\n📚 مرات التعلّم: ${status.observations}` +
        `\n🎯 هدف التعلّم الحالي: ${status.currentGoal?.title || 'جارٍ الاختيار'}`;
    } catch {
      statusText += '\n\nالذاكرة غير متاحة حالياً.';
    }

    await ctx.reply(
      statusText +
      '\n\nاكتب رسالة بعد الأمر للتحدث مع هيناتا.' +
      '\nمثال: .هيناتا مرحباً'
    );
    return;
  }

  if (input.length > 1200) {
    await ctx.reply('⚠️ الحد الأقصى لرسالة التجربة هو 1200 حرف.');
    return;
  }

  let localAnswer = null;

  try {
    localAnswer = await generateLocalReply(input);
  } catch (error) {
    console.warn('[HINATA LOCAL AI] Generation failed:', error);
  }

  if (localAnswer) {
    await ctx.reply(localAnswer);
    await learnSafely(input, localAnswer);
    return;
  }

  const personId =
    typeof ctx.senderJid === 'string' &&
    ctx.senderJid.includes('@')
      ? ctx.senderJid
      : null;

  try {
    const brain = await getEvolutionBrain();

    const result = await brain.respond(
      input,
      [],
      personId ? { personId } : {}
    );

    if (result?.status === 'not_configured' || !result?.result) {
      await ctx.reply(
        '🧠 HINATA EVOLUTION\n\n' +
        'محرك HALA المحلي غير جاهز حالياً، ولم يتم توليد إجابة.'
      );
      return;
    }

    const answer = typeof result.result === 'string'
      ? result.result
      : 'تم تنفيذ الطلب، لكن صيغة الرد غير نصية.';

    await ctx.reply(answer);
    await learnSafely(input, answer);
  } catch (error) {
    console.warn('[HINATA EVOLUTION] Fallback failed:', error);
    await ctx.reply('تعذر توليد الرد حالياً. حاولي مرة أخرى.');
  }
}

export function registerHinataEvolutionCommand(commands) {
  const command = {
    description: 'محادثة هيناتا والتعلّم المحلي',
    reaction: '🧠',
    handler: handleEvolutionCommand
  };

  commands.set('هيناتا', command);
  commands.set('hinata', command);
}
