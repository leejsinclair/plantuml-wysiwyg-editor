// T057: validDestinations is exactly the section 3.2 set (VO-049 core): for each valid container its empty cells
// and "at the end", plus "before" or "after" each element in single-row or single-column containers.
import { describe, expect, it } from 'vitest';
import { parseSalt } from '../../../src/core/salt/parser.ts';
import type { SaltScreen } from '../../../src/core/salt/model.ts';
import { axisOf, destinationKey, locate, validDestinations, type Destination } from '../../../src/core/salt/destinations.ts';

const model = (body: string): SaltScreen => {
  const r = parseSalt(`@startsalt T\n{\n${body}\n}\n@endsalt\n`);
  expect(r.diagnostics).toEqual([]);
  return r.model!;
};

describe('validDestinations (VO-049 core)', () => {
  const m = model('  A | .\n  { X | Y } | B');

  it('an element in a multi grid: every empty cell and end of each container, plus before/after in single-axis ones', () => {
    expect(validDestinations(m, [0, 0])).toEqual<Destination[]>([
      { kind: 'cell', container: [], row: 0, cell: 1 },
      { kind: 'end', container: [] },
      { kind: 'before', container: [1, 0], index: 0 },
      { kind: 'after', container: [1, 0], index: 0 },
      { kind: 'before', container: [1, 0], index: 1 },
      { kind: 'after', container: [1, 0], index: 1 },
      { kind: 'end', container: [1, 0] },
    ]);
  });

  it('never offers the element itself', () => {
    expect(validDestinations(m, [1, 0, 0, 0])).toEqual<Destination[]>([
      { kind: 'cell', container: [], row: 0, cell: 1 },
      { kind: 'end', container: [] },
      { kind: 'before', container: [1, 0], index: 1 },
      { kind: 'after', container: [1, 0], index: 1 },
      { kind: 'end', container: [1, 0] },
    ]);
  });

  it('never offers a container inside the moved container', () => {
    expect(validDestinations(m, [1, 0])).toEqual<Destination[]>([
      { kind: 'cell', container: [], row: 0, cell: 1 },
      { kind: 'end', container: [] },
    ]);
  });

  it('a separator goes only where a whole row fits', () => {
    const s = model('  A\n  --\n  { X | . }');
    expect(validDestinations(s, [1])).toEqual<Destination[]>([
      { kind: 'before', container: [], index: 0 },
      { kind: 'after', container: [], index: 0 },
      { kind: 'before', container: [], index: 2 },
      { kind: 'after', container: [], index: 2 },
      { kind: 'end', container: [] },
    ]);
  });

  it('an empty container offers "at the end"', () => {
    const s = model('  A\n  {\n  }');
    expect(validDestinations(s, [0, 0])).toContainEqual({ kind: 'end', container: [1, 0] });
  });

  it('nothing is offered for the root grid or a path that does not exist', () => {
    expect(validDestinations(m, [])).toEqual([]);
    expect(validDestinations(m, [7, 7])).toEqual([]);
  });

  it('keys are unique', () => {
    const all = validDestinations(m, [0, 0]).map(destinationKey);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('axisOf and locate', () => {
  it('a 1 × 1 grid grows down, except one holding a button, which grows across (EC-04)', () => {
    const one = model('  A\n  { [OK] }\n  { Hi }');
    const button = locate(one, [1, 0]);
    const text = locate(one, [2, 0]);
    expect(button?.kind === 'cell' && button.cell.content.type === 'grid' && axisOf(button.cell.content)).toBe('row');
    expect(text?.kind === 'cell' && text.cell.content.type === 'grid' && axisOf(text.cell.content)).toBe('column');
    expect(axisOf(one.root)).toBe('column');
    expect(axisOf(model('  A | B\n  C | D').root)).toBeNull();
  });

  it('locates rows, separators, cells and containers', () => {
    const s = model('  A | B\n  ==');
    expect(locate(s, [])?.kind).toBe('container');
    expect(locate(s, [0])?.kind).toBe('row');
    expect(locate(s, [1])?.kind).toBe('separator');
    expect(locate(s, [0, 1])?.kind).toBe('cell');
    expect(locate(s, [0, 2])).toBeNull();
  });
});
