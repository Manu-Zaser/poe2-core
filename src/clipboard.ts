/**
 * Item-Text aus dem Spiel holen – genau EINE Aktion pro Tastendruck (GGG-Regel):
 * Ist PoE2 vorne, wird einmal Strg+Alt+C gesendet und auf den neuen Inhalt gewartet; danach wird
 * die vorherige Zwischenablage wiederhergestellt. Ist das Spiel nicht vorne (z. B. beim Testen mit
 * einem von Hand kopierten Item), wird nur die aktuelle Zwischenablage gelesen.
 */
import { clipboard } from 'electron';
import { focusWindowByTitle, foregroundWindowHandle, foregroundWindowTitle, sendCopy } from './win32';

export interface ReadItemOptions {
  /** Fenstertitel des Spiels, z. B. "Path of Exile 2". */
  gameTitle: string;
  /** true, wenn gerade ein eigenes Fenster vorne ist (z. B. nach einem Klick ins Overlay). */
  isOwnWindowInFront: () => boolean;
  /** Optionale Protokollierung (Englisch, landet im Log der App). */
  log?: (message: string) => void;
  /** Wie lange auf den kopierten Text gewartet wird (Standard 500 ms). */
  timeoutMs?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function readItemText(opts: ReadItemOptions): Promise<string> {
  let inGame = foregroundWindowTitle() === opts.gameTitle;

  // Hat gerade ein eigenes Fenster den Fokus – oder ist gar kein Fenster vorne –, erst das Spiel
  // nach vorne holen (ein Fensterwechsel, keine Eingabe ans Spiel). Sonst würde nur die alte
  // Zwischenablage gelesen.
  const noForeground = foregroundWindowHandle() === 0n;
  if (!inGame && (noForeground || opts.isOwnWindowInFront()) && focusWindowByTitle(opts.gameTitle)) {
    for (let waited = 0; waited < 300 && !inGame; waited += 20) {
      await sleep(20);
      inGame = foregroundWindowTitle() === opts.gameTitle;
    }
    opts.log?.(`Hotkey while ${noForeground ? 'no window' : 'our window'} was in front – game brought back${inGame ? '' : ' (failed)'}`);
  }

  if (!inGame) {
    opts.log?.(`Hotkey without the game in front ("${foregroundWindowTitle()}") – reading the current clipboard`);
    return clipboard.readText();
  }

  const previous = await clipboard.readText();
  await clipboard.writeText('');
  sendCopy();

  let text = '';
  const timeout = opts.timeoutMs ?? 500;
  // Engmaschig abfragen: PoE2 legt den Text meist nach wenigen Millisekunden ab.
  for (let waited = 0; waited < timeout && !text; waited += 10) {
    await sleep(10);
    text = await clipboard.readText();
  }
  void clipboard.writeText(previous); // Wiederherstellen muss den Preischeck nicht aufhalten
  return text;
}
