import { CSV_COLUMNS } from '../validators/question.validators.js';

// Lets Excel read the file as UTF-8.
export const CSV_BOM = '﻿';

type ExportRow = {
  text: string;
  answerNotes: string;
  client: { name: string } | null;
  tags: Record<string, string[]>;
};

// The columns the import accepts, so an exported file can be imported again.
export const EXPORT_COLUMNS = CSV_COLUMNS.filter((c) => ['text', 'answer_notes', 'client', 'tags'].includes(c));

// Quotes the cell when needed. Cells that a spreadsheet would run as a formula are prefixed with
// a quote so they open as plain text.
function csvCell(value: string) {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

// { technology: ['react', 'typescript'], seniority: ['senior'] } -> "technology:react|typescript;seniority:senior"
function formatTags(tags: Record<string, string[]>) {
  return Object.entries(tags)
    .map(([category, slugs]) => `${category}:${slugs.join('|')}`)
    .join(';');
}

export function csvHeader() {
  return CSV_BOM + EXPORT_COLUMNS.join(',') + '\r\n';
}

export function csvRow(q: ExportRow) {
  const cells: Record<string, string> = {
    text: q.text,
    answer_notes: q.answerNotes,
    client: q.client?.name ?? '',
    tags: formatTags(q.tags),
  };
  return EXPORT_COLUMNS.map((c) => csvCell(cells[c] ?? '')).join(',') + '\r\n';
}
