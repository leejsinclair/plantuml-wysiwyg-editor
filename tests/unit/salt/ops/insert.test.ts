// T055: insert and presets (VO-047 insertion point for every selection kind, EC-04 1 × 1 grids, VO-002 core,
// VO-065 house style for every new element, VO-008 core preset labels after a re-parse).
import { describe, expect, it } from 'vitest';
import { applyEdits } from '../../../../src/core/source/edits.ts';
import { parseSalt } from '../../../../src/core/salt/parser.ts';
import type { Grid, SaltScreen } from '../../../../src/core/salt/model.ts';
import type { OpResult, Path } from '../../../../src/core/types.ts';
import { insert } from '../../../../src/core/salt/ops/insert.ts';
import { PALETTE_ITEMS, elementSource, type PaletteItem } from '../../../../src/core/salt/ops/presets.ts';
import { locate, type ScreenDoc } from '../../../../src/core/salt/destinations.ts';
import { gridLabel } from '../../../../src/core/salt/labels.ts';

const block = (body: string): string => `@startsalt T\n{\n${body}\n}\n@endsalt\n`;
function doc(text: string): ScreenDoc {
  const r = parseSalt(text);
  expect(r.diagnostics).toEqual([]);
  return { text, model: r.model! };
}
const d = (body: string): ScreenDoc => doc(block(body));

function apply(document: ScreenDoc, op: OpResult): { text: string; model: SaltScreen; select: Path } {
  expect(op.ok, op.ok ? '' : op.messageKey).toBe(true);
  if (!op.ok) throw new Error('refused');
  const text = applyEdits(document.text, op.edits);
  const parsed = parseSalt(text);
  expect(parsed.diagnostics, text).toEqual([]);
  return { text, model: parsed.model!, select: op.select };
}

describe('insert: insertion point (VO-047, section 3.2)', () => {
  it('after the selected element along a single-row grid (VO-002 core)', () => {
    const r = apply(d('  [OK] | [Cancel] | [Help]'), insert(d('  [OK] | [Cancel] | [Help]'), [0, 0], { item: 'Button' }));
    expect(r.text).toBe(block('  [OK] | [Button] | [Cancel] | [Help]'));
    expect(r.select).toEqual([0, 1]);
    const el = locate(r.model, r.select);
    expect(el?.kind === 'cell' && el.cell.content.type).toBe('button');
  });

  it('after the selected element along a single-column grid, as a new row', () => {
    const doc1 = d('  Name\n  "          "\n  [OK]');
    const r = apply(doc1, insert(doc1, [1, 0], { item: 'Checkbox' }));
    expect(r.text).toBe(block('  Name\n  "          "\n  [ ] Checkbox\n  [OK]'));
    expect(r.select).toEqual([2, 0]);
  });

  it('a 1 × 1 grid grows down (EC-04)', () => {
    const doc1 = d('  Name');
    const r = apply(doc1, insert(doc1, [0, 0], { item: 'Text field' }));
    expect(r.text).toBe(block('  Name\n  "          "'));
    expect(r.select).toEqual([1, 0]);
  });

  it('a 1 × 1 grid whose only element is a button grows across (EC-04)', () => {
    const doc1 = d('  [OK]');
    const r = apply(doc1, insert(doc1, [0, 0], { item: 'Button' }));
    expect(r.text).toBe(block('  [OK] | [Button]'));
    expect(r.select).toEqual([0, 1]);
  });

  it('in a multi-row multi-column grid: a full-width row below, in the selected column, empty elsewhere', () => {
    const doc1 = d('  A | B | C\n  D | E | F');
    const r = apply(doc1, insert(doc1, [0, 1], { item: 'Button' }));
    expect(r.text).toBe(block('  A | B | C\n  . | [Button] | .\n  D | E | F'));
    expect(r.select).toEqual([1, 1]);
  });

  it('into a selected empty cell, which is never left occupied twice', () => {
    const doc1 = d('  A | .\n  C | D');
    const r = apply(doc1, insert(doc1, [0, 1], { item: 'Button' }));
    expect(r.text).toBe(block('  A | [Button]\n  C | D'));
    expect(r.select).toEqual([0, 1]);
  });

  it('as the last child of a selected container', () => {
    const doc1 = d('  {\n    A\n    B\n  }');
    const r = apply(doc1, insert(doc1, [0, 0], { item: 'Text' }));
    expect(r.text).toBe(block('  {\n    A\n    B\n    Text\n  }'));
    expect(r.select).toEqual([0, 0, 2, 0]);
  });

  it('as the last child of a selected single-row container', () => {
    const doc1 = d('  { [A] | [B] }');
    const r = apply(doc1, insert(doc1, [0, 0], { item: 'Button' }));
    expect(r.text).toBe(block('  { [A] | [B] | [Button] }'));
    expect(r.select).toEqual([0, 0, 0, 2]);
  });

  it('in a selected multi-row multi-column container: a full-width row at the bottom, first column', () => {
    const doc1 = d('  A | B\n  C | D');
    const r = apply(doc1, insert(doc1, [], { item: 'Checkbox' }));
    expect(r.text).toBe(block('  A | B\n  C | D\n  [ ] Checkbox | .'));
    expect(r.select).toEqual([2, 0]);
  });

  it('at the end of the root grid when nothing is selected', () => {
    const doc1 = d('  A\n  B');
    const r = apply(doc1, insert(doc1, null, { item: 'Text' }));
    expect(r.text).toBe(block('  A\n  B\n  Text'));
    expect(r.select).toEqual([2, 0]);
  });

  it('into an empty screen (FR-001/AC7)', () => {
    const empty = doc('@startsalt Screen-1\n{\n}\n@endsalt\n');
    const r = apply(empty, insert(empty, null, { item: 'Button' }));
    expect(r.text).toBe('@startsalt Screen-1\n{\n  [Button]\n}\n@endsalt\n');
    expect(r.select).toEqual([0, 0]);
  });

  it('a separator always takes its own row', () => {
    const doc1 = d('  A\n  B');
    const r = apply(doc1, insert(doc1, [0, 0], { item: 'Separator' }));
    expect(r.text).toBe(block('  A\n  --\n  B'));
    expect(r.select).toEqual([1]);
  });

  it('keeps CRLF line endings', () => {
    const text = '@startsalt T\r\n{\r\n  A\r\n}\r\n@endsalt\r\n';
    const doc1 = doc(text);
    const r = apply(doc1, insert(doc1, null, { item: 'Form' }));
    expect(r.text).not.toMatch(/[^\r]\n/);
  });

  it('refuses a selection that does not exist', () => {
    const doc1 = d('  A');
    const op = insert(doc1, [4, 0], { item: 'Text' });
    expect(op.ok).toBe(false);
  });

  it('escapes placeholder text written as a row first cell', () => {
    const doc1 = d('  A');
    const r = apply(doc1, insert(doc1, null, { item: 'Text' }));
    const el = locate(r.model, r.select);
    expect(el?.kind === 'cell' && el.cell.content.type === 'text' && el.cell.content.text.text).toBe('Text');
  });
});

describe('insert: house style for every new element (VO-065)', () => {
  const expected: Record<PaletteItem, string> = {
    Text: 'Text',
    Separator: '--',
    Spacing: '.',
    'Text field': '"          "',
    'Text area': '{+\n    Line 1\n    Line 2\n    Line 3\n  }',
    Button: '[Button]',
    Checkbox: '[ ] Checkbox',
    'Radio button': '( ) Option',
    'Drop-down': '^Select^',
    Grid: '{\n    . | .\n    . | .\n  }',
    Row: '{\n    Item 1 | Item 2\n  }',
    Column: '{\n    Item 1\n    Item 2\n  }',
    Form: '{\n    Label | "          "\n    Label | "          "\n  }',
    'Button bar': '{\n    [Button 1] | [Button 2]\n  }',
    Table: '{#\n    Column 1 | Column 2\n    . | .\n  }',
    'Group box': '{^"Group"\n    Text\n  }',
    Tree: '{T\n    + Item 1\n    ++ Item 1.1\n    + Item 2\n  }',
    'Tab bar': '{/ <b>Tab 1 | Tab 2 }',
    'Menu bar': '{* File | Edit | Help }',
    'Scrollable area': '{S\n    Text\n  }',
  };

  for (const item of PALETTE_ITEMS) {
    it(`${item} is written in the house style and parses as one element`, () => {
      expect(elementSource({ item }, { indent: '  ', eol: '\n', firstCellOfRow: true })).toBe(expected[item]);
      const doc1 = d('  A');
      const r = apply(doc1, insert(doc1, null, { item }));
      expect(r.text).toBe(block(`  A\n  ${expected[item]}`));
    });
  }

  it('Grid asks for rows and columns and inserts empty cells', () => {
    expect(elementSource({ item: 'Grid', rows: 1, columns: 3 }, { indent: '', eol: '\n', firstCellOfRow: true })).toBe('{\n  . | . | .\n}');
  });
});

describe('insert: presets keep their label after a re-parse (VO-008 core, FR-002/AC14)', () => {
  const cases: [PaletteItem, string][] = [
    ['Form', 'Form'],
    ['Button bar', 'Button bar'],
    ['Table', 'Table'],
    ['Row', 'Row'],
    ['Column', 'Column'],
    ['Grid', 'Grid'],
  ];
  for (const [item, label] of cases) {
    it(`${item} → ${label}`, () => {
      const doc1 = d('  A');
      const r = apply(doc1, insert(doc1, null, { item }));
      const reparsed = parseSalt(r.text).model!;
      const el = locate(reparsed, r.select);
      expect(el?.kind).toBe('cell');
      if (el?.kind !== 'cell') return;
      expect(gridLabel(el.cell.content as Grid)).toBe(label);
    });
  }
});
