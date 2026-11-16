import { beforeEach, describe, expect, it, vi } from 'vitest';

// Zwischenablage und Fenster werden komplett simuliert – kein echtes Strg+Alt+C, keine echte Zwischenablage.
const state = { clipboard: 'previous text', foreground: 'Path of Exile 2', handle: 1n, copies: 0, focusCalls: 0, copyResult: 'Item Class: Rings' };

vi.mock('electron', () => ({
  clipboard: {
    readText: async () => state.clipboard,
    writeText: async (t: string) => {
      state.clipboard = t;
    },
  },
}));

vi.mock('../src/win32', () => ({
  foregroundWindowTitle: () => state.foreground,
  foregroundWindowHandle: () => state.handle,
  focusWindowByTitle: (title: string) => {
    state.focusCalls++;
    state.foreground = title;
    return true;
  },
  sendCopy: () => {
    state.copies++;
    // Das Spiel legt den Item-Text kurz darauf in die Zwischenablage.
    setTimeout(() => (state.clipboard = state.copyResult), 15);
  },
}));

const { readItemText } = await import('../src/clipboard');
const opts = (own = false) => ({ gameTitle: 'Path of Exile 2', isOwnWindowInFront: () => own });

describe('readItemText', () => {
  beforeEach(() => {
    Object.assign(state, { clipboard: 'previous text', foreground: 'Path of Exile 2', handle: 1n, copies: 0, focusCalls: 0 });
  });

  it('kopiert genau einmal, liefert den Item-Text und stellt die alte Zwischenablage wieder her', async () => {
    expect(await readItemText(opts())).toBe('Item Class: Rings');
    expect(state.copies).toBe(1);
    await new Promise((r) => setTimeout(r, 5));
    expect(state.clipboard).toBe('previous text');
  });

  it('liest ohne Spiel im Vordergrund nur die aktuelle Zwischenablage (kein Kopieren)', async () => {
    state.foreground = 'Notepad';
    const log = vi.fn();
    expect(await readItemText({ ...opts(), log })).toBe('previous text');
    expect(state.copies).toBe(0);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('without the game in front'));
  });

  it('holt das Spiel zurück nach vorne, wenn das eigene Overlay den Fokus hat', async () => {
    state.foreground = 'PoE2 Price Check';
    expect(await readItemText(opts(true))).toBe('Item Class: Rings');
    expect(state.focusCalls).toBe(1);
    expect(state.copies).toBe(1);
  });

  it('gibt nach der Wartezeit leeren Text zurück, wenn das Spiel nichts kopiert', async () => {
    state.copyResult = '';
    expect(await readItemText({ ...opts(), timeoutMs: 60 })).toBe('');
    state.copyResult = 'Item Class: Rings';
  });
});
