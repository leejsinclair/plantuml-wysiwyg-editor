// T058: rows, columns and spans (VO-051 core, EC-03 column spans, VO-052 ragged rows untouched).
import { describe, expect, it } from 'vitest';
import { applyEdits } from '../../../../src/core/source/edits.ts';
import { parseSalt } from '../../../../src/core/salt/parser.ts';
import type { OpResult, Path } from '../../../../src/core/types.ts';
import type { ScreenDoc } from '../../../../src/core/salt/destinations.ts';
import { deleteColumn, deleteRow, insertColumn, insertRow } from '../../../../src/core/salt/ops/rows-columns.ts';
import { setSpan, spanInfo } from '../../../../src/core/salt/ops/span.ts';

const block = (body: string): string => `@startsalt T\n{\n${body}\n}\n@endsalt\n`;
function d(body: string): ScreenDoc {
  const text = block(body);
  const r = parseSalt(text);
  expect(r.diagnostics).toEqual([]);
  return { text, model: r.model! };
}
function apply(document: ScreenDoc, op: OpResult): { text: string; select: Path } {
  expect(op.ok, op.ok ? '' : op.messageKey).toBe(true);
  if (!op.ok) throw new Error('refused');
  const text = applyEdits(document.text, op.edits);
  expect(parseSalt(text).diagnostics, text).toEqual([]);
  return { text, select: op.select };
}

describe('spans (EC-03)', () => {
  it('is never offered on the first cell of a row', () => {
    const doc = d('  A | . | .');
    expect(spanInfo(doc.model, [0, 0])).toMatchObject({ offered: false });
    const op = setSpan(doc, [0, 0], 2);
    expect(op.ok).toBe(false);
    if (!op.ok) expect(op.messageKey).toBe('screen.refuse.spanFirstCell');
  });

  it('extends only over empty cells and names the limiting element', () => {
    const doc = d('  Name | "x    " | . | Password');
    expect(spanInfo(doc.model, [0, 1])).toEqual({ offered: true, current: 1, max: 2, limit: { kind: 'element', name: 'Password', column: 4 } });
    const r = apply(doc, setSpan(doc, [0, 1], 2));
    expect(r.text).toBe(block('  Name | "x    " | * | Password'));
  });

  it('is limited by the end of the row', () => {
    const doc = d('  A | B | .');
    expect(spanInfo(doc.model, [0, 1])).toEqual({ offered: true, current: 1, max: 2, limit: { kind: 'rowEnd' } });
  });

  it('is reduced to fit when set wider than allowed', () => {
    const doc = d('  A | B | . | C');
    const r = apply(doc, setSpan(doc, [0, 1], 5));
    expect(r.text).toBe(block('  A | B | * | C'));
  });

  it('narrows back to empty cells', () => {
    const doc = d('  A | B | * | *');
    const r = apply(doc, setSpan(doc, [0, 1], 1));
    expect(r.text).toBe(block('  A | B | . | .'));
  });
});

describe('rows and columns (FR-002/AC9)', () => {
  it('inserts an empty full-width row below the selection', () => {
    const doc = d('  A | B\n  C | D');
    const r = apply(doc, insertRow(doc, [0, 1]));
    expect(r.text).toBe(block('  A | B\n  . | .\n  C | D'));
    expect(r.select).toEqual([1, 1]);
  });

  it('deletes a row with its content and its comment', () => {
    const doc = d("  A | B\n  ' c\n  C | D\n  E | F");
    const r = apply(doc, deleteRow(doc, [1, 0]));
    expect(r.text).toBe(block('  A | B\n  E | F'));
    expect(r.select).toEqual([1, 0]);
  });

  it('inserts a column right of the selection in every row', () => {
    const doc = d('  A | B\n  C | D');
    const r = apply(doc, insertColumn(doc, [0, 0]));
    expect(r.text).toBe(block('  A | . | B\n  C | . | D'));
    expect(r.select).toEqual([0, 1]);
  });

  it('inserting a column inside a span extends the span; other rows get an empty cell', () => {
    const doc = d('  A | B | *\n  C | D | E');
    const r = apply(doc, insertColumn(doc, [1, 1]));
    expect(r.text).toBe(block('  A | B | * | *\n  C | D | . | E'));
  });

  it('inserts a column at the end of full-width rows only, leaving ragged rows untouched (VO-052)', () => {
    const doc = d('  A | B\n  C');
    const r = apply(doc, insertColumn(doc, [0, 1]));
    expect(r.text).toBe(block('  A | B | .\n  C'));
  });

  it('deleting the column a span starts from turns the rest of the span into empty cells', () => {
    const doc = d('  A | B | *\n  C | D | E');
    const r = apply(doc, deleteColumn(doc, [1, 1]));
    expect(r.text).toBe(block('  A | .\n  C | E'));
  });

  it('deleting a column crossed by a span narrows the span', () => {
    const doc = d('  A | B | * | F\n  C | D | E | G');
    const r = apply(doc, deleteColumn(doc, [1, 2]));
    expect(r.text).toBe(block('  A | B | F\n  C | D | G'));
  });

  it('deleting the first column never leaves a span in the first column', () => {
    const doc = d('  A | B | *\n  C | D | E');
    const r = apply(doc, deleteColumn(doc, [1, 0]));
    expect(r.text).toBe(block('  B | .\n  D | E'));
  });

  it('deleting a column leaves rows that do not reach it untouched (VO-052)', () => {
    const doc = d('  A | B | C\n  D');
    const r = apply(doc, deleteColumn(doc, [0, 2]));
    expect(r.text).toBe(block('  A | B\n  D'));
  });
});

describe('ragged rows (VO-052, EC-02)', () => {
  it('editing one row of a ragged grid leaves the other rows byte-identical', () => {
    const doc = d('  A | B | C\n  D\n  E | F');
    const r = apply(doc, insertRow(doc, [1, 0]));
    const before = doc.text.split('\n');
    const after = r.text.split('\n');
    expect(after.slice(0, 4)).toEqual(before.slice(0, 4));
    expect(after.slice(5)).toEqual(before.slice(4));
  });
});
