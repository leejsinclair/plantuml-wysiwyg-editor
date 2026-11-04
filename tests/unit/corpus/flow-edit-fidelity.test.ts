// T137: edit fidelity for flows (FR-004/AC1, FR-020/AC1, US3-AS6; VO-020 flows). For every corpus file with a screen
// flow, one flow operation changes the file only within the edited element's source text: byte order mark, line
// endings, comments, other blocks and text between blocks are untouched.
import { describe, expect, it } from 'vitest';
import { corpusFiles } from './corpus.ts';
import { decode, encode } from '../../../src/core/source/decode.ts';
import { applyEdits } from '../../../src/core/source/edits.ts';
import { blocks, importSource, withKeys } from '../../../src/core/project/project.ts';
import { flowDoc, walk } from '../../../src/core/activity/destinations.ts';
import { setText } from '../../../src/core/activity/ops/branches.ts';
import { insert } from '../../../src/core/activity/ops/insert.ts';
import type { Step } from '../../../src/core/activity/model.ts';

let n = 0;
const key = () => `k${++n}`;

interface FlowCase {
  name: string;
  text: string;
  bom: boolean;
  start: number;
  end: number;
}

function flowCases(): FlowCase[] {
  const out: FlowCase[] = [];
  for (const file of corpusFiles()) {
    const decoded = decode(file.bytes);
    if (!decoded.ok) continue;
    const state = withKeys(importSource(decoded.text), key);
    const flow = blocks(state).find((b) => b.kind === 'flow' && b.classification.activity?.model);
    if (flow) out.push({ name: file.name, text: state.source, bom: decoded.bom, start: flow.start, end: flow.end });
  }
  return out;
}

/** The changed region between two texts: [start, endBefore) in `before` became [start, endAfter) in `after`. */
function changed(before: string, after: string) {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let tail = 0;
  while (tail < before.length - start && tail < after.length - start && before[before.length - 1 - tail] === after[after.length - 1 - tail]) tail++;
  return { start, endBefore: before.length - tail, endAfter: after.length - tail };
}

const cases = flowCases();

describe('flow edit fidelity (VO-020, flows)', () => {
  it('finds the corpus flows', () => {
    expect(cases.length).toBeGreaterThanOrEqual(8);
  });

  it.each(cases.map((c) => [c.name, c] as const))('%s: relabelling a step changes only that label', (_name, c) => {
    const doc = flowDoc(c.text.slice(c.start, c.end), c.start)!;
    const ref = walk(doc.model).find((r) => r.element.kind === 'step');
    if (!ref) return;
    const step = ref.element as Step;
    const op = setText(doc, ref.path, 'label', 'Edited label');
    if (!op.ok) throw new Error(op.messageKey);
    const after = applyEdits(c.text, op.edits);
    const region = changed(c.text, after);
    expect(region.start).toBeGreaterThanOrEqual(c.start + step.label.raw.start);
    expect(region.endBefore).toBeLessThanOrEqual(c.start + step.label.raw.end);
    expect(after.slice(region.start, region.endAfter)).not.toBe('');
    // Bytes outside the element are identical, including the byte order mark.
    const bytesBefore = encode(c.text, c.bom);
    const bytesAfter = encode(after, c.bom);
    expect(bytesAfter.slice(0, 3)).toEqual(bytesBefore.slice(0, 3));
  });

  it.each(cases.map((c) => [c.name, c] as const))('%s: inserting a step adds only that step line', (_name, c) => {
    const doc = flowDoc(c.text.slice(c.start, c.end), c.start)!;
    const op = insert(doc, null, 'step');
    if (!op.ok) throw new Error(op.messageKey);
    const after = applyEdits(c.text, op.edits);
    const region = changed(c.text, after);
    expect(region.endBefore).toBe(region.start);
    const added = after.slice(region.start, region.endAfter);
    expect(added.replace(/\r\n|\r|\n/g, '\n')).toMatch(/^(?:\s*:Step;\n|\n\s*:Step;)$/);
    expect(region.start).toBeGreaterThan(c.start);
    expect(region.start).toBeLessThan(c.end);
  });
});
