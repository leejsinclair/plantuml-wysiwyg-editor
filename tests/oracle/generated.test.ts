// T180: generated content (VO-046, SC-004). The reference login form and a three-screen project with a decision
// flow are built only through the core operations, then every generated block renders in the command-line
// oracle with every typed text present. The in-browser renderer is compared with the oracle by
// tests/e2e/oracle-parity.spec.ts over the same blocks.
import { describe, expect, it } from 'vitest';
import { applyEdits } from '../../src/core/source/edits.ts';
import { parseSalt } from '../../src/core/salt/parser.ts';
import { flowDoc } from '../../src/core/activity/destinations.ts';
import type { ScreenDoc } from '../../src/core/salt/destinations.ts';
import type { OpResult } from '../../src/core/types.ts';
import { insert } from '../../src/core/salt/ops/insert.ts';
import { insertRow } from '../../src/core/salt/ops/rows-columns.ts';
import { setProperty } from '../../src/core/salt/ops/properties.ts';
import { insert as insertFlow } from '../../src/core/activity/ops/insert.ts';
import { setText } from '../../src/core/activity/ops/branches.ts';
import { setLink } from '../../src/core/activity/ops/links.ts';
import { addFlow } from '../../src/core/project/flow-block.ts';
import { addScreen, applyBlockOp } from '../../src/core/project/screens.ts';
import type { ProjectState } from '../../src/core/project/project.ts';
import { split } from '../../src/core/blocks/split.ts';
import { renderBlocks, svgHasText } from './runner.ts';

function doc(text: string): ScreenDoc {
  const r = parseSalt(text);
  expect(r.diagnostics, text).toEqual([]);
  return { text, model: r.model! };
}
function run(d: ScreenDoc, op: OpResult): ScreenDoc {
  if (!op.ok) throw new Error(`refused: ${op.messageKey}`);
  return doc(applyEdits(d.text, op.edits));
}
const blocksOf = (source: string): string[] =>
  split(source).flatMap((s) => (s.type === 'block' ? [source.slice(s.start, s.end)] : []));

/** The reference login form: Username and Password with their fields, and a Login button. */
function loginForm(name: string): string {
  let d = doc(`@startsalt ${name}\n{\n.\n}\n@endsalt\n`);
  d = run(d, insert(d, [0, 0], { item: 'Form' }));
  d = run(d, setProperty(d, [0, 0, 0, 0], 'text', 'Username'));
  d = run(d, setProperty(d, [0, 0, 1, 0], 'text', 'Password'));
  d = run(d, insertRow(d, [0, 0, 1, 0]));
  d = run(d, insert(d, [0, 0, 2, 0], { item: 'Button' }));
  d = run(d, setProperty(d, [0, 0, 2, 0], 'label', 'Login'));
  return d.text;
}

/** Three screens (the login form and two added ones) and a flow with a decision linking to them. */
function threeScreenProject(): string {
  let state: ProjectState = { source: loginForm('Screen-1'), flowIndex: null, lastWorking: [] };
  for (let i = 0; i < 2; i++) {
    const op = addScreen(state);
    state = applyBlockOp(state, op);
  }
  const flow = addFlow(state.source, state.flowIndex);
  if (!flow.ok) throw new Error(flow.messageKey);
  let source = applyEdits(state.source, flow.edits);

  const edit = (make: (d: NonNullable<ReturnType<typeof flowDoc>>) => OpResult): void => {
    const seg = split(source).filter((x) => x.type === 'block').at(-1)!;
    const d = flowDoc(source.slice(seg.start, seg.end), seg.start)!;
    const op = make(d);
    if (!op.ok) throw new Error(`refused: ${op.messageKey}`);
    source = applyEdits(source, op.edits);
  };
  edit((d) => insertFlow(d, [0], 'step'));
  edit((d) => setText(d, [1], 'label', 'Enter credentials'));
  edit((d) => insertFlow(d, [1], 'decision'));
  edit((d) => insertFlow(d, [2, 0], 'step'));
  edit((d) => setText(d, [2, 0, 0], 'label', 'Show dashboard'));
  edit((d) => setLink(d, [1], 'Screen-2'));
  edit((d) => setLink(d, [2, 0, 0], 'Screen-3'));
  return source;
}

describe('generated blocks render in the oracle (VO-046, SC-004)', () => {
  it('renders the login form with every typed text', async () => {
    const [r] = await renderBlocks([loginForm('Login')]);
    expect(r!.ok, r!.message ?? '').toBe(true);
    for (const t of ['Username', 'Password', 'Login']) expect(svgHasText(r!.svg, t), t).toBe(true);
  });

  it('renders every block of a three-screen project with a decision flow, nothing dropped', async () => {
    const source = threeScreenProject();
    const blocks = blocksOf(source);
    expect(blocks).toHaveLength(4);
    const results = await renderBlocks(blocks);
    results.forEach((r, i) => expect(r.ok, `${blocks[i]}\n${r.message}`).toBe(true));
    const flow = results[3]!.svg;
    for (const t of ['Enter credentials', 'Show dashboard']) expect(svgHasText(flow, t), t).toBe(true);
    expect(flow).toMatch(/href="#Screen-2"/);
    expect(flow).toMatch(/href="#Screen-3"/);
  });
});
