// T004: unit tests for insertRow, deleteRow, insertColumn, deleteColumn (FR-002, FR-004).
import { describe, expect, it } from 'vitest';
import { applyEdits } from '../../../../src/core/source/edits.ts';
import { parseSalt } from '../../../../src/core/salt/parser.ts';
import type { OpResult, Path } from '../../../../src/core/types.ts';
import { insertRow, deleteRow, insertColumn, deleteColumn } from '../../../../src/core/salt/ops/rows-columns.ts';
import type { ScreenDoc } from '../../../../src/core/salt/destinations.ts';

const block = (body: string): string => `@startsalt T\n{\n${body}\n}\n@endsalt\n`;
function doc(text: string): ScreenDoc {
  const r = parseSalt(text);
  expect(r.diagnostics).toEqual([]);
  return { text, model: r.model! };
}
const d = (body: string): ScreenDoc => doc(block(body));

function apply(document: ScreenDoc, op: OpResult): string {
  expect(op.ok, op.ok ? '' : (op as { messageKey: string }).messageKey).toBe(true);
  if (!op.ok) throw new Error('refused');
  const text = applyEdits(document.text, op.edits);
  const parsed = parseSalt(text);
  expect(parsed.diagnostics, text).toEqual([]);
  return text;
}

function refused(op: OpResult, key: string): void {
  expect(op.ok).toBe(false);
  if (!op.ok) expect(op.messageKey).toBe(key);
}

// ── insertRow ────────────────────────────────────────────────────────────────────────────────────

describe('insertRow', () => {
  it('inserts a row below the selected row in a two-row grid', () => {
    const document = d('A | B\nC | D');
    const op = insertRow(document, [0, 0]);
    expect(op.ok).toBe(true);
    const text = apply(document, op);
    const rows = parseSalt(text).model!.root.rows.filter((r) => r.type === 'cells');
    expect(rows).toHaveLength(3);
  });

  it('inserts a row in a single-row grid (does not block on one row — only delete is guarded)', () => {
    const document = d('A | B');
    const op = insertRow(document, [0, 0]);
    expect(op.ok).toBe(true);
    const text = apply(document, op);
    const rows = parseSalt(text).model!.root.rows.filter((r) => r.type === 'cells');
    expect(rows).toHaveLength(2);
  });
});

// ── deleteRow ────────────────────────────────────────────────────────────────────────────────────

describe('deleteRow', () => {
  it('deletes the selected row from a two-row grid', () => {
    const document = d('A | B\nC | D');
    const op = deleteRow(document, [0, 0]);
    expect(op.ok).toBe(true);
    const text = apply(document, op);
    const rows = parseSalt(text).model!.root.rows.filter((r) => r.type === 'cells');
    expect(rows).toHaveLength(1);
  });

  it('blocks delete when the grid has only one row', () => {
    const document = d('A | B');
    const op = deleteRow(document, [0, 0]);
    refused(op, 'screen.refuse.lastRow');
  });

  it('returns noRow for a null/empty path', () => {
    const document = d('A | B\nC | D');
    const op = deleteRow(document, null);
    refused(op, 'screen.refuse.noRow');
  });
});

// ── insertColumn ─────────────────────────────────────────────────────────────────────────────────

describe('insertColumn', () => {
  it('inserts a column to the right of the selected cell', () => {
    const document = d('A | B\nC | D');
    const path: Path = [0, 0];
    const op = insertColumn(document, path);
    expect(op.ok).toBe(true);
    const text = apply(document, op);
    const row = parseSalt(text).model!.root.rows[0]!;
    expect(row.type).toBe('cells');
    if (row.type === 'cells') expect(row.cells).toHaveLength(3);
  });

  it('inserts a column in a single-column grid', () => {
    const document = d('A\nB');
    const op = insertColumn(document, [0, 0]);
    expect(op.ok).toBe(true);
    const text = apply(document, op);
    const row = parseSalt(text).model!.root.rows[0]!;
    if (row.type === 'cells') expect(row.cells).toHaveLength(2);
  });
});

// ── deleteColumn ─────────────────────────────────────────────────────────────────────────────────

describe('deleteColumn', () => {
  it('deletes the selected column from a two-column grid', () => {
    const document = d('A | B\nC | D');
    const op = deleteColumn(document, [0, 0]);
    expect(op.ok).toBe(true);
    const text = apply(document, op);
    const row = parseSalt(text).model!.root.rows[0]!;
    if (row.type === 'cells') expect(row.cells).toHaveLength(1);
  });

  it('blocks delete when the grid has only one column', () => {
    const document = d('A\nB');
    const op = deleteColumn(document, [0, 0]);
    refused(op, 'screen.refuse.lastColumn');
  });

  it('returns noColumn for a path with no cell index', () => {
    const document = d('A | B\nC | D');
    const op = deleteColumn(document, null);
    refused(op, 'screen.refuse.noColumn');
  });
});
