/**
 * Kleines Protokoll in einer Datei im userData-Ordner der jeweiligen App (für Support),
 * in der Entwicklung zusätzlich auf der Konsole. Protokollieren darf nie selbst etwas kaputt machen.
 */
import { app } from 'electron';
import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';

export type LogLevel = 'info' | 'warn' | 'error';

export interface LoggerOptions {
  /** Dateiname im userData-Ordner, z. B. "poe2-pricecheck.log". */
  fileName: string;
  /** Ab dieser Größe wird die Datei zu "<name>.old" und neu begonnen (Standard 512 KB). */
  maxBytes?: number;
  /** Zusätzlich auf die Konsole schreiben (Standard: nur, solange die App nicht gepackt ist). */
  console?: boolean | (() => boolean);
}

export interface Logger {
  /** Voller Pfad der Protokolldatei. */
  readonly file: string;
  log(level: LogLevel, message: string, err?: unknown): void;
  info(message: string): void;
  warn(message: string, err?: unknown): void;
  error(message: string, err?: unknown): void;
}

export function formatLogLine(level: LogLevel, message: string, err?: unknown, now = new Date()): string {
  const detail = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : err !== undefined ? String(err) : '';
  return `${now.toISOString()} [${level}] ${message}${detail ? ` – ${detail}` : ''}\n`;
}

export function createLogger(opts: LoggerOptions): Logger {
  const maxBytes = opts.maxBytes ?? 512 * 1024;
  // Pfad erst beim Schreiben ermitteln: Apps setzen ihren userData-Ordner oft erst beim Start.
  const file = () => join(app.getPath('userData'), opts.fileName);
  const toConsole = () => {
    const c = opts.console ?? (() => !app.isPackaged);
    return typeof c === 'function' ? c() : c;
  };

  const log = (level: LogLevel, message: string, err?: unknown) => {
    const line = formatLogLine(level, message, err);
    try {
      if (toConsole()) process.stdout.write(line);
    } catch {
      // Konsole nicht verfügbar
    }
    try {
      const path = file();
      mkdirSync(join(path, '..'), { recursive: true });
      try {
        if (statSync(path).size > maxBytes) renameSync(path, `${path}.old`);
      } catch {
        // Datei existiert noch nicht
      }
      appendFileSync(path, line);
    } catch {
      // Protokollieren darf nie selbst einen Absturz auslösen.
    }
  };

  return {
    get file() {
      return file();
    },
    log,
    info: (m) => log('info', m),
    warn: (m, e) => log('warn', m, e),
    error: (m, e) => log('error', m, e),
  };
}
