// T115: re-division on leaving the source view (section 4.2 "Block boundaries", FR-004/AC10, FR-011/AC15,
// VO-024 core, VO-084 re-division).
import { describe, expect, it } from 'vitest';
import { redivide } from '../../../src/core/blocks/redivide.ts';
import { split } from '../../../src/core/blocks/split.ts';
import { applyEdits } from '../../../src/core/source/edits.ts';

const screen = (name: string, body = '  [OK]') => `@startsalt ${name}\n{\n${body}\n}\n@endsalt\n`;
const flow = (name: string, ...steps: string[]) => `@startuml ${name}\nstart\n${steps.map((s) => `${s}\n`).join('')}stop\n@enduml\n`;

/** The range of the block at `index` and its text. */
function block(source: string, index: number) {
  const b = split(source).filter((s) => s.type === 'block')[index]!;
  return { start: b.start, end: b.end, text: source.slice(b.start, b.end) };
}

describe('redivide: still one block', () => {
  it('gives null when the typed text still forms exactly one block in place', () => {
    const source = screen('A') + '\n' + screen('B');
    const a = block(source, 0);
    expect(redivide(source, a.start, a.end)).toBeNull();
    expect(redivide(source, a.start, a.end, screen('A', '  [Cancel]'))).toBeNull();
  });

  it('gives null for invalid text that keeps the boundaries (no blank line before the next block)', () => {
    const source = screen('A') + screen('B');
    const a = block(source, 0);
    // No end line, but the next start line ends the block exactly where it ended before.
    expect(redivide(source, a.start, a.end, '@startsalt A\n{\n  [OK\n')).toBeNull();
  });

  it('gives null for a renamed screen', () => {
    const source = screen('A') + '\n' + screen('B');
    const a = block(source, 0);
    expect(redivide(source, a.start, a.end, screen('A2'))).toBeNull();
  });
});

describe('redivide: the text no longer forms one block', () => {
  it('a deleted end line runs the block to the next block: one change, the typed text unchanged', () => {
    const source = screen('A') + '\n' + screen('B');
    const a = block(source, 0);
    const typed = '@startsalt A\n{\n  [OK]\n}\n';
    const r = redivide(source, a.start, a.end, typed)!;
    expect(r).not.toBeNull();
    expect(r.edits).toEqual([{ start: a.start, end: a.end, text: typed }]);
    const next = applyEdits(source, r.edits);
    expect(next).toBe(typed + '\n' + screen('B'));
    // The block now runs to just before B; both keep their identity.
    expect(r.order).toEqual([0, 1]);
    expect(r.blockCount).toBe(1);
    expect(r.keeperIndex).toBe(0);
    expect(r.removedLinkedScreens).toEqual([]);
    expect(r.removesLastBlock).toBe(false);
  });

  it('a block split in two keeps the first as the edited block and gives the second a new identity', () => {
    const source = screen('A') + '\n' + screen('B');
    const a = block(source, 0);
    const typed = screen('A') + screen('C');
    const r = redivide(source, a.start, a.end, typed)!;
    expect(r.order).toEqual([0, null, 1]);
    expect(r.blockCount).toBe(2);
    expect(r.keeperIndex).toBe(0);
    expect(split(applyEdits(source, r.edits)).filter((s) => s.type === 'block').map((s) => s.type === 'block' && s.name)).toEqual(['A', 'C', 'B']);
  });

  it('the edited screen keeps its identity on the resulting screen with its name', () => {
    const source = screen('Z') + '\n' + screen('A');
    const a = block(source, 1);
    const typed = screen('C') + screen('A');
    const r = redivide(source, a.start, a.end, typed)!;
    expect(r.order).toEqual([0, null, 1]);
    expect(r.keeperIndex).toBe(2);
  });

  it('reports a removed screen that steps link to, and not one without links', () => {
    const source = screen('A') + '\n' + screen('B') + '\n' + flow('Screen-flow', ':[[#A Sign in]];', ':[[#A Again]];');
    const a = block(source, 0);
    // The start line is gone: the text is no block at all.
    const r = redivide(source, a.start, a.end, '{\n  [OK]\n}\n@endsalt\n', 2)!;
    expect(r.removedLinkedScreens).toEqual(['A']);
    expect(r.blockCount).toBe(0);
    expect(r.keeperIndex).toBeNull();
    expect(r.order).toEqual([1, 2]);
    expect(r.flowIndex).toBe(1);

    const b = block(source, 1);
    const unlinked = redivide(source, b.start, b.end, '{\n}\n', 2)!;
    expect(unlinked.removedLinkedScreens).toEqual([]);
    expect(unlinked.order).toEqual([0, 2]);
  });

  it('a screen turned into a non-screen with its links is reported as removed', () => {
    const source = screen('A') + '\n' + flow('Screen-flow', ':[[#A Sign in]];');
    const a = block(source, 0);
    const r = redivide(source, a.start, a.end, '@startsalt A\n{\n}\n@endsalt\n@startuml\nAlice -> Bob\n', 1)!;
    expect(r.removedLinkedScreens).toEqual([]);
    const gone = redivide(source, a.start, a.end, '@startuml A\nAlice -> Bob\n@enduml\n\n@startuml\nBob -> Alice\n@enduml\n', 1)!;
    expect(gone.removedLinkedScreens).toEqual(['A']);
  });

  it('the flow keeps its name when re-divided', () => {
    const source = screen('A') + '\n' + flow('Screen-flow', ':Step;');
    const f = block(source, 1);
    const typed = flow('Other') + flow('Screen-flow', ':Step;');
    const r = redivide(source, f.start, f.end, typed, 1)!;
    expect(r.order).toEqual([0, null, 1]);
    expect(r.flowIndex).toBe(2);
    expect(r.keeperIndex).toBe(2);
  });

  it('else the first resulting activity block is the flow', () => {
    const source = screen('A') + '\n' + flow('Screen-flow', ':Step;');
    const f = block(source, 1);
    const typed = screen('S') + flow('Renamed') + flow('Later');
    const r = redivide(source, f.start, f.end, typed, 1)!;
    expect(r.flowIndex).toBe(2);
    expect(r.order).toEqual([0, null, 1, null]);
  });

  it('and no flow when no activity block results', () => {
    const source = screen('A') + '\n' + flow('Screen-flow', ':Step;');
    const f = block(source, 1);
    const r = redivide(source, f.start, f.end, screen('S') + screen('T'), 1)!;
    expect(r.flowIndex).toBeNull();
    expect(r.keeperIndex).toBeNull();
  });

  it('keeps the flow index of another block when a screen is re-divided', () => {
    const source = screen('A') + '\n' + flow('Screen-flow', ':Step;');
    const a = block(source, 0);
    const r = redivide(source, a.start, a.end, screen('A') + screen('B'), 1)!;
    expect(r.flowIndex).toBe(2);
    expect(r.order).toEqual([0, null, 1]);
  });

  it('refuses to remove the last block of a project (FR-011/AC15, EC-01)', () => {
    const source = screen('A');
    const a = block(source, 0);
    const r = redivide(source, a.start, a.end, '{\n}\n')!;
    expect(r.removesLastBlock).toBe(true);
    const kept = redivide(source + '\n' + screen('B'), a.start, a.end, '{\n}\n')!;
    expect(kept.removesLastBlock).toBe(false);
  });

  it('refuses a range that is not a block', () => {
    const source = screen('A');
    expect(() => redivide(source, 1, 5)).toThrow(RangeError);
  });
});
