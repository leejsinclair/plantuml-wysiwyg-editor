import { describe, expect, it } from 'vitest';
import { lexActivity, type ActivityToken, type ActivityTokenKind } from '../../../src/core/activity/lexer.ts';

const text = (source: string, token: ActivityToken): string => source.slice(token.start, token.end);

/** Significant tokens (no whitespace, newlines or comments) as [kind, text] pairs. */
function significant(source: string): [ActivityTokenKind, string][] {
  return lexActivity(source)
    .filter((t) => t.kind !== 'whitespace' && t.kind !== 'newline' && t.kind !== 'comment')
    .map((t) => [t.kind, text(source, t)]);
}

function expectLossless(source: string): ActivityToken[] {
  const tokens = lexActivity(source);
  let offset = 0;
  for (const token of tokens) {
    expect(token.start).toBe(offset);
    expect(token.end).toBeGreaterThan(token.start);
    offset = token.end;
  }
  expect(offset).toBe(source.length);
  expect(tokens.map((t) => text(source, t)).join('')).toBe(source);
  return tokens;
}

describe('activity lexer: losslessness (R-3)', () => {
  const samples: Record<string, string> = {
    empty: '',
    simple: '@startuml Screen-flow\nstart\n:Sign in;\nstop\n@enduml\n',
    crlf: '@startuml F\r\nstart\r\n  :Step;\r\nstop\r\n@enduml',
    lonelyCr: '@startuml F\rstart\rstop\r@enduml\r',
    bomAndTabs: '﻿@startuml\n\tstart\t\n\t:a;  \nstop\n@enduml',
    unicode: '@startuml Écran\n:Zahlung prüfen — 支払い;\nstop\n@enduml\n',
    blockComment: "@startuml\n/' one\n two '/ start\n' line comment\nstop\n@enduml\n",
    unterminatedStep: '@startuml\n:never ends\nstop\n@enduml\n',
    unterminatedNote: '@startuml\nstart\nnote left\nnever ends\n',
    unterminatedComment: "@startuml\n/' never ends\n",
    whitespaceOnly: '  \n\t\r\n ',
  };

  for (const [name, source] of Object.entries(samples)) {
    it(`covers every character exactly once: ${name}`, () => {
      expectLossless(source);
    });
  }

  it('stays lossless on generated input', () => {
    const pieces = [':', ';', '\n', '\r\n', '\r', ' ', '\t', "'", "/'", "'/", '{{', '}}', 'if (a) then (b)', 'note left',
      'end note', '|L|', '(*)', '-->', '!define', 'x', 'é', '@enduml', 'repeat', 'endif', '[[#S a]]', '"'];
    let seed = 7;
    const random = (n: number): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    for (let run = 0; run < 300; run += 1) {
      let source = '';
      const length = random(40);
      for (let i = 0; i < length; i += 1) source += pieces[random(pieces.length)];
      expectLossless(source);
    }
  });
});

describe('activity lexer: line structure', () => {
  it('separates indentation, trailing whitespace and each line-ending form', () => {
    const source = '  start  \r\nstop\rend\n';
    expect(lexActivity(source).map((t) => [t.kind, text(source, t)])).toEqual([
      ['whitespace', '  '],
      ['start', 'start'],
      ['whitespace', '  '],
      ['newline', '\r\n'],
      ['stop', 'stop'],
      ['newline', '\r'],
      ['end', 'end'],
      ['newline', '\n'],
    ]);
  });

  it('recognises the block directives', () => {
    expect(significant('@startuml Screen-flow\n@enduml')).toEqual([
      ['startDirective', '@startuml Screen-flow'],
      ['endDirective', '@enduml'],
    ]);
  });
});

describe('activity lexer: current syntax', () => {
  it('lexes start, stop, end, detach and kill', () => {
    expect(significant('start\nstop\nend\ndetach\nkill').map(([kind]) => kind)).toEqual([
      'start', 'stop', 'end', 'detach', 'kill',
    ]);
  });

  it('lexes a single-line step and a linked step', () => {
    const source = ':Sign in;\n:[[#Login Enter credentials]];';
    const tokens = lexActivity(source).filter((t) => t.kind === 'step');
    expect(tokens.map((t) => text(source, t))).toEqual([':Sign in;', ':[[#Login Enter credentials]];']);
    expect(tokens.every((t) => t.kind === 'step' && t.terminator === ';' && !t.unterminated)).toBe(true);
  });

  it('lexes a multi-line step as one token that includes its inner line endings', () => {
    const source = ':first line\r\nsecond line;\nstop';
    expect(significant(source)).toEqual([
      ['step', ':first line\r\nsecond line;'],
      ['stop', 'stop'],
    ]);
  });

  it('records the other PlantUML step terminators so the parser can lock them', () => {
    for (const terminator of ['|', '<', '>', '/', ']', '}']) {
      const [token] = lexActivity(`:shape${terminator}`);
      expect(token).toMatchObject({ kind: 'step', terminator });
    }
  });

  it('lexes a coloured step', () => {
    expect(significant('#pink:Warn;')).toEqual([['step', '#pink:Warn;']]);
  });

  it('keeps an unterminated step to the end of the text and flags it', () => {
    const source = ':never ends\nstop\n';
    const [token] = lexActivity(source);
    expect(token).toMatchObject({ kind: 'step', start: 0, end: source.length, unterminated: true });
  });

  it('lexes decisions', () => {
    expect(significant('if (Valid?) then (yes)\nelseif (Retry?) then (again)\nelse if (x) then (y)\nelse (no)\nendif\nend if')
      .map(([kind]) => kind)).toEqual(['if', 'elseif', 'elseif', 'else', 'endif', 'endif']);
  });

  it('lexes both loop forms', () => {
    expect(significant('repeat\n:a;\nrepeat while (more?) is (yes) not (no)\nwhile (x?) is (yes)\nendwhile (no)\nend while')
      .map(([kind]) => kind)).toEqual(['repeat', 'step', 'repeatWhile', 'while', 'endwhile', 'endwhile']);
  });

  it('is case-insensitive for keywords', () => {
    expect(significant('START\nIf (a) Then (b)\nEndIf\nSTOP').map(([kind]) => kind)).toEqual([
      'start', 'if', 'endif', 'stop',
    ]);
  });

  it('does not take a word that only starts like a keyword', () => {
    expect(significant('starter\nstopped\nendless').map(([kind]) => kind)).toEqual(['unknown', 'unknown', 'unknown']);
  });

  it('lexes lane switches, with and without a colour', () => {
    expect(significant('|Customer|\n|#AntiqueWhite|Shop|\nstart')).toEqual([
      ['lane', '|Customer|'],
      ['lane', '|#AntiqueWhite|Shop|'],
      ['start', 'start'],
    ]);
  });

  it('lexes arrows written in the current syntax', () => {
    expect(significant('-> submitted;\n->\n-[#red]-> fail;')).toEqual([
      ['arrow', '-> submitted;'],
      ['arrow', '->'],
      ['arrow', '-[#red]-> fail;'],
    ]);
  });
});

describe('activity lexer: notes', () => {
  it('lexes a single-line note', () => {
    const [token] = lexActivity('note left: Check input');
    expect(token).toMatchObject({ kind: 'note', form: 'singleLine' });
  });

  it('lexes a block note up to and including "end note"', () => {
    const source = 'note right\n  Line 1\r\n  Line 2\n  end note\nstop';
    expect(significant(source)).toEqual([
      ['note', 'note right\n  Line 1\r\n  Line 2\n  end note'],
      ['stop', 'stop'],
    ]);
    expect(lexActivity(source)[0]).toMatchObject({ kind: 'note', form: 'block' });
  });

  it('accepts "endnote" and floating notes', () => {
    expect(significant('floating note left\ntext\nendnote').map(([kind]) => kind)).toEqual(['note']);
  });

  it('keeps an unterminated block note to the end of the text and flags it', () => {
    const source = 'note left\nnever ends\nstop';
    const [token] = lexActivity(source);
    expect(token).toMatchObject({ kind: 'note', form: 'block', end: source.length, unterminated: true });
  });
});

describe('activity lexer: Salt inside a step', () => {
  it('keeps a {{salt … }} step as one token even when the Salt contains step terminators', () => {
    const source = ':{{salt\n{\n  [OK] | [Cancel];\n  "abc" |\n}\n}};\nstop';
    const tokens = lexActivity(source);
    expect(tokens[0]).toMatchObject({ kind: 'step', embeddedSalt: true, terminator: ';' });
    expect(text(source, tokens[0]!)).toBe(':{{salt\n{\n  [OK] | [Cancel];\n  "abc" |\n}\n}};');
    expect(significant(source).map(([kind]) => kind)).toEqual(['step', 'stop']);
  });

  it('ends a {{salt … }} step at the terminator on the line after }}', () => {
    const source = ':Fill in the form\n{{salt\n{\n  [OK]\n}\n}}\n;\nstop';
    const tokens = lexActivity(source);
    expect(tokens[0]).toMatchObject({ kind: 'step', embeddedSalt: true, terminator: ';' });
    expect(text(source, tokens[0]!)).toBe(':Fill in the form\n{{salt\n{\n  [OK]\n}\n}}\n;');
    expect(significant(source).map(([kind]) => kind)).toEqual(['step', 'stop']);
  });

  it('marks ordinary steps as not embedding Salt', () => {
    expect(lexActivity(':plain;')[0]).toMatchObject({ kind: 'step', embeddedSalt: false });
  });
});

describe('activity lexer: locked constructs', () => {
  it('lexes fork, split and switch keywords', () => {
    const source = 'fork\nfork again\nend fork\nend merge\nsplit\nsplit again\nend split\nswitch (x)\ncase (a)\nendswitch';
    expect(significant(source).map(([kind]) => kind)).toEqual([
      'fork', 'forkAgain', 'endFork', 'endFork', 'split', 'splitAgain', 'endSplit', 'switch', 'case', 'endSwitch',
    ]);
  });

  it('lexes partitions and their closing brace', () => {
    expect(significant('partition Checkout {\n:Pay;\n}\ngroup G\nend group').map(([kind]) => kind)).toEqual([
      'partition', 'step', 'closeBrace', 'partition', 'endGroup',
    ]);
  });

  it('lexes goto and label', () => {
    expect(significant('label here\ngoto here').map(([kind]) => kind)).toEqual(['label', 'goto']);
  });
});

describe('activity lexer: legacy syntax and preprocessor', () => {
  it('lexes legacy (*) lines and legacy arrows', () => {
    expect(significant('(*) --> "First"\n"First" --> (*)\n--> "Second"\n(*top) --> "x"').map(([kind]) => kind)).toEqual([
      'legacy', 'legacy', 'legacy', 'legacy',
    ]);
  });

  it('lexes preprocessor lines', () => {
    expect(significant('!define X 1\n  !include foo.puml\n!$v = 2\nstart')).toEqual([
      ['preprocessor', '!define X 1'],
      ['preprocessor', '!include foo.puml'],
      ['preprocessor', '!$v = 2'],
      ['start', 'start'],
    ]);
  });
});

describe('activity lexer: comments', () => {
  it("lexes a full-line ' comment", () => {
    const source = "  ' a comment\nstart";
    expect(lexActivity(source).map((t) => [t.kind, text(source, t)])).toEqual([
      ['whitespace', '  '],
      ['comment', "' a comment"],
      ['newline', '\n'],
      ['start', 'start'],
    ]);
  });

  it("lexes a /' … '/ block comment across lines and continues after it", () => {
    const source = "/' a\nb '/ start\nstop";
    expect(lexActivity(source).map((t) => [t.kind, text(source, t)])).toEqual([
      ['comment', "/' a\nb '/"],
      ['whitespace', ' '],
      ['start', 'start'],
      ['newline', '\n'],
      ['stop', 'stop'],
    ]);
  });

  it('flags an unterminated block comment', () => {
    const source = "/' never\nends";
    expect(lexActivity(source)).toEqual([{ kind: 'comment', start: 0, end: source.length, unterminated: true }]);
  });

  it('treats a quote inside a step label as label text, not a comment', () => {
    expect(significant(":Don't stop;")).toEqual([['step', ":Don't stop;"]]);
  });
});

describe('activity lexer: anything else', () => {
  it('keeps unrecognised lines as unknown tokens', () => {
    expect(significant('title Checkout\nskinparam x y')).toEqual([
      ['unknown', 'title Checkout'],
      ['unknown', 'skinparam x y'],
    ]);
  });
});
