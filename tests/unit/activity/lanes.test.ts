// T134: swimlanes (section 3.7, OD-8, FR-012/AC10, AC12; VO-121, VO-037 core). Lanes are a list; each step,
// decision and loop has a lane; the editor writes the fewest `|Lane|` switches so each element renders in its own
// lane, with the first switch before `start` (PlantUML 1.2026.9 rejects a first lane after any statement).
import { describe, expect, it } from 'vitest';
import { applyEdits } from '../../../src/core/source/edits.ts';
import { flowDoc, walk, type FlowDoc } from '../../../src/core/activity/destinations.ts';
import { checkLaneName, laneInUse } from '../../../src/core/activity/lanes.ts';
import { addLane, deleteLane, moveLane, renameLane, setLane } from '../../../src/core/activity/ops/lanes.ts';
import { insert } from '../../../src/core/activity/ops/insert.ts';
import { moveByKey } from '../../../src/core/activity/ops/move.ts';
import { parseActivity } from '../../../src/core/activity/parser.ts';
import type { ScreenFlow } from '../../../src/core/activity/model.ts';
import type { OpResult } from '../../../src/core/types.ts';

const block = (...lines: string[]) => ['@startuml Screen-flow', ...lines, '@enduml', ''].join('\n');
const doc = (text: string): FlowDoc => flowDoc(text)!;
function run(text: string, op: OpResult): string {
  if (!op.ok) throw new Error(`refused: ${op.messageKey}`);
  const out = applyEdits(text, op.edits);
  expect(parseActivity(out).diagnostics).toEqual([]);
  return out;
}
const model = (text: string): ScreenFlow => parseActivity(text).model!;
/** Every laned element's label (or kind) and lane, in source order. */
const lanesOf = (text: string) =>
  walk(model(text))
    .filter((r) => r.element.kind !== 'start' && r.element.kind !== 'stop')
    .map((r) => [r.element.kind === 'step' ? r.element.label.text : r.element.kind, 'lane' in r.element ? r.element.lane : null]);
const laneNames = (text: string) => model(text).lanes.map((l) => l.name);

const PLAIN = block('start', ':A;', 'if (Ok?) then (yes)', '  :B;', 'else (no)', 'endif', 'stop');
const TWO = block('|User|', 'start', ':A;', '|System|', ':B;', 'stop');

describe('adding lanes', () => {
  it('places every element in the first lane, written before start', () => {
    const out = run(PLAIN, addLane(doc(PLAIN), 'User'));
    expect(out).toBe(block('|User|', 'start', ':A;', 'if (Ok?) then (yes)', '  :B;', 'else (no)', 'endif', 'stop'));
    expect(lanesOf(out)).toEqual([['A', 'User'], ['decision', 'User'], ['B', 'User']]);
  });

  it('adds a later lane at the end of the list without moving any element', () => {
    const user = run(PLAIN, addLane(doc(PLAIN), 'User'));
    const out = run(user, addLane(doc(user), 'System'));
    expect(laneNames(out)).toEqual(['User', 'System']);
    expect(lanesOf(out)).toEqual([['A', 'User'], ['decision', 'User'], ['B', 'User']]);
  });

  it('refuses names that are empty, contain a bar or a line break, or are taken', () => {
    expect(checkLaneName('', [])).toBe('flow.refused.laneEmpty');
    expect(checkLaneName('a|b', [])).toBe('flow.refused.laneBar');
    expect(checkLaneName('a\nb', [])).toBe('flow.refused.laneBar');
    expect(checkLaneName('User', ['User'])).toBe('flow.refused.laneTaken');
    expect(checkLaneName('Usér', ['Usér'])).toBe('flow.refused.laneTaken');
    expect(addLane(doc(TWO), 'User')).toMatchObject({ ok: false, messageKey: 'flow.refused.laneTaken' });
  });
});

describe('elements and lanes', () => {
  it('gives a new element the lane of the element before it', () => {
    const afterA = run(TWO, insert(doc(TWO), [1], 'step'));
    expect(afterA).toBe(block('|User|', 'start', ':A;', ':Step;', '|System|', ':B;', 'stop'));
    const afterB = run(TWO, insert(doc(TWO), [2], 'step'));
    expect(lanesOf(afterB)).toEqual([['A', 'User'], ['B', 'System'], ['Step', 'System']]);
  });

  it('gives the first element of a branch the decision lane', () => {
    const text = block('|User|', 'start', '|System|', 'if (Ok?) then (yes)', 'else (no)', '  |User|', '  :B;', 'endif', 'stop');
    const out = run(text, insert(doc(text), [1, 0], 'step'));
    expect(lanesOf(out)).toEqual([['decision', 'System'], ['Step', 'System'], ['B', 'User']]);
  });

  it('changes only the chosen element lane, inside and around branches', () => {
    const text = block('|User|', '|System|', '|User|', 'start', ':A;', 'if (Ok?) then (yes)', '  :B;', '  :C;', 'else (no)', '  :D;', 'endif', ':E;', 'stop');
    const out = run(text, setLane(doc(text), [2, 0, 0], 'System'));
    expect(lanesOf(out)).toEqual([['A', 'User'], ['decision', 'User'], ['B', 'System'], ['C', 'User'], ['D', 'User'], ['E', 'User']]);
    const last = run(text, setLane(doc(text), [2, 0, 1], 'System'));
    expect(lanesOf(last)).toEqual([['A', 'User'], ['decision', 'User'], ['B', 'User'], ['C', 'System'], ['D', 'User'], ['E', 'User']]);
    const decision = run(text, setLane(doc(text), [2], 'System'));
    expect(lanesOf(decision)).toEqual([['A', 'User'], ['decision', 'System'], ['B', 'User'], ['C', 'User'], ['D', 'User'], ['E', 'User']]);
    expect(laneNames(out)).toEqual(['User', 'System']);
  });

  it('writes the fewest switches, removing ones that no longer change anything', () => {
    const out = run(TWO, setLane(doc(TWO), [2], 'User'));
    expect(out).toBe(block('|User|', '|System|', '|User|', 'start', ':A;', ':B;', 'stop'));
    expect(laneNames(out)).toEqual(['User', 'System']);
    expect(run(out, setLane(doc(out), [2], 'System'))).toBe(block('|User|', '|System|', '|User|', 'start', ':A;', '|System|', ':B;', 'stop'));
  });

  it('keeps an element lane when it moves', () => {
    const out = run(TWO, moveByKey(doc(TWO), [2], 'up'));
    expect(lanesOf(out)).toEqual([['B', 'System'], ['A', 'User']]);
  });
});

describe('renaming, reordering and deleting lanes', () => {
  it('renames every switch naming a lane', () => {
    const text = block('|User|', 'start', ':A;', '|System|', ':B;', '|User|', ':C;', 'stop');
    const out = run(text, renameLane(doc(text), 'User', 'Customer'));
    expect(out).toBe(block('|Customer|', 'start', ':A;', '|System|', ':B;', '|Customer|', ':C;', 'stop'));
    expect(renameLane(doc(text), 'User', 'System')).toMatchObject({ ok: false, messageKey: 'flow.refused.laneTaken' });
  });

  it('reorders lanes without moving any element', () => {
    const out = run(TWO, moveLane(doc(TWO), 'System', 0));
    expect(laneNames(out)).toEqual(['System', 'User']);
    expect(lanesOf(out)).toEqual([['A', 'User'], ['B', 'System']]);
    expect(laneNames(run(out, moveLane(doc(out), 'System', 1)))).toEqual(['User', 'System']);
  });

  it('asks for a destination before deleting a lane in use (VO-037 core)', () => {
    expect(laneInUse(model(TWO), 'System')).toBe(true);
    expect(deleteLane(doc(TWO), 'System')).toMatchObject({ ok: false, messageKey: 'flow.refused.laneDestination' });
    const out = run(TWO, deleteLane(doc(TWO), 'System', 'User'));
    expect(laneNames(out)).toEqual(['User']);
    expect(lanesOf(out)).toEqual([['A', 'User'], ['B', 'User']]);
  });

  it('keeps list order when deleting the first lane', () => {
    const text = block('|A|', '|B|', '|C|', '|A|', 'start', ':x;', '|C|', ':y;', 'stop');
    const out = run(text, deleteLane(doc(text), 'A', 'C'));
    expect(laneNames(out)).toEqual(['B', 'C']);
    expect(lanesOf(out)).toEqual([['x', 'C'], ['y', 'C']]);
  });

  it('deletes an unused lane without a destination', () => {
    const text = block('|User|', '|System|', '|User|', 'start', ':A;', 'stop');
    expect(laneInUse(model(text), 'System')).toBe(false);
    const out = run(text, deleteLane(doc(text), 'System'));
    expect(out).toBe(block('|User|', 'start', ':A;', 'stop'));
  });

  it('removes every switch when the only lane is deleted', () => {
    const text = block('|User|', 'start', ':A;', 'if (Ok?) then (yes)', '  |User|', '  :B;', 'endif', 'stop');
    const out = run(text, deleteLane(doc(text), 'User'));
    expect(out).toBe(block('start', ':A;', 'if (Ok?) then (yes)', '  :B;', 'endif', 'stop'));
    expect(model(out).lanes).toEqual([]);
  });
});
