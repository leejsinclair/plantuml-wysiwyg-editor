import { describe, expect, it } from 'vitest';
import {
  blocks,
  chooseFlow,
  createProject,
  flowAfterRedivision,
  importSource,
  nextLastWorking,
  remap,
  withKeys,
} from '../../../src/core/project/project.ts';

const screen = (name: string | null, body = '  [OK]') => `@startsalt${name ? ` ${name}` : ''}\n{\n${body}\n}\n@endsalt\n`;
const activity = (name: string, body = 'start\n:Go;\nstop') => `@startuml ${name}\n${body}\n@enduml\n`;
let n = 0;
const newKey = () => `k${++n}`;

describe('createProject', () => {
  it('is "Untitled project" with one empty screen named Screen-1 and no flow (data-model §7.6)', () => {
    const p = createProject();
    expect(p.name).toBe('Untitled project');
    expect(p.source).toBe('@startsalt Screen-1\n{\n}\n@endsalt\n');
    expect(p.flowIndex).toBeNull();
    expect(p.lastWorking).toEqual([]);
    const [only] = blocks(withKeys(p, newKey));
    expect(only).toMatchObject({ kind: 'screen', name: 'Screen-1', status: 'Editable' });
  });
});

describe('flow choice (FR-006/AC14, AC18)', () => {
  it('chooses the first activity block in category 1 or 2 on import', () => {
    const source = screen('A') + activity('Bad', 'start\nif (x) then (y)\nstop') + activity('Locked', 'start\nfork\n:a;\nfork again\n:b;\nend fork\nstop') + activity('Later');
    expect(chooseFlow(source)).toBe(2);
    expect(importSource(source)).toEqual({ source, flowIndex: 2, lastWorking: [] });
  });

  it('gives an empty file one new screen, and a file with no blocks one appended in its line ending', () => {
    expect(importSource('')).toEqual({ source: '@startsalt Screen-1\n{\n}\n@endsalt\n', flowIndex: null, lastWorking: [] });
    expect(importSource("' notes\r\n").source).toBe("' notes\r\n@startsalt Screen-1\r\n{\r\n}\r\n@endsalt\r\n");
    expect(importSource("' notes").source).toBe("' notes\n@startsalt Screen-1\n{\n}\n@endsalt\n");
  });

  it('keeps the flow once set, even when it becomes invalid or source-only', () => {
    const state = withKeys({ source: screen('A') + activity('Flow', 'start\nif (x) then (y)\nstop'), flowIndex: 1, lastWorking: [] }, newKey);
    const view = blocks(state);
    expect(view[1]).toMatchObject({ kind: 'flow', status: 'Error' });
  });

  it('after re-division keeps the block with the flow name, else the first activity block', () => {
    const source = activity('Other') + activity('Screen-flow') + screen('S');
    expect(flowAfterRedivision(source, [0, 1, 2], 'Screen-flow')).toBe(1);
    expect(flowAfterRedivision(source, [0, 1, 2], 'Gone')).toBe(0);
    expect(flowAfterRedivision(source, [2], 'Gone')).toBeNull();
  });
});

describe('blocks()', () => {
  it('derives kind, status, reason, render status, incoming links and name flags', () => {
    const source = [
      screen('Login'),
      screen('LOGIN'),
      screen(null),
      screen('1st'),
      screen(null),
      '@startuml\nAlice -> Bob\n@enduml\n',
      activity('Screen-flow', 'start\n:[[#Login Sign in]];\n:[[#Login Again]];\n:[[#LOGIN x]];\nstop'),
    ].join('');
    const state = withKeys({ source, flowIndex: 6, lastWorking: [] }, newKey);
    const renders = new Map([[state.keys[5]!, 'failed' as const], [state.keys[0]!, 'rendered' as const]]);
    const view = blocks(state, renders);
    expect(view.map((b) => b.kind)).toEqual(['screen', 'screen', 'screen', 'screen', 'screen', 'other', 'flow']);
    expect(view.map((b) => b.nameFlag)).toEqual(['duplicate', 'duplicate', null, 'not-allowed', null, null, null]);
    expect(view.map((b) => b.untitledNumber)).toEqual([null, null, 1, null, 2, null, null]);
    expect(view.map((b) => b.incomingLinks)).toEqual([2, 1, 0, 0, 0, 0, 0]);
    expect(view[0]!.renderStatus).toBe('rendered');
    expect(view[1]!.renderStatus).toBe('Not yet checked');
    expect(view[5]).toMatchObject({ status: 'Cannot be rendered', renderStatus: 'failed' });
    expect(view[6]).toMatchObject({ kind: 'flow', status: 'Editable', reasonKey: null });
    expect(view.map((b) => b.key)).toEqual(state.keys);
    expect(source.slice(view[2]!.start, view[2]!.end)).toBe(screen(null));
  });

  it('marks a block that has a last working version', () => {
    const state = withKeys({ source: screen('A', '  {'), flowIndex: null, lastWorking: [{ blockIndex: 0, text: screen('A') }] }, newKey);
    expect(blocks(state)[0]).toMatchObject({ status: 'Error', hasLastWorking: true });
  });
});

describe('lastWorking transitions (data-model §3.2)', () => {
  const valid = screen('A');
  const broken = screen('A', '  {');

  it('records the previous text when a screen becomes invalid, and removes it when it is valid again', () => {
    const first = nextLastWorking(valid, broken, null, []);
    expect(first).toEqual([{ blockIndex: 0, text: valid }]);
    expect(nextLastWorking(broken, screen('A', '  {\n  x'), null, first)).toEqual(first);
    expect(nextLastWorking(broken, valid, null, first)).toEqual([]);
  });

  it('keeps nothing for a block that has never been valid, nor for other content', () => {
    expect(nextLastWorking(broken, screen('A', '  {\n  x'), null, [])).toEqual([]);
    const flowOk = activity('F');
    const flowBad = activity('F', 'start\nif (x) then (y)\nstop');
    expect(nextLastWorking(flowOk, flowBad, null, [])).toEqual([]);
    expect(nextLastWorking(flowOk, flowBad, 0, [])).toEqual([{ blockIndex: 0, text: flowOk }]);
  });
});

describe('remap (R-4)', () => {
  it('moves flowIndex, lastWorking and keys with their blocks; new blocks get new keys', () => {
    const state = withKeys({ source: screen('A') + screen('B') + activity('F'), flowIndex: 2, lastWorking: [{ blockIndex: 1, text: 'x' }] }, newKey);
    const [ka, kb, kf] = state.keys;
    // Reorder B before A, and insert a new block at the end.
    const next = remap(state, screen('B') + screen('A') + activity('F') + screen('C'), [1, 0, 2, null], newKey);
    expect(next.flowIndex).toBe(2);
    expect(next.lastWorking).toEqual([{ blockIndex: 0, text: 'x' }]);
    expect(next.keys.slice(0, 3)).toEqual([kb, ka, kf]);
    expect(next.keys[3]).not.toBe(undefined);
    expect(new Set(next.keys).size).toBe(4);
  });

  it('clears flowIndex and drops entries of deleted blocks', () => {
    const state = withKeys({ source: screen('A') + activity('F'), flowIndex: 1, lastWorking: [{ blockIndex: 1, text: 'x' }] }, newKey);
    const next = remap(state, screen('A'), [0], newKey);
    expect(next.flowIndex).toBeNull();
    expect(next.lastWorking).toEqual([]);
  });
});
