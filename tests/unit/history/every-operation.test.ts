// T181: undo and redo for every FR-007/AC10 operation kind with an unrelated edit before it (VO-088).
// Each operation's edits are applied to a project file that already carries an unrelated change; the inverse
// restores the text exactly (the unrelated change stays), and applying the edits again gives the same result.
import { describe, expect, it } from 'vitest';
import { applyEdits, invertEdits } from '../../../src/core/source/edits.ts';
import { flowDoc } from '../../../src/core/activity/destinations.ts';
import { parseSalt } from '../../../src/core/salt/parser.ts';
import type { ScreenDoc } from '../../../src/core/salt/destinations.ts';
import { insert as insertSalt } from '../../../src/core/salt/ops/insert.ts';
import { remove as removeSalt } from '../../../src/core/salt/ops/remove.ts';
import { insertColumn, insertRow, deleteRow } from '../../../src/core/salt/ops/rows-columns.ts';
import { setProperty } from '../../../src/core/salt/ops/properties.ts';
import { wrap } from '../../../src/core/salt/ops/wrap.ts';
import { insert as insertFlow } from '../../../src/core/activity/ops/insert.ts';
import { addLane } from '../../../src/core/activity/ops/lanes.ts';
import { addNote } from '../../../src/core/activity/ops/notes.ts';
import { setLink } from '../../../src/core/activity/ops/links.ts';
import { addFlow, deleteFlow } from '../../../src/core/project/flow-block.ts';
import { convertAllOlderFormat } from '../../../src/core/blocks/convert.ts';
import { redivide } from '../../../src/core/blocks/redivide.ts';
import { addScreen, deleteBlock, duplicateScreen, moveBlock, renameBlock } from '../../../src/core/project/screens.ts';
import { withKeys, type ProjectState } from '../../../src/core/project/project.ts';
import type { TextEdit } from '../../../src/core/types.ts';

const FILE = [
  '@startsalt Login',
  '{',
  '  Name | "    "',
  '  [OK] | [Cancel]',
  '}',
  '@endsalt',
  '@startuml Screen-flow',
  'start',
  ':[[#Login Sign in]];',
  ':Done;',
  'stop',
  '@enduml',
  '@startuml',
  'salt',
  '{',
  '  [Old]',
  '}',
  '@enduml',
  '@startsalt Second',
  '{',
  '}',
  '@endsalt',
  '',
].join('\n');

const UNRELATED: TextEdit = { start: FILE.length, end: FILE.length, text: "' unrelated note\n" };
const BASE = applyEdits(FILE, [UNRELATED]);

let n = 0;
const state = (source: string, flowIndex: number | null): ProjectState => withKeys({ source, flowIndex, lastWorking: [] }, () => `k${++n}`);
const blockOf = (source: string, name: string) => {
  const start = source.indexOf(`@start`, source.indexOf(name) - 16);
  const from = source.lastIndexOf('@start', source.indexOf(name));
  const end = source.indexOf('\n@end', from);
  return { start: from > -1 ? from : start, end: source.indexOf('\n', end + 1) + 1 };
};

type Make = (source: string) => readonly TextEdit[];
const accepted = (op: { ok: boolean; edits?: readonly TextEdit[]; messageKey?: string }): readonly TextEdit[] => {
  if (!op.ok || !op.edits) throw new Error(`refused: ${op.messageKey}`);
  return op.edits;
};
/** Runs a Salt operation on the Login block; its block-relative edits are moved to file offsets. */
const salt = (source: string, run: (doc: ScreenDoc) => { ok: boolean; edits?: readonly TextEdit[]; messageKey?: string }): readonly TextEdit[] => {
  const b = blockOf(source, 'Login');
  const text = source.slice(b.start, b.end);
  const doc: ScreenDoc = { text, model: parseSalt(text).model! };
  return accepted(run(doc)).map((e) => ({ ...e, start: e.start + b.start, end: e.end + b.start }));
};
const flow = (source: string) => {
  const b = blockOf(source, 'Screen-flow');
  return flowDoc(source.slice(b.start, b.end), b.start)!;
};

const OPERATIONS: Record<string, Make> = {
  'insert component': (s) => salt(s, (d) => insertSalt(d, [1], { item: 'Button' })),
  'delete component': (s) => salt(s, (d) => removeSalt(d, [1, 0])),
  'change property': (s) => salt(s, (d) => setProperty(d, [1, 0], 'label', 'Confirm')),
  'insert row': (s) => salt(s, (d) => insertRow(d, [1, 0])),
  'delete row': (s) => salt(s, (d) => deleteRow(d, [1, 0])),
  'insert column': (s) => salt(s, (d) => insertColumn(d, [1, 0])),
  'wrap in group box': (s) => salt(s, (d) => wrap(d, [1, 0], 'group box')),
  'add screen': (s) => addScreen(state(s, 1)).edits,
  'rename screen with link update': (s) => accepted(renameBlock(state(s, 1), 0, 'Sign in')),
  'duplicate screen': (s) => accepted(duplicateScreen(state(s, 1), 0)),
  'reorder blocks': (s) => accepted(moveBlock(state(s, 1), 0, 'down')),
  'delete screen': (s) => accepted(deleteBlock(state(s, 1), 0)),
  'change link': (s) => accepted(setLink(flow(s), [1], 'Other')),
  'remove link': (s) => accepted(setLink(flow(s), [1], null)),
  'insert flow step': (s) => accepted(insertFlow(flow(s), [1], 'step')),
  'change lane': (s) => accepted(addLane(flow(s), 'User')),
  'add note': (s) => accepted(addNote(flow(s), [1])),
  'delete the flow': (s) => accepted(deleteFlow(s, 1) as never),
  'add the flow': (s) => accepted(addFlow(s.replace(/@startuml Screen-flow[\s\S]*?@enduml\n/, ''), null) as never),
  'convert older-format blocks': (s) => convertAllOlderFormat(s),
  're-divide blocks': (s) => {
    const b = blockOf(s, 'Login');
    const text = s.slice(b.start, b.end).replace('@endsalt', '@endsalt\n@startsalt Extra\n{\n}\n@endsalt');
    const r = redivide(s, b.start, b.end, text, 1);
    if (!r) throw new Error('no re-division');
    return [{ start: b.start, end: b.end, text }];
  },
};

describe('undo and redo of every operation kind (VO-088)', () => {
  for (const [name, make] of Object.entries(OPERATIONS)) {
    it(`${name}: undo restores the text exactly and keeps the unrelated change; redo reapplies`, () => {
      const edits = make(BASE);
      const after = applyEdits(BASE, edits);
      expect(after).not.toBe(BASE);
      const undone = applyEdits(after, invertEdits(BASE, edits));
      expect(undone).toBe(BASE);
      expect(undone).toContain("' unrelated note");
      expect(applyEdits(undone, edits)).toBe(after);
    });
  }
});
