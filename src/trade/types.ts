/** Eintrag der Stat-Liste der Trade-Suche (/api/trade2/data/stats). */
export interface StatEntry { id: string; text: string; type: string }
export interface StatsData { result: { id: string; label: string; entries: StatEntry[] }[] }
