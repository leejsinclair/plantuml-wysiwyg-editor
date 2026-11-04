// T031: the activity parser and flow model (data-model §5.3, section 4 and 4.1, R-3).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { split } from '../../../src/core/blocks/split.ts';
import type {
  Decision,
  FlowElement,
  LockedPart,
  Loop,
  ScreenFlow,
  Step,
  Stop,
} from '../../../src/core/activity/model.ts';
import { parseActivity, type Node } from '../../../src/core/activity/parser.ts';
import type { TextRange } from '../../../src/core/types.ts';

const block = (...lines: string[]) => ['@startuml Screen-flow', ...lines, '@enduml', ''].join('\n');
const slice = (text: string, r: TextRange) => text.slice(r.start, r.end);

function flow(text: string): ScreenFlow {
  const result = parseActivity(text);
  expect(result.errors).toEqual([]);
  expect(result.diagnostics).toEqual([]);
  expect(result.model).not.toBeNull();
  return result.model!;
}

function leaves(node: Node): Node[] {
  return node.children.length === 0 ? [node] : node.children.flatMap(leaves);
}

/** Every character belongs to exactly one leaf, in order; every node spans its children exactly. */
function expectLossless(text: string, tree: Node): void {
  expect(tree.start).toBe(0);
  expect(tree.end).toBe(text.length);
  const check = (node: Node): void => {
    if (node.children.length === 0) return;
    expect(node.start).toBe(node.children[0]!.start);
    expect(node.end).toBe(node.children[node.children.length - 1]!.end);
    for (let i = 1; i < node.children.length; i++) expect(node.children[i]!.start).toBe(node.children[i - 1]!.end);
    node.children.forEach(check);
  };
  check(tree);
  expect(leaves(tree).map((l) => text.slice(l.start, l.end)).join('')).toBe(text);
}

const kinds = (elements: readonly FlowElement[]) => elements.map((e) => e.kind);

describe('activity parser: lossless tree (R-3)', () => {
  const samples = {
    simple: block('start', ':Sign in;', 'stop'),
    crlf: '@startuml F\r\nstart\r\nif (a) then (yes)\r\n  :x;\r\nendif\r\nstop\r\n@enduml\r\n',
    nested: block(
      "' comment",
      'start',
      '|Customer|',
      'repeat',
      '  while (more?) is (yes)',
      '    :Item;',
      '    note right: tip',
      '  endwhile (no)',
      'repeat while (again?) is (yes) not (no)',
      'fork',
      '  :A;',
      'fork again',
      '  :B;',
      'end fork',
      'stop',
    ),
    invalid: block('start', 'if (a) then', ':never closed', 'stop'),
    noFinalNewline: '@startuml\nstart\nstop\n@enduml',
    empty: '',
  };

  it.each(Object.entries(samples))('%s', (_name, text) => {
    expectLossless(text, parseActivity(text).tree);
  });

  it('is lossless for every activity block in the corpus', () => {
    const root = join(import.meta.dirname, '../../corpus');
    const files = readdirSync(root, { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.puml'));
    let count = 0;
    for (const file of files) {
      const source = readFileSync(join(root, file), 'utf8');
      for (const segment of split(source)) {
        if (segment.type !== 'block' || !/^startuml$/i.test(segment.opener)) continue;
        const text = source.slice(segment.start, segment.end);
        expectLossless(text, parseActivity(text).tree);
        count++;
      }
    }
    expect(count).toBeGreaterThan(10);
  });
});

describe('activity parser: start, stop, end and steps', () => {
  it('reads the main path with each element range', () => {
    const text = block('start', ':Sign in;', 'stop');
    const model = flow(text);
    expect(kinds(model.main.elements)).toEqual(['start', 'step', 'stop']);
    expect(model.lanes).toEqual([]);
    const step = model.main.elements[1] as Step;
    expect(slice(text, step.range)).toBe(':Sign in;');
    expect(step.label).toEqual({ text: 'Sign in', raw: expect.anything(), formatted: false });
    expect(slice(text, step.label.raw)).toBe('Sign in');
    expect(step.link).toBeNull();
    expect(step.lane).toBeNull();
  });

  it('keeps the stop keyword as written', () => {
    const model = flow(block('start', 'end'));
    expect((model.main.elements[1] as Stop).keyword).toBe('end');
    expect((flow(block('start', 'STOP')).main.elements[1] as Stop).keyword).toBe('stop');
  });

  it('reads a multi-line label and non-English text unchanged', () => {
    const text = block('start', ':Zahlung prüfen', '支払い;', 'stop');
    const step = flow(text).main.elements[1] as Step;
    expect(step.label.text).toBe('Zahlung prüfen\n支払い');
  });

  it('unescapes <U+hhhh> and flags imported creole as formatted', () => {
    const escaped = flow(block(':a <U+002A>*b;')).main.elements[0] as Step;
    expect(escaped.label).toMatchObject({ text: 'a **b', formatted: false });
    const creole = flow(block(':**bold**;')).main.elements[0] as Step;
    expect(creole.label).toMatchObject({ text: '**bold**', formatted: true });
  });

  it('reads a linked step: target, label and escapes', () => {
    const text = block('start', ':[[#Sign-in Sign <U+005B>in<U+005D>]];', 'stop');
    const step = flow(text).main.elements[1] as Step;
    expect(step.link?.target).toBe('Sign-in');
    expect(slice(text, step.link!.raw)).toBe('Sign-in');
    expect(step.label).toMatchObject({ text: 'Sign [in]', formatted: false });
    expect(slice(text, step.label.raw)).toBe('Sign <U+005B>in<U+005D>');
  });

  it('keeps a non-English link target as written', () => {
    const step = flow(block(':[[#Écran-1 Öffnen]];')).main.elements[0] as Step;
    expect(step.link?.target).toBe('Écran-1');
    expect(step.label.text).toBe('Öffnen');
  });
});

describe('activity parser: decisions', () => {
  it('reads if, elseif and else with conditions, labels and paths', () => {
    const text = block(
      'start',
      'if (Signed in?) then (yes)',
      '  :Home;',
      'elseif (Guest?) then (guest)',
      'else (no)',
      '  :Sign in;',
      '  stop',
      'endif',
      'stop',
    );
    const decision = flow(text).main.elements[1] as Decision;
    expect(decision.kind).toBe('decision');
    expect(decision.branches.map((b) => b.branchKind)).toEqual(['if', 'elseif', 'else']);
    expect(decision.branches.map((b) => b.condition?.text ?? null)).toEqual(['Signed in?', 'Guest?', null]);
    expect(decision.branches.map((b) => b.label?.text ?? null)).toEqual(['yes', 'guest', 'no']);
    expect(decision.branches.map((b) => kinds(b.path.elements))).toEqual([['step'], [], ['step', 'stop']]);
    expect(slice(text, decision.range)).toMatch(/^if \(Signed in\?\)[\s\S]*endif$/);
    expect(slice(text, decision.end)).toBe('endif');
    expect(slice(text, decision.branches[1]!.header)).toBe('elseif (Guest?) then (guest)');
  });

  it('keeps conditions with brackets inside', () => {
    const decision = flow(block('if (count (items) > 0) then (yes (some))', 'endif')).main.elements[0] as Decision;
    expect(decision.branches[0]!.condition?.text).toBe('count (items) > 0');
    expect(decision.branches[0]!.label?.text).toBe('yes (some)');
  });

  it('accepts else if, end if, a missing then label and an if with no else', () => {
    const decision = flow(block('if (a) then', 'else if (b) then (y)', 'end if')).main.elements[0] as Decision;
    expect(decision.branches.map((b) => b.branchKind)).toEqual(['if', 'elseif']);
    expect(decision.branches[0]!.label).toBeNull();
  });

  it('nests decisions and loops', () => {
    const decision = flow(
      block('if (a) then (y)', '  if (b) then (y)', '    :x;', '  endif', '  while (c)', '  endwhile', 'endif'),
    ).main.elements[0] as Decision;
    expect(kinds(decision.branches[0]!.path.elements)).toEqual(['decision', 'loop']);
  });
});

describe('activity parser: loops', () => {
  it('reads repeat … repeat while with is and not labels', () => {
    const text = block('repeat', '  :Try;', 'repeat while (Failed?) is (yes) not (no)');
    const loop = flow(text).main.elements[0] as Loop;
    expect(loop).toMatchObject({ kind: 'loop', loopKind: 'repeat' });
    expect(loop.condition?.text).toBe('Failed?');
    expect(loop.labels.is?.text).toBe('yes');
    expect(loop.labels.exit?.text).toBe('no');
    expect(kinds(loop.body.elements)).toEqual(['step']);
    expect(slice(text, loop.end)).toBe('repeat while (Failed?) is (yes) not (no)');
  });

  it('reads while … endwhile with labels and an empty body', () => {
    const loop = flow(block('while (More?) is (yes)', 'endwhile (no)')).main.elements[0] as Loop;
    expect(loop).toMatchObject({ kind: 'loop', loopKind: 'while' });
    expect(loop.condition?.text).toBe('More?');
    expect(loop.labels.is?.text).toBe('yes');
    expect(loop.labels.exit?.text).toBe('no');
    expect(loop.body.elements).toEqual([]);
  });

  it('accepts a repeat while with no condition and end while', () => {
    const loops = flow(block('repeat', 'repeat while', 'while (a)', 'end while')).main.elements as Loop[];
    expect(loops[0]!.condition).toBeNull();
    expect(loops[1]!.labels).toEqual({ is: null, exit: null });
  });
});

describe('activity parser: lanes', () => {
  it('lists lanes in order of first appearance and gives each element its effective lane', () => {
    const text = block(
      '|Customer|',
      'start',
      ':Browse;',
      '|#AntiqueWhite|Shop|',
      'if (In stock?) then (yes)',
      '  :Reserve;',
      '  |Customer|',
      '  :Pay;',
      'else (no)',
      '  :Apologise;',
      'endif',
      ':Confirm;',
      'stop',
    );
    const model = flow(text);
    expect(model.lanes.map((l) => l.name)).toEqual(['Customer', 'Shop']);
    expect(slice(text, model.lanes[1]!.raw!)).toBe('|#AntiqueWhite|Shop|');
    expect(model.laneSwitches.map((s) => s.lane)).toEqual(['Customer', 'Shop', 'Customer']);
    expect(slice(text, model.laneSwitches[1]!.nameRange)).toBe('Shop');
    const [, browse, decision, confirm] = model.main.elements as [unknown, Step, Decision, Step];
    expect(browse.lane).toBe('Customer');
    expect(decision.lane).toBe('Shop');
    const [ifBranch, elseBranch] = decision.branches;
    expect((ifBranch!.path.elements as Step[]).map((s) => s.lane)).toEqual(['Shop', 'Customer']);
    // A switch applies to every following statement in source order, across branches.
    expect((elseBranch!.path.elements[0] as Step).lane).toBe('Customer');
    expect(confirm.lane).toBe('Customer');
  });

  it('treats a first lane after any statement as a syntax error, as PlantUML does', () => {
    expect(parseActivity(block('start', ':A;', '|Back office|', ':B;', 'stop')).errors).toEqual([
      { line: 4, messageKey: 'diagnostic.syntax.laneNotFirst' },
    ]);
    expect(parseActivity(block("' lanes", '|A|', 'start', ':x;', '|B|', 'stop')).errors).toEqual([]);
  });

  it('treats a lane with no name as a syntax error', () => {
    expect(parseActivity(block('||', 'start')).errors).toEqual([
      { line: 2, messageKey: 'diagnostic.syntax.invalidLine' },
    ]);
  });
});

describe('activity parser: notes', () => {
  it('attaches notes to the element they follow, in order', () => {
    const text = block(
      'start',
      'note right: Entry',
      ':Sign in;',
      'note left: First',
      'note right',
      '  Second line one',
      '  line two',
      'end note',
      'stop',
    );
    const [start, step] = flow(text).main.elements as [FlowElement, Step];
    expect(start.notes.map((n) => [n.side, n.text.text, n.form])).toEqual([['right', 'Entry', 'singleLine']]);
    expect(step.notes.map((n) => [n.side, n.form])).toEqual([
      ['left', 'singleLine'],
      ['right', 'block'],
    ]);
    expect(step.notes[0]!.text.text).toBe('First');
    expect(step.notes[1]!.text.text).toBe('  Second line one\n  line two');
    expect(slice(text, step.notes[1]!.range)).toBe('note right\n  Second line one\n  line two\nend note');
  });

  it('attaches a note at the start of a branch or loop body to that path, and after endif to the decision', () => {
    const decision = flow(
      block('if (a) then (y)', '  note left: In branch', '  :x;', 'endif', 'note right: After', 'repeat', '  note left: Body', 'repeat while (b)'),
    ).main.elements;
    const d = decision[0] as Decision;
    expect(d.branches[0]!.path.leadingNotes.map((n) => n.text.text)).toEqual(['In branch']);
    expect(d.notes.map((n) => n.text.text)).toEqual(['After']);
    expect((decision[1] as Loop).body.leadingNotes.map((n) => n.text.text)).toEqual(['Body']);
  });

  it('reports an unclosed note with its line', () => {
    expect(parseActivity(block('start', 'note left', 'never closed')).errors).toContainEqual({
      line: 3,
      messageKey: 'diagnostic.syntax.unclosedNote',
    });
  });
});

describe('activity parser: leading comments', () => {
  it('attaches full-line comments directly above an element', () => {
    const text = block('start', "' about the step", "/' and more '/", ':Step;', '', "' separated by a blank line", '', 'stop');
    const [, step, stop] = flow(text).main.elements;
    expect(step!.leadingComments.map((c) => slice(text, c))).toEqual(["' about the step", "/' and more '/"]);
    expect(stop!.leadingComments).toEqual([]);
  });

  it('does not give a comment above a closing keyword to the element after it', () => {
    const text = block(':A;', 'if (x) then', "' before endif", 'endif', ':C;');
    const [, , c] = flow(text).main.elements;
    expect(c!.kind).toBe('step');
    expect(c!.leadingComments).toEqual([]);
  });

  it('attaches comments to notes and lane switches', () => {
    const text = block("' lane", '|L|', ':A;', "' note", 'note left: n');
    const model = flow(text);
    expect(model.laneSwitches[0]!.leadingComments.map((c) => slice(text, c))).toEqual(["' lane"]);
    expect((model.main.elements[0] as Step).notes[0]!.leadingComments.map((c) => slice(text, c))).toEqual(["' note"]);
  });
});

describe('activity parser: locked parts (section 4.1, EC-10, OD-6)', () => {
  const locked = (text: string): LockedPart[] =>
    flow(text).main.elements.filter((e): e is LockedPart => e.kind === 'locked');

  it('locks a whole fork … end fork as one part, keeping the elements around it', () => {
    const text = block('start', ':A;', 'fork', '  :B;', 'fork again', '  :C;', 'end fork', 'stop');
    const model = flow(text);
    expect(kinds(model.main.elements)).toEqual(['start', 'step', 'locked', 'stop']);
    const part = model.main.elements[2] as LockedPart;
    expect(part.reason).toBe('locked.fork');
    expect(part.excerpt).toBe('fork\n  :B;\nfork again\n  :C;\nend fork');
    expect(slice(text, part.range)).toBe(part.excerpt);
  });

  it.each([
    ['split', block('split', '  :A;', 'split again', '  :B;', 'end split'), 'locked.split'],
    ['switch', block('switch (Plan?)', 'case (Free)', '  :A;', 'case (Paid)', 'endswitch'), 'locked.switch'],
    ['partition', block('partition Checkout {', '  :Pay;', '}'), 'locked.partition'],
    ['group', block('group Checkout', '  :Pay;', 'end group'), 'locked.partition'],
    ['detach', block(':A;', 'detach'), 'locked.detach'],
    ['kill', block(':A;', 'kill'), 'locked.kill'],
    ['salt in a step', block(':Form', '{{salt', '{', '  [OK]', '}', '}}', ';'), 'locked.embeddedSalt'],
    ['arrow label', block(':A;', '-> checked;', ':B;'), 'locked.arrowLabel'],
    ['SDL shape', block(':Send|'), 'locked.stepShape'],
  ])('%s', (_name, text, reason) => {
    expect(locked(text).map((p) => p.reason)).toEqual([reason]);
  });

  it('keeps a terminator on the line after {{salt … }} in the same locked part', () => {
    const text = block('start', ':Form', '{{salt', '{', '  [OK]', '}', '}}', ';', 'stop');
    const model = flow(text);
    expect(kinds(model.main.elements)).toEqual(['start', 'locked', 'stop']);
    expect((model.main.elements[1] as LockedPart).excerpt).toBe(':Form\n{{salt\n{\n  [OK]\n}\n}}\n;');
  });

  it('treats lane names that differ only in normal form as one lane', () => {
    const model = flow(block('|Cafe\u0301|', ':A;', '|Caf\u00e9|', ':B;'));
    expect(model.lanes).toHaveLength(1);
    expect((model.main.elements[1] as Step).lane).toBe(model.lanes[0]!.name);
  });

  it('gives a locked part its lane and notes', () => {
    const part = locked(block('|L|', 'detach', 'note left: why'))[0]!;
    expect(part.lane).toBe('L');
    expect(part.notes.map((n) => n.text.text)).toEqual(['why']);
  });

  it('still reports syntax errors inside a locked block', () => {
    const result = parseActivity(block('fork', '  :never closed', 'end fork'));
    expect(result.model).toBeNull();
    expect(result.errors[0]).toEqual({ line: 3, messageKey: 'diagnostic.syntax.unclosedStep' });
  });
});

describe('activity parser: source-only content (section 4.1)', () => {
  it.each([
    ['legacy syntax', block('(*) --> "Open app"', '"Open app" --> (*)'), 'diagnostic.unsupported.legacyActivity', 2],
    ['goto and label', block('start', 'label retry', ':Try;', 'goto retry'), 'diagnostic.unsupported.gotoLabel', 3],
    ['preprocessor', block('!define X Sign in', 'start', ':X;', 'stop'), 'diagnostic.unsupported.preprocessor', 2],
  ])('%s makes the block source-only with no model', (_name, text, key, line) => {
    const result = parseActivity(text);
    expect(result.errors).toEqual([]);
    expect(result.model).toBeNull();
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.diagnostics[0]).toMatchObject({ kind: 'unsupported', messageKey: key, line });
  });
});

describe('activity parser: syntax errors with their line (category 3)', () => {
  it.each([
    ['unclosed step', block('start', ':never closed', 'stop'), 3, 'diagnostic.syntax.unclosedStep', undefined],
    ['unclosed if', block('start', 'if (a) then', '  :x;', 'stop'), 3, 'diagnostic.syntax.unclosedKeyword', { keyword: 'if' }],
    ['stray endif', block('start', 'endif', 'stop'), 3, 'diagnostic.syntax.unmatchedKeyword', { keyword: 'endif' }],
    ['else after else', block('if (a) then', 'else', 'else', 'endif'), 4, 'diagnostic.syntax.misplacedKeyword', { keyword: 'else' }],
    ['elseif after else', block('if (a) then', 'else', 'elseif (b) then', 'endif'), 4, 'diagnostic.syntax.misplacedKeyword', { keyword: 'elseif' }],
    ['unclosed while', block('while (a)', ':x;'), 2, 'diagnostic.syntax.unclosedKeyword', { keyword: 'while' }],
    ['unclosed repeat', block('repeat', ':x;'), 2, 'diagnostic.syntax.unclosedKeyword', { keyword: 'repeat' }],
    ['unclosed fork', block('fork', ':x;'), 2, 'diagnostic.syntax.unclosedKeyword', { keyword: 'fork' }],
    ['unbalanced condition', block('if (a then', 'endif'), 2, 'diagnostic.syntax.missingCondition', { keyword: 'if' }],
    ['unknown line', block('start', 'Alice -> Bob : Hello', 'stop'), 3, 'diagnostic.syntax.invalidLine', undefined],
    ['unclosed comment', block('start', "/' never closed"), 3, 'diagnostic.syntax.unclosedComment', undefined],
  ])('%s', (_name, text, line, messageKey, params) => {
    const result = parseActivity(text);
    expect(result.model).toBeNull();
    expect(result.errors[0]).toEqual(params ? { line, messageKey, params } : { line, messageKey });
    expect(result.diagnostics[0]).toMatchObject({ kind: 'syntax', line, messageKey });
  });

  it('closes an inner construct before an outer closer, reporting the inner one', () => {
    const result = parseActivity(block('while (a)', '  if (b) then', 'endwhile'));
    expect(result.errors).toEqual([
      { line: 3, messageKey: 'diagnostic.syntax.unclosedKeyword', params: { keyword: 'if' } },
    ]);
  });

  it('reports a missing end line', () => {
    expect(parseActivity('@startuml F\nstart\nstop\n').errors).toEqual([
      { line: 1, messageKey: 'diagnostic.syntax.missingEndLine' },
    ]);
  });

  it('counts lines across CRLF and lone CR line endings', () => {
    expect(parseActivity('@startuml\r\nstart\r\n:x\r\n@enduml\r\n').errors[0]?.line).toBe(3);
    expect(parseActivity('@startuml\rstart\rendif\r@enduml\r').errors[0]?.line).toBe(3);
  });

  it('gives each diagnostic a block-relative range on its line', () => {
    const text = block('start', 'endif');
    const diagnostic = parseActivity(text).diagnostics[0]!;
    expect(slice(text, diagnostic.range)).toBe('endif');
  });
});

describe('activity parser: the corpus flows', () => {
  const corpus = (name: string) => {
    const source = readFileSync(join(import.meta.dirname, '../../corpus/import', `${name}.puml`), 'utf8');
    return split(source)
      .filter((s) => s.type === 'block' && /^startuml$/i.test(s.opener))
      .map((s) => parseActivity(source.slice(s.start, s.end)));
  };

  it.each(['arrow-labels', 'detach-kill', 'fork', 'partition', 'salt-inside-step', 'switch'])(
    '%s has locked parts and no errors',
    (name) => {
      const [result] = corpus(name);
      expect(result!.errors).toEqual([]);
      expect(result!.diagnostics).toEqual([]);
      const all = (els: readonly FlowElement[]): FlowElement[] =>
        els.flatMap((e) =>
          e.kind === 'decision' ? [e, ...e.branches.flatMap((b) => all(b.path.elements))] : e.kind === 'loop' ? [e, ...all(e.body.elements)] : [e],
        );
      expect(all(result!.model!.main.elements).some((e) => e.kind === 'locked')).toBe(true);
    },
  );

  it('goto-label: the first block is source-only, the second is a plain flow', () => {
    const [jumps, main] = corpus('goto-label');
    expect(jumps!.model).toBeNull();
    expect(jumps!.diagnostics.every((d) => d.kind === 'unsupported')).toBe(true);
    expect(kinds(main!.model!.main.elements)).toEqual(['start', 'step', 'stop']);
  });

  it('legacy-activity is source-only', () => {
    const [legacy] = corpus('legacy-activity');
    expect(legacy!.model).toBeNull();
    expect(legacy!.diagnostics[0]!.messageKey).toBe('diagnostic.unsupported.legacyActivity');
  });

  it('case-only-link keeps the link target as written', () => {
    const [result] = corpus('case-only-link');
    expect((result!.model!.main.elements[1] as Step).link?.target).toBe('login');
  });
});
