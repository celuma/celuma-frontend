// Usage: node scripts/build_clinical_lexicon.mjs [--check]
//   (no flag)  regenerate src/lib/spelling/lexicon/clinical-es.dic from clinical-es.lexicon
//   --check    fail when the committed .dic differs from a fresh build (CI/pre-review)
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lexiconStats, parseLexicon, renderDic } from "./clinical_lexicon.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, "src/lib/spelling/lexicon");
const source = readFileSync(path.join(dir, "clinical-es.lexicon"), "utf8");
const sections = parseLexicon(source);
const dic = renderDic(sections);
const target = path.join(dir, "clinical-es.dic");

if (process.argv.includes("--check")) {
    let current = "";
    try { current = readFileSync(target, "utf8"); } catch { /* missing */ }
    if (current !== dic) {
        console.error("clinical-es.dic is out of date: run `node scripts/build_clinical_lexicon.mjs`");
        process.exit(1);
    }
} else {
    writeFileSync(target, dic);
}
const sha = (t) => createHash("sha256").update(t).digest("hex");
console.log(JSON.stringify({ sections: lexiconStats(sections), entries: sections.reduce((n, s) => n + s.entries.length, 0), lexiconSha256: sha(source), dicSha256: sha(dic) }, null, 2));
