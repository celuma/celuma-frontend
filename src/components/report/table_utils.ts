export function parseMarkdownTable(md: string): { headers: string[]; rows: string[][] } {
    const lines = (md || "").trim().split("\n");
    const isSep = (l: string) => /^\|[\s|:_-]+\|$/.test(l.trim());
    const parseCells = (l: string) => l.split("|").slice(1, -1).map((c) => c.trim());
    const dataLines = lines.filter((l) => l.trim() && !isSep(l));
    if (dataLines.length === 0) return { headers: ["Col 1"], rows: [[""]] };
    const headers = parseCells(dataLines[0]);
    const rows = dataLines.slice(1).map(parseCells);
    return {
        headers: headers.length > 0 ? headers : ["Col 1"],
        rows:    rows.length > 0    ? rows    : [headers.map(() => "")],
    };
}

export function serializeMarkdownTable(headers: string[], rows: string[][]): string {
    const cell  = (s: string) => ` ${s || " "} `;
    const hRow  = `|${headers.map(cell).join("|")}|`;
    const sep   = `|${headers.map(() => " --- ").join("|")}|`;
    const dRows = rows.map(
        (row) => `|${headers.map((_, i) => cell(row[i] ?? "")).join("|")}|`
    );
    return [hRow, sep, ...dRows].join("\n");
}

/**
 * Converts a markdown table string to an HTML table string with inline styles,
 * suitable for rendering in previews and PDF exports.
 */
export function markdownTableToHtml(md: string): string {
    const { headers, rows } = parseMarkdownTable(md);
    const thStyle = 'style="border:1px solid #d1d5db;padding:6px 10px;background:#f3f4f6;font-weight:600;text-align:left;font-size:9pt;"';
    const tdStyle = 'style="border:1px solid #d1d5db;padding:5px 10px;font-size:9pt;"';
    const headerRow = `<tr>${headers.map((h) => `<th ${thStyle}>${h}</th>`).join("")}</tr>`;
    const bodyRows = rows
        .map((row) => `<tr>${headers.map((_, i) => `<td ${tdStyle}>${row[i] ?? ""}</td>`).join("")}</tr>`)
        .join("");
    return `<table style="border-collapse:collapse;width:100%;margin-bottom:8px;">${headerRow}${bodyRows}</table>`;
}
