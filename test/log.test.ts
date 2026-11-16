import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const dir = mkdtempSync(join(tmpdir(), 'poe2-core-log-'));
vi.mock('electron', () => ({ app: { getPath: () => dir, isPackaged: true } }));

const { createLogger, formatLogLine } = await import('../src/log');

describe('formatLogLine', () => {
  it('schreibt Zeit, Stufe, Text und Fehlerdetails', () => {
    const line = formatLogLine('error', 'Price check failed', new Error('boom'), new Date('2026-11-16T12:00:00Z'));
    expect(line.startsWith('2026-11-16T12:00:00.000Z [error] Price check failed – boom')).toBe(true);
    expect(line.endsWith('\n')).toBe(true);
    expect(formatLogLine('info', 'Start', undefined, new Date(0))).toBe('1970-01-01T00:00:00.000Z [info] Start\n');
  });
});

describe('createLogger', () => {
  beforeEach(() => {
    writeFileSync(join(dir, 'test.log'), '');
  });

  it('schreibt in die Datei im userData-Ordner', () => {
    const logger = createLogger({ fileName: 'test.log' });
    expect(logger.file).toBe(join(dir, 'test.log'));
    logger.info('hello');
    logger.warn('careful', 'detail');
    const text = readFileSync(logger.file, 'utf8');
    expect(text).toMatch(/\[info\] hello\n/);
    expect(text).toMatch(/\[warn\] careful – detail\n/);
  });

  it('beginnt ab der Maximalgröße eine neue Datei und behält die alte als .old', () => {
    const logger = createLogger({ fileName: 'rotate.log', maxBytes: 50 });
    writeFileSync(join(dir, 'rotate.log'), 'x'.repeat(100));
    logger.info('after rotation');
    expect(existsSync(join(dir, 'rotate.log.old'))).toBe(true);
    expect(readFileSync(join(dir, 'rotate.log'), 'utf8')).toMatch(/after rotation/);
  });

  it('wirft nie, auch wenn die Datei nicht beschreibbar ist', () => {
    const logger = createLogger({ fileName: 'sub/<>:invalid?.log' });
    expect(() => logger.error('still fine', new Error('x'))).not.toThrow();
  });
});
