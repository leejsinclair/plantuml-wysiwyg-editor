// T132: flow structure operations (section 3.7, FR-012/AC1, AC9, AC13, FR-020/AC4, AC5).
// VO-124 insertion rules, VO-034 (core) deleting a decision with four steps, VO-036 initial start and final stop,
// moves keep lane and notes and are refused at an edge, VO-064 (flows) attached comments, VO-065 (flows) house style.
import { describe, expect, it } from 'vitest';
import { applyEdits } from '../../../../src/core/source/edits.ts';
import { flowDoc, type FlowDoc } from '../../../../src/core/activity/destinations.ts';
import { insert } from '../../../../src/core/activity/ops/insert.ts';
import { remove } from '../../../../src/core/activity/ops/remove.ts';
import { move, moveByKey } from '../../../../src/core/activity/ops/move.ts';
import { parseActivity } from '../../../../src/core/activity/parser.ts';
import type { Step } from '../../../../src/core/activity/model.ts';
import type { OpResult } from '../../../../src/core/types.ts';

const block = (...lines: string[]) => ['@startuml Screen-flow', ...lines, '@enduml', ''].join('\n');
const doc = (text: string, offset = 0): FlowDoc => {
  const d = flowDoc(text, offset);
  if (!d) throw new Error('not a flow');
  return d;
};
/** Applies an accepted operation to the block text and checks the result still parses as a flow. */
function run(text: string, op: OpResult): string {
  if (!op.ok) throw new Error(`refused: ${op.messageKey}`);
  const out = applyEdits(text, op.edits);
  const parsed = parseActivity(out);
  expect(parsed.diagnostics).toEqual([]);
  return out;
}

const BASIC = block('start', ':A;', ':B;', 'stop');

describe('insertion rules (VO-124)', () => {
  it('inserts after the selected step and selects the new element', () => {
    const op = insert(doc(BASIC), [1], 'step');
    expect(op.ok && op.select).toEqual([2]);
    expect(run(BASIC, op)).toBe(block('start', ':A;', ':Step;', ':B;', 'stop'));
  });

  it('inserts at the end of the main path, before the final stop, when nothing is selected', () => {
    const op = insert(doc(BASIC), null, 'step');
    expect(op.ok && op.select).toEqual([3]);
    expect(run(BASIC, op)).toBe(block('start', ':A;', ':B;', ':Step;', 'stop'));
  });

  it('inserts before the final stop when the stop is selected', () => {
    expect(run(BASIC, insert(doc(BASIC), [3], 'step'))).toBe(block('start', ':A;', ':B;', ':Step;', 'stop'));
  });

  it('inserts as the first element of a selected branch, empty or not', () => {
    const text = block('start', 'if (Ok?) then (yes)', '  :A;', 'else (no)', 'endif', 'stop');
    const first = insert(doc(text), [1, 0], 'step');
    expect(first.ok && first.select).toEqual([1, 0, 0]);
    expect(run(text, first)).toBe(block('start', 'if (Ok?) then (yes)', '  :Step;', '  :A;', 'else (no)', 'endif', 'stop'));
    const empty = insert(doc(text), [1, 1], 'step');
    expect(empty.ok && empty.select).toEqual([1, 1, 0]);
    expect(run(text, empty)).toBe(block('start', 'if (Ok?) then (yes)', '  :A;', 'else (no)', '  :Step;', 'endif', 'stop'));
  });

  it('inserts as the first element of a selected loop body', () => {
    const text = block('start', 'repeat', 'repeat while (More?)', 'stop');
    const op = insert(doc(text), [1, 0], 'step');
    expect(op.ok && op.select).toEqual([1, 0, 0]);
    expect(run(text, op)).toBe(block('start', 'repeat', '  :Step;', 'repeat while (More?)', 'stop'));
  });

  it('inserts after a decision, not inside it, when the decision is selected', () => {
    const text = block('start', 'if (Ok?) then (yes)', 'else (no)', 'endif', 'stop');
    const op = insert(doc(text), [1], 'step');
    expect(op.ok && op.select).toEqual([2]);
    expect(run(text, op)).toBe(block('start', 'if (Ok?) then (yes)', 'else (no)', 'endif', ':Step;', 'stop'));
  });

  it('writes new elements in the house style, indented to their depth (VO-065)', () => {
    const decision = run(BASIC, insert(doc(BASIC), [1], 'decision'));
    expect(decision).toBe(block('start', ':A;', 'if (Condition?) then (yes)', 'else (no)', 'endif', ':B;', 'stop'));
    const loop = run(BASIC, insert(doc(BASIC), [1], 'loop'));
    expect(loop).toBe(block('start', ':A;', 'repeat', 'repeat while (Repeat?)', ':B;', 'stop'));
    const nested = run(decision, insert(doc(decision), [2, 0], 'decision'));
    expect(nested).toBe(
      block('start', ':A;', 'if (Condition?) then (yes)', '  if (Condition?) then (yes)', '  else (no)', '  endif', 'else (no)', 'endif', ':B;', 'stop'),
    );
  });

  it('keeps the block line ending', () => {
    const crlf = BASIC.replace(/\n/g, '\r\n');
    expect(run(crlf, insert(doc(crlf), [1], 'step'))).toBe(block('start', ':A;', ':Step;', ':B;', 'stop').replace(/\n/g, '\r\n'));
  });

  it('offers a stop only at the end of a branch', () => {
    const text = block('start', 'if (Ok?) then (yes)', '  :A;', 'else (no)', 'endif', 'stop');
    expect(insert(doc(text), [1, 0, 0], 'stop')).toMatchObject({ ok: true });
    expect(run(text, insert(doc(text), [1, 0, 0], 'stop'))).toBe(
      block('start', 'if (Ok?) then (yes)', '  :A;', '  stop', 'else (no)', 'endif', 'stop'),
    );
    expect(insert(doc(text), [0], 'stop')).toMatchObject({ ok: false, messageKey: 'flow.refused.stopPosition' });
    expect(insert(doc(text), null, 'stop')).toMatchObject({ ok: false });
  });

  it('returns file-absolute edits', () => {
    const prefix = 'text before\n';
    const op = insert(doc(BASIC, prefix.length), [1], 'step');
    if (!op.ok) throw new Error('refused');
    expect(applyEdits(prefix + BASIC, op.edits)).toBe(prefix + block('start', ':A;', ':Step;', ':B;', 'stop'));
  });

  it('names the action and announces it', () => {
    expect(insert(doc(BASIC), [1], 'decision')).toMatchObject({ announceKey: 'flow.inserted.decision', historyName: 'flow.history.insert.decision' });
  });
});

describe('removal (VO-034 core, VO-036, VO-064)', () => {
  const FOUR = block('start', ':Before;', 'if (Ok?) then (yes)', '  :A;', '  :B;', 'else (no)', '  :C;', '  :D;', 'endif', ':After;', 'stop');

  it('deletes a decision with its four steps and names what was removed', () => {
    const op = remove(doc(FOUR), [2]);
    expect(op).toMatchObject({ ok: true, announceKey: 'flow.deleted.decision', announceParams: { count: 4 } });
    expect(run(FOUR, op)).toBe(block('start', ':Before;', ':After;', 'stop'));
    // Focus goes to the next element.
    expect(op.ok && op.select).toEqual([2]);
  });

  it('selects the previous element, else the container, after a delete', () => {
    const text = block('start', 'if (Ok?) then (yes)', '  :A;', '  :B;', 'else (no)', 'endif', 'stop');
    const last = remove(doc(text), [1, 0, 1]);
    expect(last.ok && last.select).toEqual([1, 0, 0]);
    const only = remove(doc(block('start', 'if (Ok?) then (yes)', '  :A;', 'else (no)', 'endif', 'stop')), [1, 0, 0]);
    expect(only.ok && only.select).toEqual([1, 0]);
  });

  it('deletes a loop with its contents', () => {
    const text = block('start', 'repeat', '  :A;', 'repeat while (More?)', 'stop');
    const op = remove(doc(text), [1]);
    expect(op).toMatchObject({ ok: true, announceKey: 'flow.deleted.loop', announceParams: { count: 1 } });
    expect(run(text, op)).toBe(block('start', 'stop'));
  });

  it('refuses to delete or move the initial start and the final stop (VO-036)', () => {
    for (const path of [[0], [3]]) {
      expect(remove(doc(BASIC), path)).toMatchObject({ ok: false, messageKey: 'flow.refused.startStop' });
      expect(moveByKey(doc(BASIC), path, 'down')).toMatchObject({ ok: false, messageKey: 'flow.refused.startStop' });
      expect(moveByKey(doc(BASIC), path, 'up')).toMatchObject({ ok: false, messageKey: 'flow.refused.startStop' });
    }
  });

  it('allows deleting a stop at the end of a branch', () => {
    const text = block('start', 'if (Ok?) then (yes)', '  stop', 'else (no)', 'endif', 'stop');
    expect(run(text, remove(doc(text), [1, 0, 0]))).toBe(block('start', 'if (Ok?) then (yes)', 'else (no)', 'endif', 'stop'));
  });

  it('deletes the comment directly above an element with it and says so (VO-064)', () => {
    const text = block('start', "' about A", ':A;', '', "' a free comment", '', ':B;', 'stop');
    const op = remove(doc(text), [1]);
    expect(op).toMatchObject({ ok: true, announceKey: 'flow.deleted.stepWithComment' });
    expect(run(text, op)).toBe(block('start', '', "' a free comment", '', ':B;', 'stop'));
    const plain = remove(doc(text), [2]);
    expect(plain).toMatchObject({ announceKey: 'flow.deleted.step' });
    expect(run(text, plain)).toBe(block('start', "' about A", ':A;', '', "' a free comment", '', 'stop'));
  });

  it('deletes the notes of a removed element', () => {
    const text = block('start', ':A;', 'note right: about A', ':B;', 'stop');
    expect(run(text, remove(doc(text), [1]))).toBe(block('start', ':B;', 'stop'));
  });
});

describe('moving (VO-036, VO-064, FR-012/AC12)', () => {
  it('moves a step down and up along its path and keeps its notes and comment', () => {
    const text = block('start', "' about A", ':A;', 'note left: on A', ':B;', 'stop');
    const down = moveByKey(doc(text), [1], 'down');
    expect(down.ok && down.select).toEqual([2]);
    const moved = run(text, down);
    expect(moved).toBe(block('start', ':B;', "' about A", ':A;', 'note left: on A', 'stop'));
    const up = run(moved, moveByKey(doc(moved), [2], 'up'));
    expect(up).toBe(text);
  });

  it('refuses at the edge of a branch with the "Move to…" hint and never moves sideways', () => {
    const text = block('start', 'if (Ok?) then (yes)', '  :A;', 'else (no)', '  :B;', 'endif', 'stop');
    expect(moveByKey(doc(text), [1, 0, 0], 'up')).toMatchObject({ ok: false, messageKey: 'flow.refused.moveEdge' });
    expect(moveByKey(doc(text), [1, 0, 0], 'down')).toMatchObject({ ok: false, messageKey: 'flow.refused.moveEdge' });
    expect(moveByKey(doc(text), [1, 0, 0], 'right')).toMatchObject({ ok: false, messageKey: 'flow.refused.moveSideways' });
    expect(moveByKey(doc(text), [1, 1, 0], 'left')).toMatchObject({ ok: false, messageKey: 'flow.refused.moveSideways' });
  });

  it('does not move past the initial start or the final stop', () => {
    expect(moveByKey(doc(BASIC), [1], 'up')).toMatchObject({ ok: false, messageKey: 'flow.refused.moveEdge' });
    expect(moveByKey(doc(BASIC), [2], 'down')).toMatchObject({ ok: false, messageKey: 'flow.refused.moveEdge' });
  });

  it('moves an element into a branch with "Move to…", re-indented, keeping its lane', () => {
    const text = block('|User|', 'start', ':A;', '|System|', 'if (Ok?) then (yes)', 'else (no)', 'endif', 'stop');
    const op = move(doc(text), [1], { container: [2, 1], index: 0 });
    expect(op.ok && op.select).toEqual([1, 1, 0]);
    const out = run(text, op);
    const model = parseActivity(out).model!;
    const moved = (model.main.elements[1] as unknown as { branches: { path: { elements: Step[] } }[] }).branches[1]!.path.elements[0]!;
    expect(moved.label.text).toBe('A');
    expect(moved.lane).toBe('User');
    expect(model.main.elements[1]).toMatchObject({ kind: 'decision', lane: 'System' });
    expect(out).toContain('  :A;');
  });

  it('refuses a destination that is not offered', () => {
    const text = block('start', 'if (Ok?) then (yes)', '  :A;', 'else (no)', 'endif', 'stop');
    expect(move(doc(text), [1], { container: [1, 0], index: 0 })).toMatchObject({ ok: false, messageKey: 'flow.refused.destination' });
    expect(move(doc(text), [1, 0, 0], { container: [], index: 0 })).toMatchObject({ ok: false });
  });
});
