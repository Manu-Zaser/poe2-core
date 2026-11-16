export type Rarity = 'Normal' | 'Magic' | 'Rare' | 'Unique' | 'Currency' | 'Gem' | 'Unknown';

/** Strukturiertes Ergebnis aus dem Strg+C-Text eines Items. */
export interface ParsedItem {
  itemClass: string;
  rarity: Rarity;
  /** Eigenname (nur bei Rare/Unique, sofern identifiziert). */
  name?: string;
  baseType: string;
  itemLevel?: number;
  quality?: number;
  /** Gemmen und ungeschliffene Gemmen: Stufe aus der Zeile "Level: 18". */
  gemLevel?: number;
  stackSize?: number;
  corrupted: boolean;
  unidentified: boolean;
  /** Textblöcke zwischen den "--------"-Trennern (ohne Kopfblock). */
  sections: string[][];
  /** Tier/Präfix-Infos je Mod-Zeile (nur beim erweiterten Kopieren vorhanden). */
  modMeta?: ModMeta[];
}

export interface ModMeta {
  /** Mod-Zeile genau wie im Kopiertext (inkl. Wertebereich). */
  line: string;
  affix: 'prefix' | 'suffix' | 'implicit' | 'other';
  /** Tier laut Spiel; in PoE2 ist höher = besser. */
  tier?: number;
  name?: string;
}
