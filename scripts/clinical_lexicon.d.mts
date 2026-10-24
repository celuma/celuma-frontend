export interface LexiconEntry { lemma: string; flags: string }
export interface LexiconSection { id: string; cls: "R" | "T"; description: string; entries: LexiconEntry[] }
export const ALLOWED_FLAGS: Set<string>;
export const SECTION_CLASSES: Set<string>;
export function parseLexicon(text: string): LexiconSection[];
export function renderDic(sections: LexiconSection[]): string;
export function lexiconStats(sections: LexiconSection[]): Array<{ id: string; class: string; entries: number }>;
