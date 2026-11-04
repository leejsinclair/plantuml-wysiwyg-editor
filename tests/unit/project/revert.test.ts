// T104: "Revert to last working version" (FR-010/AC4, data-model §3.2 and §7.4). VO-109 core: one operation
// restores the block's last working version, and its `lastWorking` entry goes away once applied.
import { describe, expect, it } from 'vitest';
import { revertToLastWorking } from '../../../src/core/project/revert.ts';
import { nextLastWorking, type ProjectState } from '../../../src/core/project/project.ts';
import { split } from '../../../src/core/blocks/split.ts';
import { classify } from '../../../src/core/blocks/classify.ts';
import { applyEdits } from '../../../src/core/source/edits.ts';

const GOOD = '@startsalt Login\n{\n  Name | "     "\n  [Save]\n}\n@endsalt\n';
const BROKEN = '@startsalt Login\n{\n  Name | "     "\n  [Save\n@endsalt\n';
const FLOW_GOOD = '@startuml Screen-flow\nstart\n:Sign in;\nstop\n@enduml\n';
const FLOW_BROKEN = '@startuml Screen-flow\nstart\nif (x\nstop\n@enduml\n';
const OTHER = '@startuml\nAlice -> Bob\n@enduml\n';

const blockTexts = (source: string) => split(source).filter((s) => s.type === 'block').map((s) => source.slice(s.start, s.end));

describe('revertToLastWorking', () => {
  it('restores the last working version of an invalid screen as one operation', () => {
    expect(classify(BROKEN).category).toBe(3);
    const state: ProjectState = { source: 'head\n' + BROKEN + OTHER, flowIndex: null, lastWorking: [{ blockIndex: 0, text: GOOD }] };
    const op = revertToLastWorking(state, 0);
    expect(op.ok).toBe(true);
    if (!op.ok) return;
    expect(op.historyName).toBe('blocks.history.revert');
    expect(op.announceKey).toBe('blocks.announce.reverted');
    expect(op.select).toEqual([]);
    const out = applyEdits(state.source, op.edits);
    expect(out).toBe('head\n' + GOOD + OTHER);
    // The edits stay inside the block.
    for (const e of op.edits) {
      expect(e.start).toBeGreaterThanOrEqual(5);
      expect(e.end).toBeLessThanOrEqual(5 + BROKEN.length);
    }
    // Once applied, the block parses again, so its entry is removed (data-model §7.4).
    expect(nextLastWorking(state.source, out, state.flowIndex, state.lastWorking)).toEqual([]);
  });

  it('reverts the flow and keeps other entries', () => {
    const source = BROKEN + FLOW_BROKEN;
    const state: ProjectState = { source, flowIndex: 1, lastWorking: [{ blockIndex: 0, text: GOOD }, { blockIndex: 1, text: FLOW_GOOD }] };
    const op = revertToLastWorking(state, 1);
    expect(op.ok).toBe(true);
    if (!op.ok) return;
    const out = applyEdits(source, op.edits);
    expect(blockTexts(out)).toEqual([BROKEN, FLOW_GOOD]);
    expect(nextLastWorking(source, out, 1, state.lastWorking)).toEqual([{ blockIndex: 0, text: GOOD }]);
  });

  it('keeps the minimal edit: text the two versions share is not rewritten', () => {
    const state: ProjectState = { source: BROKEN, flowIndex: null, lastWorking: [{ blockIndex: 0, text: GOOD }] };
    const op = revertToLastWorking(state, 0);
    if (!op.ok) throw new Error('refused');
    const replaced = op.edits.reduce((n, e) => n + (e.end - e.start), 0);
    expect(replaced).toBeLessThan(BROKEN.length / 2);
  });

  it('is refused, changing nothing, for a block with no last working version (FR-010/AC8)', () => {
    const state: ProjectState = { source: BROKEN + OTHER, flowIndex: null, lastWorking: [] };
    expect(revertToLastWorking(state, 0)).toEqual({ ok: false, messageKey: 'blocks.revert.none' });
    expect(revertToLastWorking(state, 7)).toEqual({ ok: false, messageKey: 'blocks.revert.none' });
  });

  it('is refused when the block already holds its last working version', () => {
    const state: ProjectState = { source: GOOD, flowIndex: null, lastWorking: [{ blockIndex: 0, text: GOOD }] };
    expect(revertToLastWorking(state, 0)).toEqual({ ok: false, messageKey: 'blocks.revert.none' });
  });
});
