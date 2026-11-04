// T062: the screen operations through the command-line oracle (plantuml-1.2026.9.jar).
// - VO-051: row, column and span operations render, with every column's cells aligned.
// - Every palette item and preset renders, with its placeholder text shown.
// - VO-007: command-word and syntax-like first cells written through the operations appear in the render as typed.
import { beforeAll, describe, expect, it } from 'vitest';
import { applyEdits } from '../../src/core/source/edits.ts';
import { parseSalt } from '../../src/core/salt/parser.ts';
import type { OpResult } from '../../src/core/types.ts';
import type { ScreenDoc } from '../../src/core/salt/destinations.ts';
import { insert } from '../../src/core/salt/ops/insert.ts';
import { PALETTE_ITEMS } from '../../src/core/salt/ops/presets.ts';
import { setProperty } from '../../src/core/salt/ops/properties.ts';
import { deleteColumn, deleteRow, insertColumn, insertRow } from '../../src/core/salt/ops/rows-columns.ts';
import { setSpan } from '../../src/core/salt/ops/span.ts';
import { move, moveByKey } from '../../src/core/salt/ops/move.ts';
import { remove } from '../../src/core/salt/ops/remove.ts';
import { wrap } from '../../src/core/salt/ops/wrap.ts';
import { renderBlocks, svgHasText, type OracleResult } from './runner.ts';

const block = (body: string): string => `@startsalt T\n{\n${body}\n}\n@endsalt\n`;
function doc(text: string): ScreenDoc {
  const r = parseSalt(text);
  expect(r.diagnostics, text).toEqual([]);
  return { text, model: r.model! };
}
function run(d: ScreenDoc, op: OpResult): ScreenDoc {
  expect(op.ok, op.ok ? '' : op.messageKey).toBe(true);
  if (!op.ok) throw new Error('refused');
  return doc(applyEdits(d.text, op.edits));
}

/** Fills an empty cell with text through the palette and the properties. */
function put(d: ScreenDoc, path: number[], text: string): ScreenDoc {
  const withText = run(d, insert(d, path, { item: 'Text' }));
  return run(withText, setProperty(withText, path, 'text', text));
}

/** The x position of each `<text>` run, by its text. */
function xOf(svg: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const m of svg.matchAll(/<text x="([\d.]+)"[^>]*>([^<]*)<\/text>/g)) out.set(m[2]!, Number(m[1]));
  return out;
}

interface Case {
  name: string;
  text: string;
  /** Texts that must be shown. */
  shows: string[];
  /** Groups of texts that must share a column (the same x). */
  columns?: string[][];
}

const cases: Case[] = [];

// ------------------------------------------------------------------- rows, columns and spans (VO-051)
{
  const base = doc(block('  A1 | B1 | C1\n  A2 | B2 | C2'));
  const withRow = run(base, insertRow(base, [0, 1]));
  const filled = put(withRow, [1, 1], 'R1');
  cases.push({ name: 'insert a row', text: filled.text, shows: ['A1', 'R1', 'C2'], columns: [['B1', 'R1', 'B2']] });

  const withCol = run(base, insertColumn(base, [0, 0]));
  const named = put(withCol, [0, 1], 'N1');
  cases.push({ name: 'insert a column', text: named.text, shows: ['N1'], columns: [['A1', 'A2'], ['B1', 'B2'], ['C1', 'C2']] });

  const spanBase = doc(block('  A1 | B1 | .\n  A2 | B2 | C2'));
  const spanned = run(spanBase, setSpan(spanBase, [0, 1], 2));
  cases.push({ name: 'set a span', text: spanned.text, shows: ['B1', 'C2'], columns: [['A1', 'A2'], ['B1', 'B2']] });

  const inside = run(spanned, insertColumn(spanned, [1, 1]));
  const insideNamed = put(inside, [1, 2], 'X2');
  cases.push({ name: 'insert a column inside a span', text: insideNamed.text, shows: ['X2', 'C2'], columns: [['A1', 'A2'], ['B1', 'B2']] });

  const delStart = run(spanned, deleteColumn(spanned, [1, 1]));
  cases.push({ name: 'delete the column a span starts from', text: delStart.text, shows: ['A1', 'C2'], columns: [['A1', 'A2']] });

  const delFirst = run(spanned, deleteColumn(spanned, [1, 0]));
  cases.push({ name: 'delete the first column', text: delFirst.text, shows: ['B1', 'B2'], columns: [['B1', 'B2']] });

  const delRow = run(base, deleteRow(base, [0, 0]));
  cases.push({ name: 'delete a row', text: delRow.text, shows: ['A2', 'C2'] });

  const removed = run(base, remove(base, [0, 1]));
  cases.push({ name: 'remove leaves an empty cell', text: removed.text, shows: ['C1'], columns: [['A1', 'A2'], ['C1', 'C2']] });

  const swapped = run(base, moveByKey(base, [0, 0], 'down'));
  cases.push({ name: 'keyboard move swaps cells', text: swapped.text, shows: ['A1', 'A2'], columns: [['A2', 'A1']] });

  const moved = run(spanned, move(spanned, [0, 0], { kind: 'end', container: [] }));
  cases.push({ name: 'move to the end of a multi grid', text: moved.text, shows: ['A1', 'B1'] });

  const wrapped = run(base, wrap(base, [1, 2], 'group box'));
  cases.push({ name: 'wrap in a group box', text: wrapped.text, shows: ['Group', 'C2'] });
}

// ------------------------------------------------------------------- every palette item and preset
for (const item of PALETTE_ITEMS) {
  const d = doc(block('  Start'));
  const r = run(d, insert(d, null, { item }));
  const shows: Record<string, string[]> = {
    Text: ['Text'],
    'Text area': ['Line 1', 'Line 3'],
    Button: ['Button'],
    Checkbox: ['Checkbox'],
    'Radio button': ['Option'],
    'Drop-down': ['Select'],
    Row: ['Item 1', 'Item 2'],
    Column: ['Item 1', 'Item 2'],
    Form: ['Label'],
    'Button bar': ['Button 1', 'Button 2'],
    Table: ['Column 1', 'Column 2'],
    'Group box': ['Group', 'Text'],
    Tree: ['Item 1', 'Item 1.1', 'Item 2'],
    'Tab bar': ['Tab 1', 'Tab 2'],
    'Menu bar': ['File', 'Edit', 'Help'],
    'Scrollable area': ['Text'],
  };
  cases.push({ name: `palette: ${item}`, text: r.text, shows: ['Start', ...(shows[item] ?? [])] });
}

// ------------------------------------------------------------------- command words and syntax as first cells (VO-007)
for (const typed of ['Title', '{', '|', '**', 'Legend', 'Header 1', '[x]']) {
  const d = doc(block('  Start'));
  const inserted = run(d, insert(d, null, { item: 'Text' }));
  const named = run(inserted, setProperty(inserted, [1, 0], 'text', typed));
  cases.push({ name: `first cell ${JSON.stringify(typed)} written by an operation`, text: named.text, shows: ['Start', typed] });

  // A text that becomes a first cell by a later operation is re-escaped.
  const pair = doc(block('  [Go] | x'));
  const second = run(pair, setProperty(pair, [0, 1], 'text', typed));
  const first = run(second, remove(second, [0, 0]));
  cases.push({ name: `cell ${JSON.stringify(typed)} that becomes first`, text: first.text, shows: [typed] });
}

let results: OracleResult[] = [];
beforeAll(async () => {
  results = await renderBlocks(cases.map((c) => c.text));
});

describe('screen operations render in the command-line oracle (VO-051, VO-007, FR-001/AC5)', () => {
  cases.forEach((c, i) => {
    it(c.name, () => {
      const r = results[i]!;
      expect(r.ok, `${c.text}\n${r.message}`).toBe(true);
      for (const s of c.shows) expect(svgHasText(r.svg, s), `${s} in\n${c.text}`).toBe(true);
      expect(r.svg).not.toMatch(/&lt;U\+|<U\+/);
      const x = xOf(r.svg);
      for (const group of c.columns ?? []) {
        const xs = group.map((t) => x.get(t));
        expect(xs.every((v) => v !== undefined), `${group} in\n${c.text}`).toBe(true);
        expect(Math.max(...(xs as number[])) - Math.min(...(xs as number[])), `${group} aligned in\n${c.text}`).toBeLessThan(1.5);
      }
    });
  });
});
