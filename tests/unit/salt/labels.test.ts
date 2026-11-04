// T061: gridLabel precedence for every shape (VO-054, FR-002/AC14, section 3.2 Grid labels).
import { describe, expect, it } from 'vitest';
import { parseSalt } from '../../../src/core/salt/parser.ts';
import type { Grid } from '../../../src/core/salt/model.ts';
import { gridLabel } from '../../../src/core/salt/labels.ts';

const root = (opener: string, body: string): Grid => {
  const r = parseSalt(`@startsalt T\n${opener}\n${body}\n}\n@endsalt\n`);
  expect(r.diagnostics).toEqual([]);
  return r.model!.root;
};

describe('gridLabel (VO-054)', () => {
  it('(1) any grid with table lines is a Table, whatever its shape', () => {
    expect(gridLabel(root('{#', '  [A] | [B]'))).toBe('Table');
    expect(gridLabel(root('{#', '  Name | "x  "'))).toBe('Table');
  });

  it('(2) a one-row grid of buttons is a Button bar', () => {
    expect(gridLabel(root('{', '  [OK] | [Cancel]'))).toBe('Button bar');
    expect(gridLabel(root('{+', '  [OK]'))).toBe('Button bar');
  });

  it('(3) a two-column text and control grid is a Form, empty cells allowed', () => {
    expect(gridLabel(root('{', '  Name | "     "\n  Mail | ^a^\n  . | [X] Keep\n  . | .'))).toBe('Form');
    expect(gridLabel(root('{', '  Pick | ( ) One\n  Tick | [ ] Two\n  Go | [Go]'))).toBe('Form');
  });

  it('(3) a row breaking the pattern stops it being a Form', () => {
    expect(gridLabel(root('{', '  Name | "     "\n  [OK] | Text'))).toBe('Grid');
    expect(gridLabel(root('{', '  Name | Other\n  Mail | More'))).toBe('Grid');
    expect(gridLabel(root('{', '  Name | "     "\n  ..'))).toBe('Grid');
  });

  it('(4) one row is a Row, one column a Column', () => {
    expect(gridLabel(root('{', '  A | B'))).toBe('Row');
    expect(gridLabel(root('{', '  A'))).toBe('Row');
    expect(gridLabel(root('{', '  A\n  [OK]\n  --'))).toBe('Column');
  });

  it('(5) otherwise a Grid, including an empty grid and ragged rows', () => {
    expect(gridLabel(root('{', '  A | B\n  C | D'))).toBe('Grid');
    expect(gridLabel(root('{', '  A | B | C\n  D'))).toBe('Grid');
    expect(gridLabel(root('{', ''))).toBe('Grid');
  });

  it('a group box is labelled by its shape', () => {
    expect(gridLabel(root('{^"Sign in"', '  Name | "    "'))).toBe('Form');
  });
});
