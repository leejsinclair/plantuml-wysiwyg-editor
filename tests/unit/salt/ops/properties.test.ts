// T060: properties (VO-056 text-field width, VO-058 drop-down options and closing with a count, VO-059 core Keep
// or Remove formatting, VO-060 core every control state round-trips, VO-061 no placeholder or enabled property).
import { describe, expect, it } from 'vitest';
import { applyEdits } from '../../../../src/core/source/edits.ts';
import { parseSalt } from '../../../../src/core/salt/parser.ts';
import type { CellContent, SaltScreen } from '../../../../src/core/salt/model.ts';
import type { OpResult, Path } from '../../../../src/core/types.ts';
import { locate, type ScreenDoc } from '../../../../src/core/salt/destinations.ts';
import { propertiesOf, setProperty } from '../../../../src/core/salt/ops/properties.ts';

const block = (body: string): string => `@startsalt T\n{\n${body}\n}\n@endsalt\n`;
function d(body: string): ScreenDoc {
  const text = block(body);
  const r = parseSalt(text);
  expect(r.diagnostics).toEqual([]);
  return { text, model: r.model! };
}
function apply(document: ScreenDoc, op: OpResult): { text: string; model: SaltScreen; op: OpResult & { ok: true }; doc: ScreenDoc } {
  expect(op.ok, op.ok ? '' : op.messageKey).toBe(true);
  if (!op.ok) throw new Error('refused');
  const text = applyEdits(document.text, op.edits);
  const parsed = parseSalt(text);
  expect(parsed.diagnostics, text).toEqual([]);
  return { text, model: parsed.model!, op, doc: { text, model: parsed.model! } };
}
const content = (m: SaltScreen, p: Path): CellContent => {
  const el = locate(m, p);
  if (el?.kind !== 'cell') throw new Error('not a cell');
  return el.cell.content;
};

describe('text field width (VO-056, FR-003/AC8)', () => {
  const doc = d('  Mail | "abc       "');

  it('changing the value keeps the width', () => {
    const r = apply(doc, setProperty(doc, [0, 1], 'value', 'a@b.c'));
    expect(r.text).toBe(block('  Mail | "a@b.c     "'));
    expect(content(r.model, [0, 1])).toMatchObject({ type: 'textField', width: 10 });
  });

  it('a longer value widens the field to fit', () => {
    const r = apply(doc, setProperty(doc, [0, 1], 'value', 'a much longer value'));
    expect(content(r.model, [0, 1])).toMatchObject({ type: 'textField', width: 19 });
  });

  it('width can be changed but never falls below the value length', () => {
    expect(apply(doc, setProperty(doc, [0, 1], 'width', 5)).text).toBe(block('  Mail | "abc  "'));
    expect(apply(doc, setProperty(doc, [0, 1], 'width', 1)).text).toBe(block('  Mail | "abc"'));
  });
});

describe('drop-downs (VO-058, EC-07)', () => {
  it('edits the options of an open drop-down', () => {
    const doc = d('  ^Red^^Green^');
    const r = apply(doc, setProperty(doc, [0, 0], 'options', ['Green', 'Blue']));
    expect(r.text).toBe(block('  ^Red^^Green^^Blue^'));
  });

  it('closing drops the options and states how many', () => {
    const doc = d('  ^Red^^Green^^Blue^');
    const r = apply(doc, setProperty(doc, [0, 0], 'open', false));
    expect(r.text).toBe(block('  ^Red^'));
    expect(r.op.announceKey).toBe('screen.announce.optionsRemoved');
    expect(r.op.announceParams).toMatchObject({ count: 2 });
  });

  it('opening a closed drop-down gives it an option, so the canvas and render show a list', () => {
    const doc = d('  ^Red^');
    const r = apply(doc, setProperty(doc, [0, 0], 'open', true));
    expect(content(r.model, [0, 0])).toMatchObject({ type: 'dropDown', open: true });
  });

  it('escapes a caret in a value', () => {
    const doc = d('  ^Red^');
    const r = apply(doc, setProperty(doc, [0, 0], 'value', 'a^b'));
    expect(content(r.model, [0, 0])).toMatchObject({ type: 'dropDown', value: { text: 'a^b' } });
  });
});

describe('formatting (VO-059 core, EC-06)', () => {
  const doc = d('  Name | [**Go**]');

  it('refuses to change formatted text without a choice', () => {
    const op = setProperty(doc, [0, 1], 'label', 'Stop');
    expect(op.ok).toBe(false);
    if (!op.ok) expect(op.messageKey).toBe('screen.refuse.formattingChoice');
  });

  it('Keep formatting writes the markers as typed; the type is unchanged', () => {
    const r = apply(doc, setProperty(doc, [0, 1], 'label', { text: '**Stop**', formatting: 'keep' }));
    expect(r.text).toBe(block('  Name | [**Stop**]'));
    expect(content(r.model, [0, 1]).type).toBe('button');
  });

  it('Keep formatting still escapes braces and bars', () => {
    const r = apply(doc, setProperty(doc, [0, 1], 'label', { text: '**a|b**', formatting: 'keep' }));
    expect(content(r.model, [0, 1])).toMatchObject({ type: 'button', label: { text: '**a|b**' } });
  });

  it('Remove formatting makes the text literal', () => {
    const r = apply(doc, setProperty(doc, [0, 1], 'label', { text: '**Stop**', formatting: 'remove' }));
    expect(content(r.model, [0, 1])).toMatchObject({ type: 'button', label: { text: '**Stop**', formatted: false } });
  });

  it('formatted text keeps its type when kept as text', () => {
    const doc2 = d('  //Hello//');
    const r = apply(doc2, setProperty(doc2, [0, 0], 'text', { text: '[x]', formatting: 'keep' }));
    expect(content(r.model, [0, 0])).toMatchObject({ type: 'text', text: { text: '[x]' } });
  });
});

describe('every control state round-trips (VO-060 core)', () => {
  it('checkbox, radio button, text, button, separator, tab bar, menu bar, tree and style', () => {
    let doc = d('  [ ] Keep | ( ) One\n  Hi | [Go]\n  ..\n  {/ A | B }\n  {* File | Edit }\n  {T\n    + a\n  }\n  {\n    x\n  }');
    doc = apply(doc, setProperty(doc, [0, 0], 'checked', true)).doc;
    doc = apply(doc, setProperty(doc, [0, 1], 'selected', true)).doc;
    doc = apply(doc, setProperty(doc, [1, 0], 'text', '{Title}')).doc;
    doc = apply(doc, setProperty(doc, [1, 1], 'label', 'Go | stop')).doc;
    doc = apply(doc, setProperty(doc, [2], 'kind', 'double')).doc;
    doc = apply(doc, setProperty(doc, [3, 0], 'tabs', ['A', 'B', 'C'])).doc;
    doc = apply(doc, setProperty(doc, [3, 0], 'selectedTab', 1)).doc;
    doc = apply(doc, setProperty(doc, [4, 0], 'items', ['File', 'View'])).doc;
    doc = apply(doc, setProperty(doc, [5, 0], 'items', [{ text: 'a', depth: 1 }, { text: 'b', depth: 2 }])).doc;
    doc = apply(doc, setProperty(doc, [6, 0], 'style', 'groupBox')).doc;
    doc = apply(doc, setProperty(doc, [6, 0], 'title', 'Sign in')).doc;

    const m = parseSalt(doc.text).model!;
    expect(content(m, [0, 0])).toMatchObject({ type: 'checkbox', checked: true, label: { text: 'Keep' } });
    expect(content(m, [0, 1])).toMatchObject({ type: 'radioButton', selected: true, label: { text: 'One' } });
    expect(content(m, [1, 0])).toMatchObject({ type: 'text', text: { text: '{Title}', formatted: false } });
    expect(content(m, [1, 1])).toMatchObject({ type: 'button', label: { text: 'Go | stop' } });
    expect(locate(m, [2])).toMatchObject({ kind: 'separator', row: { separatorKind: 'double' } });
    const tabs = content(m, [3, 0]);
    expect(tabs.type === 'tabBar' && [tabs.tabs.map((t) => t.text), tabs.selectedIndex]).toEqual([['A', 'B', 'C'], 1]);
    const menu = content(m, [4, 0]);
    expect(menu.type === 'menuBar' && menu.items.map((t) => t.text)).toEqual(['File', 'View']);
    const tree = content(m, [5, 0]);
    expect(tree.type === 'tree' && tree.items.map((i) => [i.text.text, i.depth])).toEqual([['a', 1], ['b', 2]]);
    expect(content(m, [6, 0])).toMatchObject({ type: 'grid', style: 'groupBox', title: { text: 'Sign in' } });
  });

  it('changes a container style back to plain, dropping the title', () => {
    const doc = d('  {^"Box"\n    x\n  }');
    const r = apply(doc, setProperty(doc, [0, 0], 'style', 'tableLines'));
    expect(r.text).toBe(block('  {#\n    x\n  }'));
  });

  it('refuses a tree depth that jumps by more than one', () => {
    const doc = d('  {T\n    + a\n  }');
    expect(setProperty(doc, [0, 0], 'items', [{ text: 'a', depth: 1 }, { text: 'b', depth: 3 }]).ok).toBe(false);
  });
});

describe('properties offered (VO-061, FR-003/AC7)', () => {
  it('no placeholder, enabled or disabled property for any component', () => {
    const doc = d('  Hi | [Go] | "x  " | [ ] c | ( ) r | ^d^\n  {/ A }\n  {* F }\n  {T\n    + a\n  }\n  {+\n    x\n  }\n  ..');
    const paths: Path[] = [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [1, 0], [2, 0], [3, 0], [4, 0], [5], []];
    for (const p of paths) {
      const props = propertiesOf(doc.model, p);
      expect(props.length, JSON.stringify(p)).toBeGreaterThan(0);
      for (const name of props) expect(name).not.toMatch(/placeholder|enabled|disabled/i);
    }
    expect(propertiesOf(doc.model, [0, 2])).toEqual(['value', 'width', 'span']);
    expect(propertiesOf(doc.model, [0, 0])).toEqual(['text']);
  });

  it('refuses a property the element does not have', () => {
    const doc = d('  Hi');
    expect(setProperty(doc, [0, 0], 'placeholder', 'x').ok).toBe(false);
  });
});
