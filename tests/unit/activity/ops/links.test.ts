// T157: link operations (FR-013/AC1, AC5, AC6; VO-038 core, VO-041 core).
// `setLink` links, changes and removes a link; creating a screen from a step labelled "Enter credentials"
// gives `Enter-credentials`, linked in one change; a label with `[x]`, `]]` and `|` round-trips.
import { describe, expect, it } from 'vitest';
import { applyEdits } from '../../../../src/core/source/edits.ts';
import { flowDoc, walk, type FlowDoc } from '../../../../src/core/activity/destinations.ts';
import { addLinkedStep, createAndLink, setLink } from '../../../../src/core/activity/ops/links.ts';
import { parseActivity } from '../../../../src/core/activity/parser.ts';
import type { Step } from '../../../../src/core/activity/model.ts';
import { blocks, withKeys } from '../../../../src/core/project/project.ts';

const block = (...lines: string[]) => ['@startuml Screen-flow', ...lines, '@enduml', ''].join('\n');
const doc = (text: string): FlowDoc => {
  const d = flowDoc(text, 0);
  if (!d) throw new Error('not a flow');
  return d;
};
const stepAt = (text: string, label: string): { step: Step; path: readonly number[] } => {
  const ref = walk(parseActivity(text).model!).find((r) => r.element.kind === 'step' && (r.element as Step).label.text === label);
  if (!ref) throw new Error(`no step ${label}`);
  return { step: ref.element as Step, path: ref.path };
};
const apply = (text: string, op: ReturnType<typeof setLink>): string => {
  if (!op.ok) throw new Error(`refused: ${op.messageKey}`);
  const out = applyEdits(text, op.edits);
  expect(parseActivity(out).diagnostics).toEqual([]);
  return out;
};

describe('setLink', () => {
  it('links a plain step, changes the target, and removes the link again', () => {
    const text = block('start', ':Enter credentials;', 'stop');
    const { path } = stepAt(text, 'Enter credentials');
    const linked = apply(text, setLink(doc(text), path, 'Sign-in'));
    expect(linked).toBe(block('start', ':[[#Sign-in Enter credentials]];', 'stop'));
    expect(stepAt(linked, 'Enter credentials').step.link?.target).toBe('Sign-in');

    const changed = apply(linked, setLink(doc(linked), path, 'Home'));
    expect(changed).toBe(block('start', ':[[#Home Enter credentials]];', 'stop'));

    const removed = apply(changed, setLink(doc(changed), path, null));
    expect(removed).toBe(text);
  });

  it('refuses a path that is not a step', () => {
    const text = block('start', ':A;', 'stop');
    const op = setLink(doc(text), [0], 'Sign-in');
    expect(op.ok).toBe(false);
  });

  it('round-trips a label containing [x], ]] and | (VO-041 core)', () => {
    const label = 'a [x] ]] b | c';
    const text = block('start', ':plain;', 'stop');
    const { path } = stepAt(text, 'plain');
    const renamed = block('start', `:${label};`, 'stop');
    const linked = apply(renamed, setLink(doc(renamed), stepAt(renamed, label).path, 'Target'));
    const { step } = stepAt(linked, label);
    expect(step.label.text).toBe(label);
    expect(step.link?.target).toBe('Target');
    const unlinked = apply(linked, setLink(doc(linked), path, null));
    expect(stepAt(unlinked, label).step.label.text).toBe(label);
    expect(stepAt(unlinked, label).step.link).toBeNull();
  });
});

describe('createAndLink (VO-038 core)', () => {
  it('names the new screen from the step label and links the step', () => {
    const text = block('start', ':Enter credentials;', 'stop');
    const source = `@startsalt Screen-1\n{\n}\n@endsalt\n${text}`;
    const state = { ...withKeys({ source, flowIndex: 1, lastWorking: [] }, (() => { let n = 0; return () => `k${++n}`; })()) };
    const flowView = blocks(state).find((b) => b.kind === 'flow')!;
    const flowText = source.slice(flowView.start, flowView.end);
    const d = flowDoc(flowText, flowView.start)!;
    const { path } = stepAt(flowText, 'Enter credentials');

    const result = createAndLink(state, d, path);
    if ('ok' in result) throw new Error(`refused: ${result.messageKey}`);
    expect(result.screenName).toBe('Enter-credentials');
    const next = applyEdits(source, [...result.linkEdits, ...result.screenOp.edits]);
    expect(next).toContain(':[[#Enter-credentials Enter credentials]];');
    expect(next).toContain('@startsalt Enter-credentials');
  });
});

describe('addLinkedStep', () => {
  it('adds a linked step labelled for the element before the final stop, selected', () => {
    const text = block('start', ':Open;', 'stop');
    const op = addLinkedStep(doc(text), 'Sign in', 'Login');
    const out = apply(text, op);
    expect(out).toContain(':[[#Login Sign in]];');
    expect(out.indexOf('Sign in')).toBeGreaterThan(out.indexOf(':Open;'));
    expect(out.indexOf('Sign in')).toBeLessThan(out.lastIndexOf('stop'));
    const { step } = stepAt(out, 'Sign in');
    expect(step.link?.target).toBe('Login');
    if (op.ok) expect(op.select).toEqual([2]);
  });
});

describe('addLinkedStep with a selection', () => {
  it('inserts the linked step after the selected element', () => {
    const text = block('start', ':A;', ':B;', 'stop');
    const out = apply(text, addLinkedStep(doc(text), 'Home', 'Home', [1]));
    expect(out.indexOf(':[[#Home Home]];')).toBeGreaterThan(out.indexOf(':A;'));
    expect(out.indexOf(':[[#Home Home]];')).toBeLessThan(out.indexOf(':B;'));
  });
});
