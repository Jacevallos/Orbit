import fs from "fs";
import path from "path";

const LOG_DIR = path.join(process.cwd(), "logs");
const APP_LOG = path.join(LOG_DIR, "app.log");
const ERROR_LOG = path.join(LOG_DIR, "errors.log");
const MAX_SIZE = 5 * 1024 * 1024; // rotate at 5 MB

function ensureDir() {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
}

function rotateSafe(filePath: string) {
  try {
    if (fs.statSync(filePath).size > MAX_SIZE) {
      fs.renameSync(filePath, filePath + ".old");
    }
  } catch {}
}

function writeLine(filePath: string, line: string) {
  try {
    ensureDir();
    rotateSafe(filePath);
    fs.appendFileSync(filePath, line + "\n", "utf8");
  } catch {}
}

function fmt(level: string, message: string, meta?: Record<string, unknown>): string {
  const ts = new Date().toISOString();
  const metaStr = meta ? " " + JSON.stringify(meta) : "";
  return `[${ts}] [${level.padEnd(5)}] ${message}${metaStr}`;
}

export const logger = {
  info(message: string, meta?: Record<string, unknown>) {
    const line = fmt("INFO", message, meta);
    writeLine(APP_LOG, line);
    console.log(line);
  },
  warn(message: string, meta?: Record<string, unknown>) {
    const line = fmt("WARN", message, meta);
    writeLine(APP_LOG, line);
    console.warn(line);
  },
  error(message: string, meta?: Record<string, unknown>) {
    const line = fmt("ERROR", message, meta);
    writeLine(APP_LOG, line);
    writeLine(ERROR_LOG, line);
    console.error(line);
  },
};
