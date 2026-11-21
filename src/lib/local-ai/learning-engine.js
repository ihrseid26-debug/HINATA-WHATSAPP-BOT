import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BOT_ROOT = path.resolve(HERE, '../../..');
const STORAGE_DIR = path.join(BOT_ROOT, 'storage', 'hinata-learning');
const DATA_FILE = path.join(STORAGE_DIR, 'learning-data.json');
const TEMP_FILE = `${DATA_FILE}.tmp`;

const MAX_GOALS = 40;

const INITIAL_DATA = {
  version: 1,
  observations: 0,
  language: {},
  emotions: {},
  conversationStyles: {},
  skills: {
    context: 0,
    empathy: 0,
    clarity: 0,
    arabic: 0,
    reasoning: 0
  },
  goals: [],
  currentGoal: null,
  updatedAt: null
};

let data = null;
let loading = null;
let saveQueue = Promise.resolve();

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalize(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1500);
}

async function loadData() {
  if (data) return data;
  if (loading) return loading;

  loading = (async () => {
    await mkdir(STORAGE_DIR, { recursive: true });

    try {
      const raw = await readFile(DATA_FILE, 'utf8');
      const parsed = JSON.parse(raw);

      data = {
        ...clone(INITIAL_DATA),
        ...parsed,
        skills: {
          ...INITIAL_DATA.skills,
          ...(parsed.skills || {})
        }
      };
    } catch {
      data = clone(INITIAL_DATA);
    }

    return data;
  })();

  try {
    return await loading;
  } finally {
    loading = null;
  }
}

async function persist() {
  const snapshot = JSON.stringify(data, null, 2);

  const task = saveQueue.then(async () => {
    await mkdir(STORAGE_DIR, { recursive: true });
    await writeFile(TEMP_FILE, snapshot, 'utf8');
    await rename(TEMP_FILE, DATA_FILE);
  });

  saveQueue = task.catch(() => {});
  return task;
}

function count(map, key) {
  if (!key) return;
  map[key] = (Number(map[key]) || 0) + 1;
}

function detectEmotion(text) {
  const patterns = {
    happiness: /سعيد|سعيدة|فرح|فرحان|مبسوط|مبسوطة|رائع|جميل|أحب هذا/iu,
    sadness: /حزين|حزينة|زعلان|زعلانة|متضايق|متضايقة|محبط|محبطة|وحيد|وحيدة/iu,
    anger: /غاضب|غاضبة|عصبي|عصبية|منزعج|منزعجة|أكره|مستفز/iu,
    anxiety: /قلق|خائف|خائفة|متوتر|متوترة|خايف|خايفة|أخشى/iu,
    confusion: /لا أفهم|لم أفهم|مش فاهم|مش فاهمة|محتار|محتارة|ماذا تقصد/iu,
    gratitude: /شكرا|شكراً|ممتن|ممتنة|يعطيك العافية/iu
  };

  for (const [emotion, pattern] of Object.entries(patterns)) {
    if (pattern.test(text)) return emotion;
  }

  return 'neutral';
}

function detectStyle(text) {
  if (text.length < 35) return 'short';
  if (text.includes('?') || text.includes('؟')) return 'question';
  if (text.length > 250) return 'detailed';
  return 'normal';
}

function chooseGoal(state) {
  const skillEntries = Object.entries(state.skills);
  skillEntries.sort((a, b) => a[1] - b[1]);

  const weakest = skillEntries[0]?.[0] || 'context';

  const goals = {
    context: 'تحسين فهم سياق المحادثات وربط الرسائل السابقة',
    empathy: 'تحسين فهم الإشارات العاطفية والاستجابة المتعاطفة',
    clarity: 'تحسين وضوح الإجابات واختصارها عند الحاجة',
    arabic: 'استكشاف التعبيرات العربية وأساليب الحوار المختلفة',
    reasoning: 'تحسين تحليل الأسئلة وربط المعلومات'
  };

  const title = goals[weakest];

  if (state.currentGoal?.title === title) {
    return state.currentGoal;
  }

  const goal = {
    id: `${Date.now()}-${weakest}`,
    title,
    skill: weakest,
    createdAt: new Date().toISOString(),
    status: 'active'
  };

  state.goals.push(goal);
  state.goals = state.goals.slice(-MAX_GOALS);
  state.currentGoal = goal;

  return goal;
}

/**
 * يتعلم من إشارات عامة دون حفظ نص الرسالة أو هوية صاحبها.
 */
export async function observeLearningTurn(userText, assistantText = '') {
  const state = await loadData();

  const input = normalize(userText);
  const answer = normalize(assistantText);

  if (!input) return null;

  const emotion = detectEmotion(input);
  const style = detectStyle(input);

  state.observations += 1;

  count(state.emotions, emotion);
  count(state.conversationStyles, style);

  const arabicLetters = (input.match(/[\u0600-\u06FF]/g) || []).length;
  const totalLetters = (input.match(/\p{L}/gu) || []).length;

  if (totalLetters && arabicLetters / totalLetters > 0.5) {
    count(state.language, 'arabic');
    state.skills.arabic += 1;
  } else {
    count(state.language, 'other');
  }

  if (input.includes('?') || input.includes('؟')) {
    state.skills.reasoning += 1;
  }

  if (input.length > 40) {
    state.skills.context += 1;
  }

  if (emotion !== 'neutral') {
    state.skills.empathy += 1;
  }

  if (answer && answer.length < 300) {
    state.skills.clarity += 1;
  }

  const goal = chooseGoal(state);

  state.updatedAt = new Date().toISOString();

  await persist();

  return {
    emotion,
    style,
    observations: state.observations,
    goal: goal.title
  };
}

export async function getLearningStatus() {
  const state = await loadData();

  return {
    observations: state.observations,
    emotions: clone(state.emotions),
    language: clone(state.language),
    styles: clone(state.conversationStyles),
    skills: clone(state.skills),
    currentGoal: state.currentGoal
      ? clone(state.currentGoal)
      : null,
    goals: clone(state.goals),
    updatedAt: state.updatedAt
  };
}

export async function chooseNewLearningGoal() {
  const state = await loadData();

  if (state.currentGoal) {
    state.currentGoal.status = 'completed';
  }

  state.currentGoal = null;
  const goal = chooseGoal(state);

  state.updatedAt = new Date().toISOString();
  await persist();

  return clone(goal);
}
