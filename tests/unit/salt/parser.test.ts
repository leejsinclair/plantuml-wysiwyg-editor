import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseSalt, type SaltNode } from '../../../src/core/salt/parser.ts';
import {
  columnCount,
  LOCKED_REASONS,
  SOURCE_ONLY_REASONS,
  type Cell,
  type CellsRow,
  type DropDown,
  type MenuBar,
  type ScrollArea,
  type TabBar,
  type Tree,
  type Grid,
  type LockedPart,
  type Row,
} from '../../../src/core/salt/model.ts';
import { split } from '../../../src/core/blocks/split.ts';

const block = (body: string): string => `@startsalt Test\n${body}\n@endsalt\n`;

/** Leaves in order, each contiguous with the next, covering the text exactly. */
function expectLossless(src: string, tree: SaltNode): void {
  const leaves: SaltNode[] = [];
  const walk = (n: SaltNode): void => {
    if (n.children.length === 0) leaves.push(n);
    else {
      expect(n.children[0]!.start, `${n.kind} starts with its first child`).toBe(n.start);
      expect(n.children.at(-1)!.end, `${n.kind} ends with its last child`).toBe(n.end);
      n.children.forEach(walk);
    }
  };
  walk(tree);
  let at = 0;
  for (const leaf of leaves) {
    expect(leaf.start, `gap before ${leaf.kind}@${leaf.start}`).toBe(at);
    at = leaf.end;
  }
  expect(at).toBe(src.length);
  expect(tree.start).toBe(0);
  expect(tree.end).toBe(src.length);
}

function parseOk(body: string) {
  const src = block(body);
  const result = parseSalt(src);
  expect(result.errors).toEqual([]);
  expect(result.diagnostics).toEqual([]);
  expect(result.model).not.toBeNull();
  expectLossless(src, result.tree);
  return { src, ...result, root: result.model!.root };
}

const slice = (src: string, r: { start: number; end: number }): string => src.slice(r.start, r.end);
const cellsOf = (row: Row | undefined): readonly Cell[] => {
  expect(row?.type).toBe('cells');
  return (row as CellsRow).cells;
};

describe('parseSalt: lossless tree', () => {
  const samples = [
    block('{\n}'),
    block('{\n  Login    | "MyName   "\n  Password | "****     "\n  [Cancel] | [  OK   ]\n}'),
    '@startsalt\r\n{+\r\n\t\'comment\r\n  a | b\r\n}\r\n@endsalt\r\n',
    '@startsalt X\r{\ra\r}\r@endsalt',
    block("/' block\n   comment '/\n{^\"Group\"\n  {T\n   + a\n   ++ b\n  }\n}"),
    block('{ a | b } trailing text'),
    block('{\n  {SI\n  .\n  }\n}\n{\n}'),
    block('{\n  Name | "   "\n  [Save]'),
    '@startsalt\n{\n  a\n}',
    block('}\n{\n a\n}'),
    block('!define X 1\n{\n  X\n}'),
  ];

  it.each(samples)('covers %j exactly', (src) => {
    expectLossless(src, parseSalt(src).tree);
  });

  it('is lossless on arbitrary text', () => {
    const alphabet = ['{', '}', '|', "'", '/', '!', '@', ' ', '\n', '\r', 'a', 'T', 'S', '+', '#', '^', '*', '"', '.', '[', ']', '(', 'X', 'é'];
    let seed = 11;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % n;
    };
    for (let k = 0; k < 300; k++) {
      let body = '';
      const len = rand(60);
      for (let i = 0; i < len; i++) body += alphabet[rand(alphabet.length)];
      const src = `@startsalt\n${body}\n@endsalt\n`;
      expectLossless(src, parseSalt(src).tree);
    }
  });

  it('round-trips every Salt block in the corpus', () => {
    const corpus = join(import.meta.dirname, '../../corpus');
    for (const folder of readdirSync(corpus, { withFileTypes: true }).filter((d) => d.isDirectory())) {
      const dir = join(corpus, folder.name);
      for (const file of readdirSync(dir).filter((f) => f.endsWith('.puml'))) {
        const text = readFileSync(join(dir, file), 'utf8');
        for (const seg of split(text)) {
          if (seg.type !== 'block' || !/^startsalt$/i.test(seg.opener)) continue;
          const src = text.slice(seg.start, seg.end);
          expectLossless(src, parseSalt(src).tree);
        }
      }
    }
  });
});

describe('parseSalt: grids, rows and cells', () => {
  it('reads an empty root grid (a new screen)', () => {
    const { root } = parseOk('{\n}');
    expect(root.type).toBe('grid');
    expect(root.style).toBe('plain');
    expect(root.rows).toEqual([]);
    expect(root.layout).toBe('multiLine');
    expect(columnCount(root)).toBe(0);
  });

  it('reads rows and cells with their ranges', () => {
    const { src, root } = parseOk('{\n  Login    | "MyName   "\n  [Cancel] | [  OK   ]\n}');
    expect(root.rows).toHaveLength(2);
    const [a, b] = cellsOf(root.rows[0]);
    expect(slice(src, a!.range)).toBe('Login');
    expect(a!.content.type).toBe('text');
    expect(b!.column).toBe(1);
    expect(b!.content).toMatchObject({ type: 'textField', width: 9, value: { text: 'MyName', formatted: false } });
    expect(slice(src, root.rows[1]!.range)).toBe('[Cancel] | [  OK   ]');
    const ok = cellsOf(root.rows[1])[1]!.content;
    expect(ok).toMatchObject({ type: 'button', label: { text: '  OK   ' } });
    expect(columnCount(root)).toBe(2);
  });

  it('keeps ragged rows as written (EC-02)', () => {
    const { root } = parseOk('{\n  a | b | c\n  d\n  e | f\n}');
    expect(root.rows.map((r) => cellsOf(r).length)).toEqual([3, 1, 2]);
    expect(columnCount(root)).toBe(3);
  });

  it('reads `.` as an empty cell that keeps its position', () => {
    const { root } = parseOk('{\n  . | x\n}');
    const [empty, x] = cellsOf(root.rows[0]);
    expect(empty!.content.type).toBe('empty');
    expect(x!.column).toBe(1);
  });

  it('drops blank cells, which PlantUML collapses', () => {
    const { root } = parseOk('{\n  a | | b\n  | c\n}');
    expect(cellsOf(root.rows[0]).map((c) => c.column)).toEqual([0, 1]);
    expect(cellsOf(root.rows[1])).toHaveLength(1);
  });

  it('continues a row onto the next line after a trailing `|`, as PlantUML does', () => {
    const { root } = parseOk('{\n  a | b |\n  c\n  d\n}');
    expect(root.rows.map((r) => cellsOf(r).length)).toEqual([3, 1]);
  });

  it('reads column spans from `*` cells', () => {
    const { src, root } = parseOk('{\n  a | b | c\n  Wide | * | z\n  q | . | *\n}');
    const [wide, z] = cellsOf(root.rows[1]);
    expect(wide!.span).toBe(2);
    expect(wide!.spanRanges.map((r) => slice(src, r))).toEqual(['*']);
    expect(slice(src, wide!.range)).toBe('Wide | *');
    expect(z!.column).toBe(2);
    const [, empty] = cellsOf(root.rows[2]);
    expect(empty).toMatchObject({ span: 2, column: 1, content: { type: 'empty' } });
  });

  it('reads nested grids on one line and on several', () => {
    const { root } = parseOk('{\n  Name | { a | b }\n  {\n    c\n    d\n  } | [OK]\n}');
    const inner = cellsOf(root.rows[0])[1]!.content as Grid;
    expect(inner).toMatchObject({ type: 'grid', layout: 'singleLine' });
    expect(cellsOf(inner.rows[0]).length).toBe(2);
    const [multi, ok] = cellsOf(root.rows[1]);
    expect(multi!.content).toMatchObject({ type: 'grid', layout: 'multiLine' });
    expect((multi!.content as Grid).rows).toHaveLength(2);
    expect(ok!.content.type).toBe('button');
  });

  it('reads a single-line root grid', () => {
    const { root } = parseOk('{ [OK] | [Cancel] }');
    expect(root.layout).toBe('singleLine');
    expect(cellsOf(root.rows[0])).toHaveLength(2);
  });

  it.each([
    ['{', 'plain'],
    ['{+', 'border'],
    ['{#', 'tableLines'],
    ['{!', 'verticalLines'],
    ['{-', 'horizontalLines'],
    ['{^', 'groupBox'],
  ] as const)('reads the style of %s', (open, style) => {
    const { root } = parseOk(`${open}\n  a\n}`);
    expect(root.style).toBe(style);
  });

  it('reads a group box title, quoted or not', () => {
    const quoted = parseOk('{^"Sign in"\n  a\n}');
    expect(quoted.root.title).toMatchObject({ text: 'Sign in', formatted: false });
    expect(slice(quoted.src, quoted.root.title!.raw)).toBe('Sign in');
    expect(cellsOf(quoted.root.rows[0])).toHaveLength(1);
    expect(parseOk('{^ Options\n  a\n}').root.title?.text).toBe('Options');
    expect(parseOk('{^\n  a\n}').root.title).toBeNull();
  });

  it('reads the four separators as whole rows', () => {
    const { root } = parseOk('{\n  a\n  ..\n  ==\n  ~~\n  --\n  ...\n}');
    expect(root.rows.slice(1).map((r) => (r.type === 'separator' ? r.separatorKind : r.type))).toEqual([
      'dotted', 'double', 'wavy', 'single', 'dotted',
    ]);
  });
});

describe('parseSalt: elements (A.1)', () => {
  const content = (cell: string) => cellsOf(parseOk(`{\n  ${cell}\n}`).root.rows[0])[0]!.content;

  it('reads text, escapes removed', () => {
    expect(content('Hello world')).toMatchObject({ type: 'text', text: { text: 'Hello world', formatted: false } });
    expect(content('a<U+007C>b')).toMatchObject({ type: 'text', text: { text: 'a|b', formatted: false } });
    expect(content('a.b')).toMatchObject({ text: { text: 'a.b' } });
  });

  it('marks imported creole as formatted', () => {
    expect(content('**bold**')).toMatchObject({ type: 'text', text: { text: '**bold**', formatted: true } });
    expect(content('<&home> Home')).toMatchObject({ type: 'text', text: { text: '<&home> Home' } });
  });

  it('reads buttons', () => {
    expect(content('[Save]')).toMatchObject({ type: 'button', label: { text: 'Save' } });
  });

  it('reads text fields with their width', () => {
    expect(content('"abc     "')).toMatchObject({ type: 'textField', value: { text: 'abc' }, width: 8 });
    expect(content('""')).toMatchObject({ type: 'textField', value: { text: '' }, width: 0 });
  });

  it('reads checkboxes and radio buttons', () => {
    expect(content('[X] Remember me')).toMatchObject({ type: 'checkbox', checked: true, label: { text: 'Remember me' } });
    expect(content('[ ] Remember me')).toMatchObject({ type: 'checkbox', checked: false });
    expect(content('[X]')).toMatchObject({ type: 'checkbox', checked: true, label: { text: '' } });
    expect(content('(X) Card')).toMatchObject({ type: 'radioButton', selected: true, label: { text: 'Card' } });
    expect(content('( ) Cash')).toMatchObject({ type: 'radioButton', selected: false });
    // Lower-case x is not a checkbox in PlantUML; the cell is text.
    expect(content('[x] a').type).toBe('text');
  });

  it('reads closed and open drop-downs', () => {
    expect(content('^Light^')).toMatchObject({ type: 'dropDown', value: { text: 'Light' }, options: [], open: false });
    const open = content('^Light^^Light^^Dark^');
    expect(open).toMatchObject({ type: 'dropDown', open: true, value: { text: 'Light' } });
    expect((open as DropDown).options.map((o) => o.text)).toEqual(['Light', 'Dark']);
  });

  it('reads text that only looks like an element as text', () => {
    expect(content('[OK] x').type).toBe('text');
    expect(content('^a^ x').type).toBe('text');
    expect(content('"ab').type).toBe('text');
  });

  it('reads a tree with depths', () => {
    const tree = content('{T\n   + Docs\n   ++ Guide\n   + Src\n  }');
    expect(tree).toMatchObject({ type: 'tree' });
    expect((tree as Tree).items.map((i) => [i.depth, i.text.text])).toEqual([
      [1, 'Docs'], [2, 'Guide'], [1, 'Src'],
    ]);
  });

  it('reads a tab bar and its bold selected tab', () => {
    const bar = content('{/ General | <b>Display | Sound }');
    expect(bar).toMatchObject({ type: 'tabBar', selectedIndex: 1 });
    expect((bar as TabBar).tabs.map((t) => t.text)).toEqual(['General', 'Display', 'Sound']);
    expect(content('{/ A | B }')).toMatchObject({ selectedIndex: null });
  });

  it('reads a menu bar', () => {
    const bar = content('{* File | Edit | Help }');
    expect(bar).toMatchObject({ type: 'menuBar', openMenus: [] });
    expect((bar as MenuBar).items.map((t) => t.text)).toEqual(['File', 'Edit', 'Help']);
  });

  it('reads a scroll area', () => {
    const area = content('{S\n    a\n    b\n  }');
    expect(area).toMatchObject({ type: 'scrollArea' });
    expect((area as ScrollArea).rows).toHaveLength(2);
  });
});

describe('parseSalt: leading comments', () => {
  it('attaches full-line comments directly above a row, but not across a blank line', () => {
    const { src, root } = parseOk("{\n  ' about a\n  /' block '/\n  a\n  ' loose\n\n  b\n}");
    expect(root.rows[0]!.leadingComments.map((r) => slice(src, r))).toEqual(["' about a", "/' block '/"]);
    expect(root.rows[1]!.leadingComments).toEqual([]);
  });

  it('attaches comments above the root grid to it', () => {
    const { src, root } = parseOk("' the screen\n{\n  a\n}");
    expect(root.leadingComments.map((r) => slice(src, r))).toEqual(["' the screen"]);
  });
});

describe('parseSalt: locked parts (section 4.1)', () => {
  const lockedIn = (body: string): { src: string; locked: readonly LockedPart[] } => {
    const src = block(body);
    const r = parseSalt(src);
    expect(r.errors).toEqual([]);
    expect(r.diagnostics).toEqual([]);
    expect(r.model).not.toBeNull();
    return { src, locked: r.lockedParts };
  };

  it.each(['T#', 'T!', 'T-', 'T+'])('locks the tree-table variant {%s as a whole cell', (mod) => {
    const { src, locked } = lockedIn(`{\n  Folders\n  {${mod}\n  + Name | Size\n  ++ docs | 4 kB\n  }\n  [Open]\n}`);
    expect(locked).toHaveLength(1);
    expect(locked[0]!.reason).toBe(LOCKED_REASONS.treeTable);
    expect(locked[0]!.excerpt).toBe(slice(src, locked[0]!.range));
    expect(locked[0]!.excerpt.startsWith(`{${mod}`)).toBe(true);
    expect(locked[0]!.excerpt.endsWith('}')).toBe(true);
  });

  it('locks the open menus of a menu bar, one per row, and keeps the bar', () => {
    const src = block('{\n  {* File | Edit\n     New | Undo\n     Open | Redo }\n}');
    const r = parseSalt(src);
    expect(r.errors).toEqual([]);
    const bar = cellsOf(r.model!.root.rows[0])[0]!.content;
    expect(bar).toMatchObject({ type: 'menuBar' });
    expect((bar as MenuBar).items.map((i) => i.text)).toEqual(['File', 'Edit']);
    expect(r.lockedParts.map((l) => [l.reason, l.excerpt])).toEqual([
      [LOCKED_REASONS.openMenu, 'New | Undo'],
      [LOCKED_REASONS.openMenu, 'Open | Redo'],
    ]);
  });

  it.each(['SI', 'S-'])('locks the scroll-area variant {%s', (mod) => {
    const { locked } = lockedIn(`{\n  {${mod}\n    a\n  }\n}`);
    expect(locked.map((l) => l.reason)).toEqual([LOCKED_REASONS.scrollVariant]);
  });

  it('locks a container with an unknown modifier', () => {
    const { src, locked } = lockedIn('{\n  Name | "     "\n  {Q one | two }\n  [Save]\n}');
    expect(locked.map((l) => l.reason)).toEqual([LOCKED_REASONS.unknownModifier]);
    expect(slice(src, locked[0]!.range)).toBe('{Q one | two }');
  });

  it('keeps content around a locked part editable', () => {
    const src = block('{\n  {T#\n  + a | b\n  }\n  [Open]\n}');
    const r = parseSalt(src);
    const rows = r.model!.root.rows;
    expect(cellsOf(rows[0])[0]!.content.type).toBe('locked');
    expect(cellsOf(rows[1])[0]!.content.type).toBe('button');
  });

  it('locks a cell holding a grid followed by text, and a separator beside other cells', () => {
    const { locked } = lockedIn('{\n  {+ x } y | z\n  -- | w\n}');
    expect(locked.map((l) => l.reason)).toEqual([LOCKED_REASONS.mixedCell, LOCKED_REASONS.separatorInRow]);
  });
});

describe('parseSalt: source-only diagnostics', () => {
  const diag = (body: string) => {
    const r = parseSalt(block(body));
    expect(r.errors).toEqual([]);
    expect(r.model).toBeNull();
    return r.diagnostics;
  };

  it('makes a block with a preprocessor directive source-only', () => {
    expect(diag('!define LABEL Save\n{\n  [LABEL]\n}')).toMatchObject([
      { kind: 'unsupported', messageKey: SOURCE_ONLY_REASONS.preprocessor, line: 2 },
    ]);
    expect(diag('{\n  a\n  !include x.puml\n}')).toMatchObject([{ kind: 'unsupported', line: 4 }]);
  });

  it('reports several root grids as ignored content, naming it', () => {
    expect(diag('{\n  First grid\n}\n{\n  Second grid\n}')).toMatchObject([
      { kind: 'ignoredContent', messageKey: SOURCE_ONLY_REASONS.severalRootGrids, line: 5, params: { content: '{' } },
    ]);
  });

  it('reports text after the root grid as ignored content, naming it', () => {
    expect(diag('{\n  Visible\n}\nThis line is silently ignored')).toMatchObject([
      { kind: 'ignoredContent', messageKey: SOURCE_ONLY_REASONS.textAfterRoot, line: 5, params: { content: 'This line is silently ignored' } },
    ]);
    expect(diag('{ a } after')).toMatchObject([{ kind: 'ignoredContent', line: 2, params: { content: 'after' } }]);
  });

  it('makes a container with more than one style modifier source-only (EC-09)', () => {
    expect(diag('{+\n  Outer\n  {#!\n  a | b\n  }\n}')).toMatchObject([
      { kind: 'unsupported', messageKey: SOURCE_ONLY_REASONS.multipleStyles, line: 4 },
    ]);
  });

  it('makes a root that is not a grid source-only', () => {
    expect(diag('{T\n + a\n}')).toMatchObject([{ kind: 'unsupported', messageKey: SOURCE_ONLY_REASONS.rootNotGrid }]);
  });

  it('words ignored content differently from syntax errors', () => {
    for (const key of [SOURCE_ONLY_REASONS.severalRootGrids, SOURCE_ONLY_REASONS.textAfterRoot]) {
      expect(key.startsWith('diagnostic.syntax.')).toBe(false);
    }
  });
});

describe('parseSalt: syntax errors with their line', () => {
  const errs = (src: string) => {
    const r = parseSalt(src);
    expect(r.model).toBeNull();
    expect(r.diagnostics.filter((d) => d.kind === 'syntax').map((d) => [d.messageKey, d.line])).toEqual(
      r.errors.map((e) => [e.messageKey, e.line]),
    );
    return r.errors.map((e) => [e.messageKey, e.line]);
  };

  it('reports an unclosed root grid at its opening line', () => {
    expect(errs('@startsalt Broken\n{\n  Name | "     "\n  [Save]\n@endsalt\n')).toEqual([
      ['diagnostic.syntax.unclosedContainer', 2],
    ]);
  });

  it('reports an unclosed nested container', () => {
    expect(errs(block('{\n  a\n  {+\n    b\n}'))).toEqual([['diagnostic.syntax.unclosedContainer', 2]]);
  });

  it('reports a stray closing brace', () => {
    expect(errs(block('{\n  a\n}\n}'))).toEqual([['diagnostic.syntax.unexpectedClose', 5]]);
  });

  it('reports a span in the first column', () => {
    expect(errs(block('{\n  a | b\n  * | c\n}'))).toEqual([['diagnostic.syntax.spanInFirstColumn', 4]]);
  });

  it('reports a screen with no grid', () => {
    expect(errs(block(''))).toEqual([['diagnostic.syntax.noRootGrid', 1]]);
  });

  it('reports text before the root grid', () => {
    expect(errs(block('salt\n{\n  a\n}'))).toEqual([['diagnostic.syntax.invalidLine', 2]]);
  });

  it('reports a missing end line', () => {
    expect(errs('@startsalt X\n{\n  a\n}\n')).toEqual([['diagnostic.syntax.missingEndLine', 4]]);
  });

  it('reports an unclosed block comment', () => {
    expect(errs(block("{\n  a\n}\n/' open"))).toContainEqual(['diagnostic.syntax.unclosedComment', 5]);
  });

  it('counts lines with CRLF and CR endings', () => {
    expect(errs('@startsalt X\r\n{\r\n  a\r\n}\r\n}\r\n@endsalt\r\n')).toEqual([['diagnostic.syntax.unexpectedClose', 5]]);
    expect(errs('@startsalt X\r{\r  a\r}\r}\r@endsalt\r')).toEqual([['diagnostic.syntax.unexpectedClose', 5]]);
  });

  it('prefers a syntax error over source-only reasons', () => {
    const r = parseSalt(block('!define X\n{\n  a'));
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.model).toBeNull();
  });
});
