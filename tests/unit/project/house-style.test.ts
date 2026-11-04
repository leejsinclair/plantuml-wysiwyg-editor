import { describe, expect, it } from 'vitest';
import {
  INDENT,
  NEW_PROJECT_LINE_ENDING,
  chooseLineEnding,
  firstLineEnding,
  indent,
  newFlowBlock,
  newScreenBlock,
  salt,
  flow,
} from '../../../src/core/project/house-style.ts';

describe('house style: line endings (FR-020/AC2, AC5)', () => {
  it('finds the first line ending of a text', () => {
    expect(firstLineEnding('a\nb\r\nc')).toBe('\n');
    expect(firstLineEnding('a\r\nb\nc')).toBe('\r\n');
    expect(firstLineEnding('a\rb')).toBe('\r');
    expect(firstLineEnding('no line ending')).toBeNull();
    expect(firstLineEnding('')).toBeNull();
  });

  it("uses the block's own line ending first", () => {
    expect(chooseLineEnding({ block: '@startsalt A\r\n{\r\n}\r\n@endsalt', file: 'x\ny' })).toBe('\r\n');
  });

  it("falls back to the file's first line ending when the block has none", () => {
    expect(chooseLineEnding({ block: '@startsalt A', file: "' c\r\n@startsalt A" })).toBe('\r\n');
    expect(chooseLineEnding({ block: null, file: 'a\nb' })).toBe('\n');
  });

  it('uses LF for a new project or a text with no line ending', () => {
    expect(NEW_PROJECT_LINE_ENDING).toBe('\n');
    expect(chooseLineEnding({})).toBe('\n');
    expect(chooseLineEnding({ block: 'x', file: 'y' })).toBe('\n');
  });
});

describe('house style: indentation', () => {
  it('indents with two spaces per level', () => {
    expect(INDENT).toBe('  ');
    expect(indent(0)).toBe('');
    expect(indent(1)).toBe('  ');
    expect(indent(3)).toBe('      ');
  });

  it('rejects a negative or fractional depth', () => {
    expect(() => indent(-1)).toThrow();
    expect(() => indent(1.5)).toThrow();
  });
});

describe('house style: new blocks', () => {
  it('writes a new screen as an empty one-column root grid (project-file.md §3)', () => {
    expect(newScreenBlock('Screen-1', '\n')).toBe('@startsalt Screen-1\n{\n}\n@endsalt\n');
    expect(newScreenBlock('Screen-1', '\r\n')).toBe('@startsalt Screen-1\r\n{\r\n}\r\n@endsalt\r\n');
  });

  it('writes a new screen flow with start and stop (project-file.md §4)', () => {
    expect(newFlowBlock('Screen-flow', '\n')).toBe('@startuml Screen-flow\nstart\nstop\n@enduml\n');
    expect(newFlowBlock('Screen-flow', '\r\n')).toBe('@startuml Screen-flow\r\nstart\r\nstop\r\n@enduml\r\n');
  });
});

describe('house style: Salt element templates (A.1)', () => {
  it('writes the single-cell elements', () => {
    expect(salt.text('Email')).toBe('Email');
    expect(salt.emptyCell()).toBe('.');
    expect(salt.button('OK')).toBe('[OK]');
    expect(salt.checkbox('Remember me', true)).toBe('[X] Remember me');
    expect(salt.checkbox('Remember me', false)).toBe('[ ] Remember me');
    expect(salt.radio('Card', true)).toBe('(X) Card');
    expect(salt.radio('Card', false)).toBe('( ) Card');
    expect(salt.dropDown('Choose')).toBe('^Choose^');
    expect(salt.dropDown('Choose', ['Option 1', 'Option 2'])).toBe('^Choose^^Option 1^^Option 2^');
  });

  it('pads a text field to its width and never trims a longer value (FR-020/AC3)', () => {
    expect(salt.textField('abc', 6)).toBe('"abc   "');
    expect(salt.textField('', 4)).toBe('"    "');
    expect(salt.textField('longer value', 4)).toBe('"longer value"');
    expect(salt.textField('a  ')).toBe(`"a${' '.repeat(salt.DEFAULT_FIELD_WIDTH - 1)}"`);
  });

  it('writes each separator kind as a whole row', () => {
    for (const kind of ['..', '==', '~~', '--'] as const) expect(salt.separator(kind)).toBe(kind);
  });

  it('writes the opener for every container style', () => {
    expect(salt.opener({ style: 'plain' })).toBe('{');
    expect(salt.opener({ style: 'border' })).toBe('{+');
    expect(salt.opener({ style: 'tableLines' })).toBe('{#');
    expect(salt.opener({ style: 'verticalLines' })).toBe('{!');
    expect(salt.opener({ style: 'horizontalLines' })).toBe('{-');
    expect(salt.opener({ style: 'groupBox', title: 'Details' })).toBe('{^"Details"');
    expect(salt.opener({ style: 'tree' })).toBe('{T');
    expect(salt.opener({ style: 'tabBar' })).toBe('{/');
    expect(salt.opener({ style: 'menuBar' })).toBe('{*');
    expect(salt.opener({ style: 'scroll' })).toBe('{S');
  });

  it('writes a multi-line grid: opener, one indented row per line, cells joined with " | "', () => {
    expect(salt.grid('{', [], 0, '\n')).toBe('{\n}');
    expect(salt.grid('{', [['Name', '"   "'], ['.', '[OK]']], 0, '\n')).toBe(
      '{\n  Name | "   "\n  . | [OK]\n}',
    );
    expect(salt.grid('{+', [['a']], 2, '\r\n')).toBe('{+\r\n      a\r\n    }');
  });

  it('writes a single-line grid such as a tab bar', () => {
    expect(salt.inlineGrid('{/', ['Tab 1', 'Tab 2'])).toBe('{/ Tab 1 | Tab 2 }');
    expect(salt.inlineGrid('{', [])).toBe('{ }');
  });

  it('writes a tree with + depth markers', () => {
    expect(
      salt.tree(
        [
          { depth: 1, text: 'World' },
          { depth: 2, text: 'Europe' },
        ],
        1,
        '\n',
      ),
    ).toBe('{T\n    + World\n    ++ Europe\n  }');
    expect(() => salt.tree([{ depth: 0, text: 'x' }], 0, '\n')).toThrow();
  });

  it('writes a row of cells', () => {
    expect(salt.row(['a', 'b', '.'], 1)).toBe('  a | b | .');
  });
});

describe('house style: activity element templates (A.2)', () => {
  it('writes steps and linked steps', () => {
    expect(flow.step('Sign in')).toBe(':Sign in;');
    expect(flow.linkedStep('Login', 'Sign in')).toBe(':[[#Login Sign in]];');
    expect(flow.stop()).toBe('stop');
    expect(flow.start()).toBe('start');
  });

  it('writes a decision with two empty branches at the given depth', () => {
    expect(flow.decision({ condition: 'Valid?', thenLabel: 'yes', elseLabel: 'no' }, 0, '\n')).toBe(
      'if (Valid?) then (yes)\nelse (no)\nendif',
    );
    expect(flow.decision({ condition: 'Valid?', thenLabel: 'yes', elseLabel: 'no' }, 1, '\r\n')).toBe(
      '  if (Valid?) then (yes)\r\n  else (no)\r\n  endif',
    );
  });

  it('writes both loop forms with an empty body', () => {
    expect(flow.repeatLoop('Again?', 0, '\n')).toBe('repeat\nrepeat while (Again?)');
    expect(flow.whileLoop('More?', 1, '\n')).toBe('  while (More?)\n  endwhile');
  });

  it('writes notes in the single-line and block forms', () => {
    expect(flow.note('left', ['Check input'], 0, '\n')).toBe('note left: Check input');
    expect(flow.note('right', ['Line 1', 'Line 2'], 1, '\n')).toBe(
      '  note right\n    Line 1\n    Line 2\n  end note',
    );
  });

  it('writes a lane switch', () => {
    expect(flow.lane('Customer')).toBe('|Customer|');
  });

  it('indents a statement line', () => {
    expect(flow.line(':a;', 2)).toBe('    :a;');
  });
});

describe('house style: placeholder defaults', () => {
  it('provides non-empty default text for every new element', () => {
    for (const value of Object.values(salt.DEFAULTS)) expect(String(value).length).toBeGreaterThan(0);
    for (const value of Object.values(flow.DEFAULTS)) expect(String(value).length).toBeGreaterThan(0);
  });
});
