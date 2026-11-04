// T123: screen operations (FR-011, section 3.6, project-file.md §7; VO-026 core, VO-028, VO-031, VO-084 delete,
// VO-114, VO-117).
import { describe, expect, it } from 'vitest';
import {
  addScreen,
  applyBlockOp,
  canMove,
  deleteBlock,
  duplicateScreen,
  linkedSteps,
  moveBlock,
  renameBlock,
  type BlockOp,
} from '../../../src/core/project/screens.ts';
import { blocks, importSource, withKeys, type ProjectState } from '../../../src/core/project/project.ts';
import { applyEdits } from '../../../src/core/source/edits.ts';

const salt = (name: string | null, body = '  [OK]') => `@startsalt${name ? ` ${name}` : ''}\n{\n${body}\n}\n@endsalt\n`;
const flowBlock = (body: string, name = 'Screen-flow') => `@startuml ${name}\n${body}\n@enduml\n`;
const other = '@startuml\nAlice -> Bob : hi\n@enduml\n';

let n = 0;
const newKey = () => `k${++n}`;
const state = (source: string, flowIndex: number | null = null, lastWorking: ProjectState['lastWorking'] = []): ProjectState => ({ source, flowIndex, lastWorking });
const names = (s: ProjectState) => blocks(withKeys(s, newKey)).map((b) => `${b.kind}:${b.name ?? '-'}`);

function ok<T extends BlockOp>(op: T): Extract<T, { ok: true }> {
  if (!op.ok) throw new Error(`refused: ${op.messageKey}`);
  return op as Extract<T, { ok: true }>;
}

const LINKED_FLOW = flowBlock('start\n:[[#Login Sign in]];\n:[[#Login Again]];\n:[[#Login Third]];\n:[[#Home Go home]];\nstop');

describe('addScreen (VO-026 core, VO-114)', () => {
  it('uses the lowest unused Screen-n, ignoring case', () => {
    const s = state(salt('Screen-1') + salt('screen-3'));
    const op = addScreen(s);
    expect(op.name).toBe('Screen-2');
    expect(op.historyName).toBe('screens.history.add');
    expect(op.announceParams).toMatchObject({ name: 'Screen-2' });
  });

  it('goes after the last screen, before the flow and other content, empty, and opens it', () => {
    const s = state(salt('A') + '\n' + other + '\n' + salt('B') + '\n' + LINKED_FLOW, 3);
    const op = addScreen(s);
    const next = applyBlockOp(s, op);
    expect(names(next)).toEqual(['screen:A', 'other:-', 'screen:B', 'screen:Screen-1', 'flow:Screen-flow']);
    expect(op.order).toEqual([0, 1, 2, null, 3]);
    expect(op.open).toBe(3);
    expect(next.flowIndex).toBe(4);
    expect(next.source).toContain('@startsalt Screen-1\n{\n}\n@endsalt\n');
    // Everything that was there is unchanged.
    expect(applyEdits(next.source, [])).toContain(salt('B'));
  });

  it('goes at the end of the file when there is no screen, starting a new line if needed', () => {
    const s = state('@startuml\nA -> B\n@enduml');
    const next = applyBlockOp(s, addScreen(s));
    expect(next.source).toBe('@startuml\nA -> B\n@enduml\n\n@startsalt Screen-1\n{\n}\n@endsalt\n');
  });

  it('uses the file line ending', () => {
    const s = state('@startsalt A\r\n{\r\n}\r\n@endsalt\r\n');
    const next = applyBlockOp(s, addScreen(s));
    expect(next.source).toBe('@startsalt A\r\n{\r\n}\r\n@endsalt\r\n\r\n@startsalt Screen-1\r\n{\r\n}\r\n@endsalt\r\n');
  });

  it('accepts a name chosen by the caller (create-from-step)', () => {
    const s = state(salt('A'));
    expect(names(applyBlockOp(s, addScreen(s, { name: 'Enter-credentials' })))).toEqual(['screen:A', 'screen:Enter-credentials']);
  });

  it('remaps lastWorking positions', () => {
    const s = state(salt('A') + other + salt('B') + LINKED_FLOW, 3, [{ blockIndex: 3, text: 'x' }]);
    expect(applyBlockOp(s, addScreen(s)).lastWorking).toEqual([{ blockIndex: 4, text: 'x' }]);
  });
});

describe('renameBlock (VO-027 core, VO-028, VO-029 core)', () => {
  it('converts the typed name on commit', () => {
    const s = state(salt('Screen-1'));
    const op = ok(renameBlock(s, 0, 'Sign in'));
    expect(op.name).toBe('Sign-in');
    expect(applyBlockOp(s, op).source).toBe(salt('Sign-in'));
  });

  it('refuses a name equal to another block after case folding, naming that block, and changes nothing', () => {
    const s = state(salt('Login') + salt('Home'));
    const op = renameBlock(s, 1, 'LOGIN');
    expect(op).toEqual({ ok: false, messageKey: 'screens.rename.duplicate', params: { name: 'Login' } });
  });

  it('refuses a name matching the flow, which shares the namespace', () => {
    const s = state(salt('Login') + LINKED_FLOW, 1);
    expect(renameBlock(s, 0, 'screen flow')).toMatchObject({ ok: false, params: { name: 'Screen-flow' } });
  });

  it('refuses a name that converts to nothing', () => {
    expect(renameBlock(state(salt('A')), 0, '  123 !! ')).toEqual({ ok: false, messageKey: 'screens.rename.empty' });
  });

  it('allows a change of case of its own name', () => {
    const s = state(salt('login'));
    expect(applyBlockOp(s, ok(renameBlock(s, 0, 'Login'))).source).toBe(salt('Login'));
  });

  it('names an unnamed screen', () => {
    const s = state(salt(null));
    const op = ok(renameBlock(s, 0, 'Home page'));
    expect(op.previous).toBeNull();
    expect(applyBlockOp(s, op).source).toBe(salt('Home-page'));
  });

  it('updates every step linking to the screen in the same edits, and reports them', () => {
    const s = state(salt('Login') + salt('Home') + LINKED_FLOW, 2);
    expect(linkedSteps(s, 0).map((st) => st.label.text)).toEqual(['Sign in', 'Again', 'Third']);
    const op = ok(renameBlock(s, 0, 'Sign in'));
    expect(op.affected).toHaveLength(3);
    expect(op.announceKey).toBe('screens.renamedWithLinks');
    expect(op.announceParams).toMatchObject({ old: 'Login', name: 'Sign-in', count: 3 });
    const next = applyBlockOp(s, op);
    expect(next.source.match(/\[\[#Sign-in /g)).toHaveLength(3);
    expect(next.source).toContain('[[#Home Go home]]');
    expect(next.flowIndex).toBe(2);
  });

  it('is unchanged when the converted name is the current one', () => {
    const op = ok(renameBlock(state(salt('Sign-in')), 0, 'Sign in'));
    expect(op.edits).toEqual([]);
  });
});

describe('duplicateScreen (VO-117)', () => {
  it('goes directly after the original with a Copy-of name, no incoming links, and opens', () => {
    const s = state(salt('Login') + salt('Home') + LINKED_FLOW, 2);
    const op = ok(duplicateScreen(s, 0));
    expect(op.order).toEqual([0, null, 1, 2]);
    expect(op.open).toBe(1);
    const next = applyBlockOp(s, op);
    const views = blocks(withKeys(next, newKey));
    expect(views.map((b) => b.name)).toEqual(['Login', 'Copy-of-Login', 'Home', 'Screen-flow']);
    expect(views[1]!.incomingLinks).toBe(0);
    expect(views[0]!.incomingLinks).toBe(3);
    expect(next.source.slice(views[1]!.start, views[1]!.end)).toBe(salt('Copy-of-Login'));
    expect(next.flowIndex).toBe(3);
  });

  it('adds -2 on a collision and gives an unnamed original a Screen-n copy', () => {
    const s = state(salt('Login') + salt('Copy-of-Login') + salt(null));
    expect(names(applyBlockOp(s, ok(duplicateScreen(s, 0))))[1]).toBe('screen:Copy-of-Login-2');
    expect(names(applyBlockOp(s, ok(duplicateScreen(s, 2))))[3]).toBe('screen:Screen-1');
  });

  it('copies a screen that is the last line of a file with no final newline', () => {
    const s = state('@startsalt A\n{\n}\n@endsalt');
    const next = applyBlockOp(s, ok(duplicateScreen(s, 0)));
    expect(names(next)).toEqual(['screen:A', 'screen:Copy-of-A']);
  });
});

describe('moveBlock (VO-114)', () => {
  const source = "' about A\n" + salt('A') + '\n' + LINKED_FLOW + '\n' + other + "\n' about B\n" + salt('B') + '\nfree text\n' + salt('C');

  it('swaps screens only, carrying the comment lines directly above them; the flow and text stay in place', () => {
    const s = state(source, 1, [{ blockIndex: 1, text: 'flow' }]);
    const op = ok(moveBlock(s, 3, 'up'));
    expect(op.order).toEqual([3, 1, 2, 0, 4]);
    const next = applyBlockOp(s, op);
    expect(next.source).toBe("' about B\n" + salt('B') + '\n' + LINKED_FLOW + '\n' + other + "\n' about A\n" + salt('A') + '\nfree text\n' + salt('C'));
    expect(next.flowIndex).toBe(1);
    expect(next.lastWorking).toEqual([{ blockIndex: 1, text: 'flow' }]);
    expect(op.announceKey).toBe('screens.movedUp');
  });

  it('refuses moving the first screen up or the last screen down', () => {
    const s = state(source, 1);
    expect(canMove(s, 0, 'up')).toBe(false);
    expect(canMove(s, 4, 'down')).toBe(false);
    expect(canMove(s, 0, 'down')).toBe(true);
    expect(moveBlock(s, 0, 'up')).toMatchObject({ ok: false, messageKey: 'screens.move.first' });
    expect(moveBlock(s, 4, 'down')).toMatchObject({ ok: false, messageKey: 'screens.move.last' });
  });

  it('reorders other content among other content only', () => {
    const s = state(other + salt('A') + '@startmindmap\n* root\n@endmindmap\n');
    const next = applyBlockOp(s, ok(moveBlock(s, 0, 'down')));
    expect(next.source).toBe('@startmindmap\n* root\n@endmindmap\n' + salt('A') + other);
  });

  it('keeps a file without a final newline that way when the last block moves', () => {
    const s = state(salt('A') + '\n' + '@startsalt B\n{\n}\n@endsalt');
    const next = applyBlockOp(s, ok(moveBlock(s, 1, 'up')));
    expect(next.source).toBe('@startsalt B\n{\n}\n@endsalt\n\n' + salt('A').slice(0, -1));
  });
});

describe('deleteBlock (VO-031, VO-084, VO-030 core)', () => {
  it('refuses to delete the only block, with a reason', () => {
    expect(deleteBlock(state(salt('A')), 0)).toEqual({ ok: false, messageKey: 'screens.delete.last' });
    expect(deleteBlock(state(other), 0)).toMatchObject({ ok: false, messageKey: 'screens.delete.last' });
  });

  it('removes the block with its comments, tidies a blank line, and opens the next screen', () => {
    const s = state(salt('A') + "\n' about B\n" + salt('B') + '\n' + salt('C'));
    const op = ok(deleteBlock(s, 1));
    expect(op.order).toEqual([0, 2]);
    expect(op.open).toBe(1);
    expect(applyBlockOp(s, op).source).toBe(salt('A') + '\n' + salt('C'));
  });

  it('opens the previous screen when the last screen is deleted', () => {
    const s = state(salt('A') + salt('B') + LINKED_FLOW, 2);
    const op = ok(deleteBlock(s, 1));
    expect(op.open).toBe(0);
    expect(applyBlockOp(s, op).flowIndex).toBe(1);
  });

  it('reports the steps linking to a deleted screen; they are kept and become broken', () => {
    const s = state(salt('Login') + salt('Home') + LINKED_FLOW, 2);
    const op = ok(deleteBlock(s, 0));
    expect(op.affected).toHaveLength(3);
    expect(op.announceParams).toMatchObject({ name: 'Login', count: 3 });
    const next = applyBlockOp(s, op);
    expect(next.source).toContain('[[#Login Sign in]]');
    expect(next.flowIndex).toBe(1);
  });

  it('deletes other content as a unit and drops metadata of deleted blocks', () => {
    const s = state(salt('A') + other + LINKED_FLOW, 2, [{ blockIndex: 1, text: 'x' }, { blockIndex: 2, text: 'y' }]);
    const next = applyBlockOp(s, ok(deleteBlock(s, 1)));
    expect(next.source).toBe(salt('A') + LINKED_FLOW);
    expect(next.flowIndex).toBe(1);
    expect(next.lastWorking).toEqual([{ blockIndex: 1, text: 'y' }]);
  });

  it('removes the flow choice when the flow itself is deleted', () => {
    const s = state(salt('A') + LINKED_FLOW, 1);
    expect(applyBlockOp(s, ok(deleteBlock(s, 1))).flowIndex).toBeNull();
  });
});

describe('order and names survive download and re-import (VO-114)', () => {
  it('re-imports a project built with every operation in the same order with the same names', () => {
    let s = state(salt('Screen-1'));
    s = applyBlockOp(s, addScreen(s));
    s = applyBlockOp(s, addScreen(s));
    s = applyBlockOp(s, ok(renameBlock(s, 1, 'Sign in')));
    s = applyBlockOp(s, ok(duplicateScreen(s, 1)));
    s = applyBlockOp(s, ok(moveBlock(s, 3, 'up')));
    s = applyBlockOp(s, ok(deleteBlock(s, 0)));
    const before = names(s);
    expect(before).toEqual(['screen:Sign-in', 'screen:Screen-3', 'screen:Copy-of-Sign-in']);
    const reimported = importSource(s.source);
    expect(reimported.source).toBe(s.source);
    expect(names(reimported)).toEqual(before);
  });
});
