// T136: adding and deleting the screen-flow block (FR-012/AC8, AC13, project-file.md §4 and §7; VO-032 core,
// VO-125 core). "Add screen flow" writes `Screen-flow` with start and stop at the end of the file; deleting the
// flow clears `flowIndex`, and the inverse edits restore it.
import { describe, expect, it } from 'vitest';
import { applyEdits, invertEdits } from '../../../src/core/source/edits.ts';
import { addFlow, deleteFlow } from '../../../src/core/project/flow-block.ts';
import { blocks, remap, withKeys } from '../../../src/core/project/project.ts';

const SCREEN = '@startsalt Screen-1\n{\n}\n@endsalt\n';
let n = 0;
const key = () => `k${++n}`;

describe('add screen flow (VO-032 core)', () => {
  it('writes Screen-flow with start and stop at the end of the file and makes it the flow', () => {
    const source = SCREEN + "' trailing text\n";
    const result = addFlow(source, null);
    if (!result.ok) throw new Error('refused');
    const next = applyEdits(source, result.edits);
    expect(next).toBe(source + '@startuml Screen-flow\nstart\nstop\n@enduml\n');
    expect(result.flowIndex).toBe(1);
    expect(result.order).toEqual([0, null]);
    expect(result.name).toBe('Screen-flow');
    const state = { ...remap(withKeys({ source, flowIndex: null, lastWorking: [] }, key), next, result.order, key), flowIndex: result.flowIndex };
    const views = blocks(state);
    expect(views.map((b) => [b.kind, b.name, b.status])).toEqual([['screen', 'Screen-1', 'Editable'], ['flow', 'Screen-flow', 'Editable']]);
  });

  it('adds a line ending first when the file has none, and uses the file line ending', () => {
    const crlf = '@startsalt A\r\n{\r\n}\r\n@endsalt';
    const result = addFlow(crlf, null);
    if (!result.ok) throw new Error('refused');
    expect(applyEdits(crlf, result.edits)).toBe(crlf + '\r\n@startuml Screen-flow\r\nstart\r\nstop\r\n@enduml\r\n');
  });

  it('generates a free name when Screen-flow is taken', () => {
    const source = '@startsalt Screen-flow\n{\n}\n@endsalt\n';
    const result = addFlow(source, null);
    expect(result.ok && result.name).toBe('Screen-flow-2');
  });

  it('refuses when the project already has a screen flow', () => {
    const source = SCREEN + '@startuml Screen-flow\nstart\nstop\n@enduml\n';
    expect(addFlow(source, 1)).toMatchObject({ ok: false, messageKey: 'flow.refused.flowExists' });
  });
});

describe('delete screen flow (VO-125 core)', () => {
  const source = SCREEN + "' about the flow\n@startuml Screen-flow\nstart\nstop\n@enduml\n" + '@startuml\nA -> B\n@enduml\n';

  it('removes the block with the comment above it and clears flowIndex, undoably', () => {
    const result = deleteFlow(source, 1);
    if (!result.ok) throw new Error('refused');
    const next = applyEdits(source, result.edits);
    expect(next).toBe(SCREEN + '@startuml\nA -> B\n@enduml\n');
    expect(result.order).toEqual([0, 2]);
    const state = remap(withKeys({ source, flowIndex: 1, lastWorking: [] }, key), next, result.order, key);
    expect(state.flowIndex).toBeNull();
    expect(applyEdits(next, invertEdits(source, result.edits))).toBe(source);
  });

  it('refuses when there is no flow or the flow is the last block', () => {
    expect(deleteFlow(SCREEN, null)).toMatchObject({ ok: false, messageKey: 'flow.refused.noFlow' });
    expect(deleteFlow('@startuml Screen-flow\nstart\nstop\n@enduml\n', 0)).toMatchObject({ ok: false, messageKey: 'flow.refused.lastBlock' });
  });
});
