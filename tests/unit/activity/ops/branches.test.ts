// T133: decision branches and loop bodies (FR-012/AC2, AC8, AC9; VO-123 core). A decision keeps at least two
// branches, `elseif` branches sit between `if` and `else`, and empty branches and loop bodies are valid.
import { describe, expect, it } from 'vitest';
import { applyEdits } from '../../../../src/core/source/edits.ts';
import { flowDoc, type FlowDoc } from '../../../../src/core/activity/destinations.ts';
import { addBranch, removeBranch, setText } from '../../../../src/core/activity/ops/branches.ts';
import { insert } from '../../../../src/core/activity/ops/insert.ts';
import { parseActivity } from '../../../../src/core/activity/parser.ts';
import type { Decision, Loop } from '../../../../src/core/activity/model.ts';
import type { OpResult } from '../../../../src/core/types.ts';

const block = (...lines: string[]) => ['@startuml Screen-flow', ...lines, '@enduml', ''].join('\n');
const doc = (text: string): FlowDoc => flowDoc(text)!;
function run(text: string, op: OpResult): string {
  if (!op.ok) throw new Error(`refused: ${op.messageKey}`);
  const out = applyEdits(text, op.edits);
  expect(parseActivity(out).diagnostics).toEqual([]);
  return out;
}
const decisionAt = (text: string, i: number) => parseActivity(text).model!.main.elements[i] as Decision;

const TWO = block('start', 'if (Ok?) then (yes)', '  :A;', 'else (no)', '  :B;', 'endif', 'stop');

describe('adding branches', () => {
  it('adds an elseif before the else and selects it', () => {
    const op = addBranch(doc(TWO), [1]);
    expect(op.ok && op.select).toEqual([1, 1]);
    const out = run(TWO, op);
    expect(out).toBe(block('start', 'if (Ok?) then (yes)', '  :A;', 'elseif (Condition?) then (yes)', 'else (no)', '  :B;', 'endif', 'stop'));
    expect(decisionAt(out, 1).branches.map((b) => b.branchKind)).toEqual(['if', 'elseif', 'else']);
  });

  it('adds an else to a decision that has none, such as an imported if', () => {
    const text = block('start', 'if (Ok?) then (yes)', '  :A;', 'endif', 'stop');
    expect(decisionAt(text, 1).branches).toHaveLength(1);
    const op = addBranch(doc(text), [1]);
    expect(op.ok && op.select).toEqual([1, 1]);
    expect(run(text, op)).toBe(block('start', 'if (Ok?) then (yes)', '  :A;', 'else (no)', 'endif', 'stop'));
  });

  it('accepts a branch path as well as the decision', () => {
    expect(run(TWO, addBranch(doc(TWO), [1, 0]))).toContain('elseif (Condition?) then (yes)');
  });
});

describe('removing branches', () => {
  const THREE = block('start', 'if (A?) then (a)', '  :One;', 'elseif (B?) then (b)', '  :Two;', '  :Three;', 'else (c)', 'endif', 'stop');

  it('refuses to leave fewer than two branches', () => {
    expect(removeBranch(doc(TWO), [1, 0])).toMatchObject({ ok: false, messageKey: 'flow.refused.twoBranches' });
    expect(removeBranch(doc(TWO), [1, 1])).toMatchObject({ ok: false, messageKey: 'flow.refused.twoBranches' });
  });

  it('removes an elseif branch with its contents and names what was removed', () => {
    const op = removeBranch(doc(THREE), [1, 1]);
    expect(op).toMatchObject({ ok: true, announceKey: 'flow.deleted.branch', announceParams: { count: 2 } });
    expect(run(THREE, op)).toBe(block('start', 'if (A?) then (a)', '  :One;', 'else (c)', 'endif', 'stop'));
  });

  it('removes the if branch, and the first elseif becomes the if', () => {
    expect(run(THREE, removeBranch(doc(THREE), [1, 0]))).toBe(
      block('start', 'if (B?) then (b)', '  :Two;', '  :Three;', 'else (c)', 'endif', 'stop'),
    );
  });

  it('removes the else branch', () => {
    expect(run(THREE, removeBranch(doc(THREE), [1, 2]))).toBe(
      block('start', 'if (A?) then (a)', '  :One;', 'elseif (B?) then (b)', '  :Two;', '  :Three;', 'endif', 'stop'),
    );
  });
});

describe('empty branches and loop bodies', () => {
  it('builds a decision with empty branches, an elseif and loops with empty bodies', () => {
    let text = block('start', 'stop');
    text = run(text, insert(doc(text), [0], 'decision'));
    text = run(text, addBranch(doc(text), [1]));
    text = run(text, insert(doc(text), [1], 'loop'));
    const model = parseActivity(text).model!;
    const decision = model.main.elements[1] as Decision;
    expect(decision.branches.map((b) => [b.branchKind, b.path.elements.length])).toEqual([['if', 0], ['elseif', 0], ['else', 0]]);
    expect((model.main.elements[2] as Loop).body.elements).toEqual([]);
    // An empty branch is a selectable slot that takes insertions.
    const filled = run(text, insert(doc(text), [1, 1], 'step'));
    expect((parseActivity(filled).model!.main.elements[1] as Decision).branches[1]!.path.elements).toHaveLength(1);
  });
});

describe('text properties', () => {
  it('edits a condition, a branch label and a loop condition', () => {
    const text = block('start', 'if (Ok?) then (yes)', 'else (no)', 'endif', 'repeat', 'repeat while (More?)', 'stop');
    const cond = run(text, setText(doc(text), [1], 'condition', 'Valid email?'));
    expect(cond).toContain('if (Valid email?) then (yes)');
    const label = run(text, setText(doc(text), [1, 1], 'branchLabel', 'invalid'));
    expect(label).toContain('else (invalid)');
    const loop = run(text, setText(doc(text), [2], 'condition', 'Again?'));
    expect(loop).toContain('repeat while (Again?)');
  });

  it('adds and removes a missing label', () => {
    const text = block('start', 'if (Ok?) then', 'else', 'endif', 'stop');
    const added = run(text, setText(doc(text), [1, 0], 'branchLabel', 'yes'));
    expect(added).toContain('if (Ok?) then (yes)');
    const removed = run(added, setText(doc(added), [1, 0], 'branchLabel', ''));
    expect(removed).toContain('if (Ok?) then\n');
  });

  it('keeps unbalanced brackets in a condition literal', () => {
    const text = block('start', 'if (Ok?) then (yes)', 'else (no)', 'endif', 'stop');
    const out = run(text, setText(doc(text), [1], 'condition', 'a) or (b'));
    expect(decisionAt(out, 1).branches[0]!.condition!.text).toBe('a) or (b');
  });

  it('edits a step label', () => {
    const text = block('start', ':A;', 'stop');
    expect(run(text, setText(doc(text), [1], 'label', 'Sign in'))).toBe(block('start', ':Sign in;', 'stop'));
  });
});
