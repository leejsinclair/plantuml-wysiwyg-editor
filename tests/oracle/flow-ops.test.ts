// T138: flow operations against the command-line oracle (plantuml-1.2026.9.jar).
// VO-035 and VO-120: changing one element's lane, inside or outside a decision branch, changes that element's
// rendered lane only, and every element renders in its own lane. VO-123: every decision and loop shape the editor
// builds (two or more branches, elseif, empty branches, empty loop bodies, a stop ending a branch) renders.
import { describe, expect, it } from 'vitest';
import { applyEdits } from '../../src/core/source/edits.ts';
import { flowDoc, walk } from '../../src/core/activity/destinations.ts';
import { insert } from '../../src/core/activity/ops/insert.ts';
import { addBranch, setText } from '../../src/core/activity/ops/branches.ts';
import { addLane, setLane } from '../../src/core/activity/ops/lanes.ts';
import { addNote } from '../../src/core/activity/ops/notes.ts';
import { parseActivity } from '../../src/core/activity/parser.ts';
import type { Step } from '../../src/core/activity/model.ts';
import type { OpResult, Path } from '../../src/core/types.ts';
import { renderBlocks, svgText } from './runner.ts';

const EMPTY = '@startuml Screen-flow\nstart\nstop\n@enduml\n';

function run(text: string, make: (doc: NonNullable<ReturnType<typeof flowDoc>>) => OpResult): string {
  const op = make(flowDoc(text)!);
  if (!op.ok) throw new Error(`refused: ${op.messageKey}`);
  const out = applyEdits(text, op.edits);
  expect(parseActivity(out).diagnostics).toEqual([]);
  return out;
}

const pathOf = (text: string, label: string): Path => {
  const ref = walk(parseActivity(text).model!).find((r) => r.element.kind === 'step' && (r.element as Step).label.text === label);
  if (!ref) throw new Error(`no step ${label}`);
  return ref.path;
};

/** Each step label's rendered lane: the lane title whose column (between thick borders) holds the label. */
function renderedLanes(svg: string, labels: readonly string[]): Record<string, string> {
  const borders = [...svg.matchAll(/<line x1="([\d.]+)" y1="[\d.]+" x2="([\d.]+)" y2="[\d.]+" style="stroke:#000;stroke-width:1.5;"\/>/g)]
    .filter((m) => m[1] === m[2])
    .map((m) => Number(m[1]))
    .sort((a, b) => a - b);
  const texts = [...svg.matchAll(/<text x="([\d.]+)"[^>]*font-size="(\d+)"[^>]*>([^<]*)<\/text>/g)].map((m) => ({ x: Number(m[1]), size: m[2], text: m[3]! }));
  const column = (x: number) => borders.findIndex((b, i) => i + 1 < borders.length && x >= b && x < borders[i + 1]!);
  const titles = new Map(texts.filter((t) => t.size === '18').map((t) => [column(t.x), t.text]));
  const out: Record<string, string> = {};
  for (const label of labels) {
    const t = texts.find((x) => x.text === label && x.size !== '18');
    if (!t) throw new Error(`label ${label} not rendered`);
    out[label] = titles.get(column(t.x)) ?? '?';
  }
  return out;
}

/** A flow built only through operations: steps, a decision with steps in both branches, a loop, two lanes. */
function buildLaneFlow(): string {
  let text = EMPTY;
  text = run(text, (d) => addLane(d, 'User'));
  text = run(text, (d) => addLane(d, 'System'));
  text = run(text, (d) => insert(d, [0], 'step'));
  text = run(text, (d) => setText(d, [1], 'label', 'Enter details'));
  text = run(text, (d) => insert(d, [1], 'decision'));
  text = run(text, (d) => insert(d, [2, 0], 'step'));
  text = run(text, (d) => setText(d, [2, 0, 0], 'label', 'Check'));
  text = run(text, (d) => insert(d, [2, 0, 0], 'step'));
  text = run(text, (d) => setText(d, [2, 0, 1], 'label', 'Save'));
  text = run(text, (d) => insert(d, [2, 1], 'step'));
  text = run(text, (d) => setText(d, [2, 1, 0], 'label', 'Retry'));
  text = run(text, (d) => insert(d, [2], 'loop'));
  text = run(text, (d) => insert(d, [3, 0], 'step'));
  text = run(text, (d) => setText(d, [3, 0, 0], 'label', 'Again'));
  text = run(text, (d) => insert(d, [3], 'step'));
  text = run(text, (d) => setText(d, [4], 'label', 'Done'));
  return text;
}

const LABELS = ['Enter details', 'Check', 'Save', 'Retry', 'Again', 'Done'];

describe('lanes in the oracle render (VO-035, VO-120)', () => {
  it('changing one lane inside a branch changes only that element rendered lane', async () => {
    const base = buildLaneFlow();
    const variants: { text: string; expected: Record<string, string> }[] = [];
    const allUser = Object.fromEntries(LABELS.map((l) => [l, 'User']));
    variants.push({ text: base, expected: allUser });
    for (const label of LABELS) {
      const text = run(base, (d) => setLane(d, pathOf(base, label), 'System'));
      variants.push({ text, expected: { ...allUser, [label]: 'System' } });
    }
    // Two changes in a row, inside different branches.
    const one = run(base, (d) => setLane(d, pathOf(base, 'Check'), 'System'));
    const two = run(one, (d) => setLane(d, pathOf(one, 'Retry'), 'System'));
    variants.push({ text: two, expected: { ...allUser, Check: 'System', Retry: 'System' } });
    const back = run(two, (d) => setLane(d, pathOf(two, 'Check'), 'User'));
    variants.push({ text: back, expected: { ...allUser, Retry: 'System' } });

    const results = await renderBlocks(variants.map((v) => v.text));
    results.forEach((r, i) => {
      expect(r.ok, `${variants[i]!.text}\n${r.message}`).toBe(true);
      expect(renderedLanes(r.svg, LABELS), variants[i]!.text).toEqual(variants[i]!.expected);
    });
  });
});

describe('decision and loop shapes (VO-123)', () => {
  it('renders every shape the editor builds', async () => {
    const shapes: string[] = [];
    let text = run(EMPTY, (d) => insert(d, [0], 'decision'));
    shapes.push(text); // two empty branches
    text = run(text, (d) => addBranch(d, [1]));
    shapes.push(text); // if, elseif, else, all empty
    text = run(text, (d) => addBranch(d, [1]));
    shapes.push(text); // two elseif branches
    text = run(text, (d) => insert(d, [1, 2], 'step'));
    text = run(text, (d) => insert(d, [1, 2, 0], 'stop'));
    shapes.push(text); // a branch ending with stop
    text = run(text, (d) => insert(d, [1], 'loop'));
    shapes.push(text); // an empty repeat body
    text = run(text, (d) => insert(d, [2, 0], 'decision'));
    shapes.push(text); // a decision inside a loop
    text = run(text, (d) => addNote(d, [1, 1], 'left', 'In a branch'));
    text = run(text, (d) => addNote(d, [2, 0], 'right', 'In a body'));
    shapes.push(text); // notes at the start of a branch and a body
    shapes.push('@startuml Screen-flow\nstart\nif (Ok?) then (yes)\nendif\nwhile (More?)\nendwhile\nstop\n@enduml\n');
    shapes.push(run(shapes.at(-1)!, (d) => addBranch(d, [1]))); // an imported one-branch if, given an else

    const results = await renderBlocks(shapes);
    results.forEach((r, i) => {
      expect(r.ok, `${shapes[i]}\n${r.message}`).toBe(true);
      expect(svgText(r.svg).length).toBeGreaterThan(0);
    });
  });
});
