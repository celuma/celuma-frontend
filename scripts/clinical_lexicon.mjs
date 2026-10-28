// Céluma 1.4 (#29 follow-up) — builds the clinical spelling supplement.
//
// `src/lib/spelling/lexicon/clinical-es.lexicon` is the reviewed SOURCE; the
// Hunspell word list `clinical-es.dic` is GENERATED from it by this module and
// never edited by hand (a unit test regenerates it and compares bytes). The
// module is pure (no I/O) so the same code serves the CLI below and the tests.

export const ALLOWED_FLAGS = new Set(["G", "S"]);
export const SECTION_CLASSES = new Set(["R", "T"]);
const ENTRY = /^(\p{L}+)(?:\/([A-Z]+))?$/u;

/** Parses the source text. Throws an Error naming the line for anything malformed. */
export function parseLexicon(text) {
    const sections = [];
    const seen = new Map();
    text.split(/\r?\n/).forEach((raw, index) => {
        const line = raw.trim();
        const where = `clinical-es.lexicon:${index + 1}`;
        if (!line || (line.startsWith("#") && !line.startsWith("##"))) return;
        if (line.startsWith("##")) {
            const [id, cls, ...desc] = line.slice(2).split("|").map((p) => p.trim());
            if (!id || !SECTION_CLASSES.has(cls) || !desc.join("|")) throw new Error(`${where}: section must be "## id | R|T | description"`);
            sections.push({ id, cls, description: desc.join("|"), entries: [] });
            return;
        }
        if (!sections.length) throw new Error(`${where}: entry before the first section`);
        if (line !== line.normalize("NFC")) throw new Error(`${where}: not NFC-normalized: ${line}`);
        const m = ENTRY.exec(line);
        if (!m) throw new Error(`${where}: not a lexical entry (letters and optional /FLAGS only): ${line}`);
        const [, lemma, flags = ""] = m;
        for (const f of flags) if (!ALLOWED_FLAGS.has(f)) throw new Error(`${where}: unsupported flag ${f} in ${line}`);
        if (new Set(flags).size !== flags.length) throw new Error(`${where}: repeated flag in ${line}`);
        if (seen.has(lemma)) throw new Error(`${where}: duplicate of line ${seen.get(lemma)}: ${lemma}`);
        seen.set(lemma, index + 1);
        sections[sections.length - 1].entries.push({ lemma, flags });
    });
    return sections;
}

/** Renders the Hunspell .dic (count line, then one entry per line, sorted, trailing newline). */
export function renderDic(sections) {
    const rows = sections.flatMap((s) => s.entries).map((e) => (e.flags ? `${e.lemma}/${e.flags}` : e.lemma));
    rows.sort((a, b) => a.localeCompare(b, "es", { sensitivity: "variant" }) || (a < b ? -1 : 1));
    return `${rows.length}\n${rows.join("\n")}\n`;
}

export function lexiconStats(sections) {
    return sections.map((s) => ({ id: s.id, class: s.cls, entries: s.entries.length }));
}
