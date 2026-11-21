import fs from 'node:fs/promises';
import { applyRegisteredSafeFixes } from './safe-patcher.js';

const STORAGE = new URL(
  '../../../storage/hinata-autonomous/',
  import.meta.url
);

const REPORT_FILE = new URL('health-report.json', STORAGE);

const CONFIG = {
  intervalMs: 300000,
  modelHost: '127.0.0.1',
  modelPort: 9931,
  maxReports: 100
};

let timer = null;
let checking = false;

async function readMemory() {
  try {
    const raw = await fs.readFile('/proc/meminfo', 'utf8');
    const total = Number(raw.match(/^MemTotal:\s+(\d+)/m)?.[1] || 0);
    const available = Number(raw.match(/^MemAvailable:\s+(\d+)/m)?.[1] || 0);

    return {
      totalMB: Math.round(total / 1024),
      availableMB: Math.round(available / 1024)
    };
  } catch {
    return null;
  }
}

async function checkModel() {
  try {
    const response = await fetch(
      `http://${CONFIG.modelHost}:${CONFIG.modelPort}/health`,
      { signal: AbortSignal.timeout(3000) }
    );

    return response.ok;
  } catch {
    return false;
  }
}

async function saveReport(report) {
  await fs.mkdir(STORAGE, { recursive: true });

  let reports = [];

  try {
    const parsed = JSON.parse(
      await fs.readFile(REPORT_FILE, 'utf8')
    );

    if (Array.isArray(parsed)) reports = parsed;
  } catch {}

  reports.push(report);
  reports = reports.slice(-CONFIG.maxReports);

  const temp = new URL('health-report.tmp', STORAGE);

  await fs.writeFile(
    temp,
    JSON.stringify(reports, null, 2),
    { mode: 0o600 }
  );

  await fs.rename(temp, REPORT_FILE);
}

export async function runHealthCheck() {
  if (checking) return null;

  checking = true;

  try {
    const [memory, model] = await Promise.all([
      readMemory(),
      checkModel()
    ]);

    const report = {
      time: new Date().toISOString(),
      processId: process.pid,
      uptimeSeconds: Math.floor(process.uptime()),
      botProcessDetected: true,
      modelOnline: model,
      memory,
      status: model && memory?.availableMB > 200
        ? 'healthy'
        : 'warning'
    };

    await saveReport(report);
    return report;
  } finally {
    checking = false;
  }
}

export function startAutonomousManager(logger = console) {
  if (timer) return;

  const check = async () => {
    try {
      const report = await runHealthCheck();

      if (report) {
        logger.info?.({
          status: report.status,
          modelOnline: report.modelOnline,
          memory: report.memory
        }, '[HINATA AUTONOMOUS MANAGER]');
      }
    } catch (error) {
      logger.warn?.(
        { err: error },
        '[HINATA AUTONOMOUS MANAGER] Health check failed'
      );
    }
  };

  const initialize = async () => {
    try {
      await applyRegisteredSafeFixes(logger);
    } catch (error) {
      logger.warn?.({ err: error }, '[HINATA SELF-DEVELOPER] Initialization failed');
    }
    await check();
  };

  initialize();
  timer = setInterval(check, CONFIG.intervalMs);
  timer.unref?.();
}
