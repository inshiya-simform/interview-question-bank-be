import { randomUUID } from 'node:crypto';
import { CsvError, parse } from 'csv-parse/sync';
import { prisma } from '../db/prisma.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/express.js';
import { AppError } from '../utils/AppError.js';
import { normalizeText } from '../utils/normalize.js';
import {
  CSV_COLUMNS,
  CSV_REQUIRED_COLUMNS,
  MAX_IMPORT_ROWS,
  csvQuestionRowSchema,
} from '../validators/question.validators.js';
import { recordAudit } from './audit.service.js';
import { findDuplicates } from './question.service.js';

type RowError = { row: number; column?: string; message: string };

export const IMPORT_TEMPLATE =
  CSV_COLUMNS.join(',') +
  '\n' +
  '"What is the difference between interface and type in TypeScript?","Interfaces can be extended and merged; type aliases can name unions and primitives.",,technology:typescript;seniority:junior,,\n';

function parseCsv(buffer: Buffer): Record<string, string>[] {
  let header: string[] = [];
  let records: Record<string, string>[];
  try {
    records = parse(buffer, {
      columns: (h: string[]) => (header = h.map((c) => c.trim())),
      bom: true,
      skip_empty_lines: true,
      trim: true,
    });
  } catch (err) {
    if (err instanceof CsvError) {
      throw new AppError(400, 'VALIDATION_ERROR', `Malformed CSV: ${err.message}`);
    }
    throw err;
  }

  const unknown = header.filter((c) => !(CSV_COLUMNS as readonly string[]).includes(c));
  const missing = CSV_REQUIRED_COLUMNS.filter((c) => !header.includes(c));
  if (unknown.length > 0 || missing.length > 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid CSV header', [
      ...unknown.map((c) => ({ row: 1, column: c, message: 'Unknown column' })),
      ...missing.map((c) => ({ row: 1, column: c, message: 'Required column is missing' })),
    ]);
  }
  if (records.length === 0) throw new AppError(400, 'VALIDATION_ERROR', 'The CSV has no data rows');
  if (records.length > MAX_IMPORT_ROWS) {
    throw new AppError(400, 'VALIDATION_ERROR', `Too many rows: at most ${MAX_IMPORT_ROWS} per import`);
  }
  return records;
}

// category slug -> { id, tags: tag slug -> id }
async function loadTagLookup() {
  // with the help of include: { tags: true }, we can get all the tags for each category in a single query, which is more efficient than querying them separately.
  const categories = await prisma.tagCategory.findMany({ include: { tags: true } });
  return new Map(
    categories.map((c) => [c.slug, { id: c.id, tags: new Map(c.tags.map((t) => [t.slug, t.id])) }]),
  );
}

// Only clients the user holds a grant on; any other name is reported as unknown.
async function loadClientLookup(user: AuthUser) {
  const clients = await prisma.client.findMany({
    where: { id: { in: user.clientIds } },
    select: { id: true, name: true },
  });
  return new Map(clients.map((c) => [c.name.toLowerCase(), c.id]));
}

type TagLookup = Awaited<ReturnType<typeof loadTagLookup>>;

// "technology:react|typescript;seniority:senior" -> [{ categoryId, tagIds }]
function resolveTags(cell: string, lookup: TagLookup, fail: (message: string) => void) {
  const selections = new Map<number, Set<number>>();
  for (const part of cell.split(';').map((p) => p.trim()).filter(Boolean)) {
    const [categorySlug, tagList, ...rest] = part.split(':').map((s) => s.trim());
    if (!categorySlug || !tagList || rest.length > 0) {
      fail(`Invalid tag group "${part}", expected category:tag|tag`);
      continue;
    }
    const category = lookup.get(categorySlug);
    if (!category) {
      fail(`Unknown tag category "${categorySlug}"`);
      continue;
    }
    if (selections.has(category.id)) {
      fail(`Category "${categorySlug}" appears more than once`);
      continue;
    }
    const ids = new Set<number>();
    for (const slug of tagList.split('|').map((s) => s.trim()).filter(Boolean)) {
      const tagId = category.tags.get(slug);
      if (tagId === undefined) fail(`Unknown tag "${slug}" in category "${categorySlug}"`);
      else ids.add(tagId);
    }
    selections.set(category.id, ids);
  }
  return [...selections].map(([categoryId, tagIds]) => ({ categoryId, tagIds: [...tagIds] }));
}

type ValidRow = {
  text: string;
  answerNotes: string;
  clientId: string | null;
  tags: { categoryId: number; tagIds: number[] }[];
  duplicateOverride?: { matchedIds: string[]; reason: string };
};

// All-or-nothing: every row is validated first, and nothing is stored if any row is invalid.
// Imported questions always start as PENDING_REVIEW, exactly like createQuestion.
export async function importQuestions(user: AuthUser, buffer: Buffer) {
  const records = parseCsv(buffer);
  const [tagLookup, clientLookup] = await Promise.all([loadTagLookup(), loadClientLookup(user)]);

  const errors: RowError[] = [];
  const rows: { row: number; data: ValidRow; confirmDistinct: boolean }[] = [];
  const seen = new Map<string, number>(); // normalized text -> first row it appeared in

  records.forEach((record, i) => {
    const row = i + 2; // the header is row 1
    const parsed = csvQuestionRowSchema.safeParse(record);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        errors.push({ row, column: String(issue.path[0] ?? ''), message: issue.message });
      }
      return;
    }
    const cells = parsed.data;
    const rowErrors = errors.length;
    const fail = (column: string) => (message: string) => errors.push({ row, column, message });

    let clientId: string | null = null;
    if (cells.client) {
      clientId = clientLookup.get(cells.client.toLowerCase()) ?? null;
      if (!clientId) fail('client')(`Unknown client "${cells.client}"`);
    }
    const tags = resolveTags(cells.tags, tagLookup, fail('tags'));
    const confirmDistinct = cells.confirm_distinct === 'true';
    if (confirmDistinct && !cells.distinct_reason) {
      fail('distinct_reason')('Required when confirm_distinct is true');
    }

    const normalized = normalizeText(cells.text);
    const firstRow = seen.get(normalized);
    if (firstRow !== undefined && !confirmDistinct) {
      fail('text')(`Same as row ${firstRow}; set confirm_distinct to true and give a distinct_reason to keep both`);
    }
    if (firstRow === undefined) seen.set(normalized, row);

    if (errors.length > rowErrors) return;
    rows.push({
      row,
      confirmDistinct,
      data: {
        text: cells.text,
        answerNotes: cells.answer_notes,
        clientId,
        tags,
        ...(confirmDistinct && { duplicateOverride: { matchedIds: [], reason: cells.distinct_reason! } }),
      },
    });
  });

  // Near-duplicates of existing questions, in small parallel batches.
  const BATCH = 10;
  for (let i = 0; i < rows.length; i += BATCH) {
    await Promise.all(
      rows.slice(i, i + BATCH).map(async (r) => {
        const matches = await findDuplicates(user, r.data.text);
        if (matches.length === 0) return;
        if (!r.confirmDistinct) {
          errors.push({
            row: r.row,
            column: 'text',
            message: `Looks like an existing question ("${matches[0]!.text}"); set confirm_distinct to true and give a distinct_reason to import it anyway`,
          });
        } else if (r.data.duplicateOverride) {
          r.data.duplicateOverride.matchedIds = matches.map((m) => m.id);
        }
      }),
    );
  }

  if (errors.length > 0) {
    errors.sort((a, b) => a.row - b.row);
    throw new AppError(400, 'VALIDATION_ERROR', 'The CSV has invalid rows; nothing was imported', errors);
  }

  const items = rows.map((r) => ({ id: randomUUID(), ...r.data }));
  await prisma.$transaction(async (tx) => {
    await tx.question.createMany({
      data: items.map((q) => ({
        id: q.id,
        text: q.text,
        normalizedText: normalizeText(q.text),
        answerNotes: q.answerNotes,
        clientId: q.clientId,
        authorId: user.id,
      })),
    });
    await tx.questionTag.createMany({
      data: items.flatMap((q) =>
        q.tags.flatMap(({ categoryId, tagIds }) => tagIds.map((tagId) => ({ questionId: q.id, tagId, categoryId }))),
      ),
    });
    await tx.questionHistory.createMany({
      data: items.map((q) => ({
        questionId: q.id,
        actorId: user.id,
        action: 'CREATED' as const,
        changes: {
          text: q.text,
          answerNotes: q.answerNotes,
          clientId: q.clientId,
          tags: q.tags,
          source: 'csv_import',
          ...(q.duplicateOverride && { duplicateOverride: q.duplicateOverride }),
        } satisfies Prisma.InputJsonObject,
      })),
    });
    await recordAudit(tx, {
      action: 'IMPORT',
      module: 'QUESTION',
      actor: user,
      changes: { count: items.length, questionIds: items.map((q) => q.id) },
    });
  });

  console.info(JSON.stringify({ event: 'questions_imported', userId: user.id, count: items.length }));
  return { imported: items.length, questions: items.map((q) => ({ id: q.id, text: q.text })) };
}
