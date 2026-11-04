// T056: remove and move (VO-004, VO-048, VO-050, VO-005 core, VO-064).
import { describe, expect, it } from 'vitest';
import { applyEdits } from '../../../../src/core/source/edits.ts';
import { parseSalt } from '../../../../src/core/salt/parser.ts';
import type { SaltScreen } from '../../../../src/core/salt/model.ts';
import type { OpResult, Path } from '../../../../src/core/types.ts';
import { remove } from '../../../../src/core/salt/ops/remove.ts';
import { move, moveByKey } from '../../../../src/core/salt/ops/move.ts';
import type { ScreenDoc } from '../../../../src/core/salt/destinations.ts';

const block = (body: string): string => `@startsalt T\n{\n${body}\n}\n@endsalt\n`;
function d(body: string): ScreenDoc {
  const text = block(body);
  const r = parseSalt(text);
  expect(r.diagnostics).toEqual([]);
  return { text, model: r.model! };
}
function apply(document: ScreenDoc, op: OpResult): { text: string; model: SaltScreen; select: Path; op: OpResult & { ok: true } } {
  expect(op.ok, op.ok ? '' : op.messageKey).toBe(true);
  if (!op.ok) throw new Error('refused');
  const text = applyEdits(document.text, op.edits);
  const parsed = parseSalt(text);
  expect(parsed.diagnostics, text).toEqual([]);
  return { text, model: parsed.model!, select: op.select, op };
}
const lines = (s: string) => s.split('\n');

describe('remove (FR-002/AC8)', () => {
  it('leaves an empty cell in a multi-row multi-column grid; other rows are byte-identical; selects the cell (VO-004)', () => {
    const doc = d('  Name | "Ann       "\n  Mail | "a@b       "\n  [OK] | [Cancel]');
    const r = apply(doc, remove(doc, [1, 1]));
    expect(r.text).toBe(block('  Name | "Ann       "\n  Mail | .\n  [OK] | [Cancel]'));
    const before = lines(doc.text);
    const after = lines(r.text);
    expect(after.filter((_, i) => i !== 3)).toEqual(before.filter((_, i) => i !== 3));
    expect(r.select).toEqual([1, 1]);
  });

  it('turns a removed span into empty cells', () => {
    const doc = d('  A | B | *\n  C | D | E');
    const r = apply(doc, remove(doc, [0, 1]));
    expect(r.text).toBe(block('  A | . | .\n  C | D | E'));
  });

  it('closes the gap in a single-row grid and selects the next element (VO-048)', () => {
    const doc = d('  [A] | [B] | [C]');
    const r = apply(doc, remove(doc, [0, 1]));
    expect(r.text).toBe(block('  [A] | [C]'));
    expect(r.select).toEqual([0, 1]);
  });

  it('closes the gap at the end of a row and selects the previous element', () => {
    const doc = d('  [A] | [B]');
    const r = apply(doc, remove(doc, [0, 1]));
    expect(r.text).toBe(block('  [A]'));
    expect(r.select).toEqual([0, 0]);
  });

  it('removing the first cell of a row re-escapes the text that becomes first', () => {
    const doc = d('  [A] | Title');
    const r = apply(doc, remove(doc, [0, 0]));
    expect(r.text).toBe(block('  \u200bTitle'));
  });

  it('closes the gap in a single-column grid (VO-048)', () => {
    const doc = d('  A\n  B\n  C');
    const r = apply(doc, remove(doc, [1, 0]));
    expect(r.text).toBe(block('  A\n  C'));
    expect(r.select).toEqual([1, 0]);
  });

  it('selects the container after removing its only element', () => {
    const doc = d('  {\n    A\n  }');
    const r = apply(doc, remove(doc, [0, 0, 0, 0]));
    expect(r.text).toBe(block('  {\n  }'));
    expect(r.select).toEqual([0, 0]);
  });

  it('deletes a comment directly above the element, and says so (VO-064)', () => {
    const doc = d("  A\n  ' about B\n  B\n\n  ' about the rest\n  C");
    const r = apply(doc, remove(doc, [1, 0]));
    expect(r.text).toBe(block("  A\n\n  ' about the rest\n  C"));
    expect(r.op.announceParams).toMatchObject({ comments: 1 });
  });

  it('removes a separator row', () => {
    const doc = d('  A\n  ==\n  B');
    const r = apply(doc, remove(doc, [1]));
    expect(r.text).toBe(block('  A\n  B'));
  });

  it('refuses to remove the root grid', () => {
    const doc = d('  A');
    expect(remove(doc, []).ok).toBe(false);
  });
});

describe('moveByKey (FR-002/AC13, VO-050)', () => {
  it('moves along a single-row grid', () => {
    const doc = d('  [A] | [B] | [C]');
    const r = apply(doc, moveByKey(doc, [0, 0], 'right'));
    expect(r.text).toBe(block('  [B] | [A] | [C]'));
    expect(r.select).toEqual([0, 1]);
  });

  it('moves along a single-column grid, carrying its comment (VO-064)', () => {
    const doc = d("  A\n  ' about B\n  B\n  C");
    const r = apply(doc, moveByKey(doc, [1, 0], 'down'));
    expect(r.text).toBe(block("  A\n  C\n  ' about B\n  B"));
    expect(r.select).toEqual([2, 0]);
  });

  it('swaps with the neighbouring occupied cell in a multi-row multi-column grid', () => {
    const doc = d('  A | B\n  C | D');
    const r = apply(doc, moveByKey(doc, [0, 0], 'down'));
    expect(r.text).toBe(block('  C | B\n  A | D'));
    expect(r.select).toEqual([1, 0]);
  });

  it('swaps with the neighbouring empty cell', () => {
    const doc = d('  A | .\n  C | D');
    const r = apply(doc, moveByKey(doc, [0, 0], 'right'));
    expect(r.text).toBe(block('  . | A\n  C | D'));
    expect(r.select).toEqual([0, 1]);
  });

  it('refuses at the edge of the container and says to use Move to (VO-005 core)', () => {
    const doc = d('  [A] | [B]');
    for (const [path, dir] of [[[0, 0], 'left'], [[0, 1], 'right'], [[0, 0], 'up'], [[0, 1], 'down']] as const) {
      const op = moveByKey(doc, path, dir);
      expect(op.ok).toBe(false);
      if (!op.ok) expect(op.messageKey).toBe('screen.refuse.moveEdge');
    }
    const grid = d('  A | B\n  C | D');
    const op = moveByKey(grid, [1, 1], 'down');
    expect(op.ok).toBe(false);
  });
});

describe('move (FR-002/AC3, AC4)', () => {
  it('moves into an empty cell of another container, leaving an empty cell behind in a multi grid', () => {
    const doc = d('  A | B\n  C | { X | . }');
    const r = apply(doc, move(doc, [0, 0], { kind: 'cell', container: [1, 1], row: 0, cell: 1 }));
    expect(r.text).toBe(block('  . | B\n  C | { X | A }'));
    expect(r.select).toEqual([1, 1, 0, 1]);
  });

  it('moves before an element in a single-column container, closing the gap', () => {
    const doc = d('  A\n  B\n  C');
    const r = apply(doc, move(doc, [2, 0], { kind: 'before', container: [], index: 0 }));
    expect(r.text).toBe(block('  C\n  A\n  B'));
    expect(r.select).toEqual([0, 0]);
  });

  it('moves to the end of a nested container, carrying its comment', () => {
    const doc = d("  ' about A\n  A\n  {\n    X\n  }");
    const r = apply(doc, move(doc, [0, 0], { kind: 'end', container: [1, 0] }));
    expect(r.text).toBe(block("  {\n    X\n    ' about A\n    A\n  }"));
    expect(r.select).toEqual([0, 0, 1, 0]);
  });

  it('keeps a span, reduced to fit the destination', () => {
    const doc = d('  A | B | *\n  C | . | X');
    const r = apply(doc, move(doc, [0, 1], { kind: 'cell', container: [], row: 1, cell: 1 }));
    expect(r.text).toBe(block('  A | . | .\n  C | B | X'));
  });

  it('refuses a destination that is not valid', () => {
    const doc = d('  A | B\n  C | D');
    expect(move(doc, [0, 0], { kind: 'cell', container: [], row: 1, cell: 1 }).ok).toBe(false);
  });
});

describe('move: every valid destination gives valid source with the element there (VO-049 core)', () => {
  const screens = [
    "  ' c\n  A | .\n  { X | Y } | B\n  --\n  {\n    P\n    Q\n  } | [Go] | *",
    '  [OK] | [Cancel]\n  {+\n    Name | "x  "\n    . | [ ] Keep\n  }',
    '  { [A] }\n  { Hi }\n  {\n  }\n  ==',
  ];
  const elements = (m: SaltScreen): Path[] => {
    const out: Path[] = [];
    const walk = (rows: SaltScreen['root']['rows'], k: Path): void =>
      rows.forEach((row, r) => {
        if (row.type === 'separator') out.push([...k, r]);
        else
          row.cells.forEach((cell, c) => {
            if (cell.content.type !== 'empty') out.push([...k, r, c]);
            if (cell.content.type === 'grid' || cell.content.type === 'scrollArea') walk(cell.content.rows, [...k, r, c]);
          });
      });
    walk(m.root.rows, []);
    return out;
  };
  for (const body of screens) {
    it(JSON.stringify(body.slice(0, 30)), async () => {
      const { validDestinations } = await import('../../../../src/core/salt/destinations.ts');
      const doc = d(body);
      for (const target of elements(doc.model)) {
        for (const dest of validDestinations(doc.model, target)) {
          const op = move(doc, target, dest);
          expect(op.ok, `${JSON.stringify(target)} → ${JSON.stringify(dest)}`).toBe(true);
          if (!op.ok) continue;
          const text = applyEdits(doc.text, op.edits);
          const parsed = parseSalt(text);
          expect(parsed.diagnostics, `${JSON.stringify(target)} → ${JSON.stringify(dest)}\n${text}`).toEqual([]);
          const { locate } = await import('../../../../src/core/salt/destinations.ts');
          const kindOf = (m: SaltScreen, p: Path) => {
            const l = locate(m, p);
            return l?.kind === 'cell' ? l.cell.content.type : l?.kind;
          };
          expect(kindOf(parsed.model!, op.select), `${JSON.stringify(target)} → ${JSON.stringify(dest)}\n${text}`).toBe(kindOf(doc.model, target));
        }
      }
    });
  }
});
