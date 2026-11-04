// T059: wrap and unwrap in a grid and a group box (VO-053, FR-002/AC11).
import { describe, expect, it } from 'vitest';
import { applyEdits } from '../../../../src/core/source/edits.ts';
import { parseSalt } from '../../../../src/core/salt/parser.ts';
import type { SaltScreen } from '../../../../src/core/salt/model.ts';
import type { OpResult, Path } from '../../../../src/core/types.ts';
import { locate, type ScreenDoc } from '../../../../src/core/salt/destinations.ts';
import { canUnwrap, unwrap, wrap } from '../../../../src/core/salt/ops/wrap.ts';

const block = (body: string): string => `@startsalt T\n{\n${body}\n}\n@endsalt\n`;
function d(body: string): ScreenDoc {
  const text = block(body);
  const r = parseSalt(text);
  expect(r.diagnostics).toEqual([]);
  return { text, model: r.model! };
}
function apply(document: ScreenDoc, op: OpResult): { text: string; model: SaltScreen; select: Path } {
  expect(op.ok, op.ok ? '' : op.messageKey).toBe(true);
  if (!op.ok) throw new Error('refused');
  const text = applyEdits(document.text, op.edits);
  const parsed = parseSalt(text);
  expect(parsed.diagnostics, text).toEqual([]);
  return { text, model: parsed.model!, select: op.select };
}

describe('wrap (VO-053)', () => {
  it('wraps an element in a grid: the element gains a visible parent, selected', () => {
    const doc = d('  Name | "x    "\n  [OK] | [Cancel]');
    const r = apply(doc, wrap(doc, [1, 0], 'grid'));
    expect(r.text).toBe(block('  Name | "x    "\n  {\n    [OK]\n  } | [Cancel]'));
    expect(r.select).toEqual([1, 0]);
    const el = locate(r.model, [1, 0, 0, 0]);
    expect(el?.kind === 'cell' && el.cell.content.type).toBe('button');
  });

  it('wraps an element in a group box', () => {
    const doc = d('  A\n  B');
    const r = apply(doc, wrap(doc, [1, 0], 'group box'));
    expect(r.text).toBe(block('  A\n  {^"Group"\n    B\n  }'));
    const el = locate(r.model, [1, 0]);
    expect(el?.kind === 'cell' && el.cell.content.type === 'grid' && el.cell.content.style).toBe('groupBox');
  });

  it('wraps a multi-line container, re-indenting it', () => {
    const doc = d('  {\n    A\n  }');
    const r = apply(doc, wrap(doc, [0, 0], 'group box'));
    expect(r.text).toBe(block('  {^"Group"\n    {\n      A\n    }\n  }'));
  });

  it('wraps the root grid', () => {
    const doc = d('  A');
    const r = apply(doc, wrap(doc, [], 'group box'));
    expect(r.text).toBe('@startsalt T\n{^"Group"\n  {\n    A\n  }\n}\n@endsalt\n');
    expect(r.select).toEqual([]);
  });

  it('keeps the span of the wrapped cell', () => {
    const doc = d('  A | B | *\n  C | D | E');
    const r = apply(doc, wrap(doc, [0, 1], 'grid'));
    expect(r.text).toBe(block('  A | {\n    B\n  } | *\n  C | D | E'));
  });
});

describe('unwrap (VO-053)', () => {
  it('is offered only for a single-element grid with no style', () => {
    const doc = d('  {\n    A\n  }\n  {+\n    B\n  }\n  {\n    C | D\n  }');
    expect(canUnwrap(doc.model, [0, 0])).toEqual([0, 0]);
    expect(canUnwrap(doc.model, [0, 0, 0, 0])).toEqual([0, 0]);
    expect(canUnwrap(doc.model, [1, 0])).toBeNull();
    expect(canUnwrap(doc.model, [2, 0])).toBeNull();
    expect(unwrap(doc, [1, 0]).ok).toBe(false);
  });

  it('restores the element in place', () => {
    const doc = d('  X\n  {\n    [OK]\n  }');
    const r = apply(doc, unwrap(doc, [1, 0]));
    expect(r.text).toBe(block('  X\n  [OK]'));
    expect(r.select).toEqual([1, 0]);
  });

  it('round-trips with wrap', () => {
    const doc = d('  A | B\n  C | D');
    const wrapped = apply(doc, wrap(doc, [1, 1], 'grid'));
    const doc2 = { text: wrapped.text, model: wrapped.model };
    expect(apply(doc2, unwrap(doc2, [1, 1])).text).toBe(doc.text);
  });
});
