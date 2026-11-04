import { describe, expect, it } from 'vitest';
import { lexSalt, type SaltToken } from '../../../src/core/salt/lexer.ts';

/** Every token as `kind:text`, for readable expectations. */
const show = (src: string): string[] => lexSalt(src).map((t) => `${t.kind}:${src.slice(t.start, t.end)}`);

/** Tokens are contiguous, non-empty and cover the source exactly. */
function expectLossless(src: string, tokens: readonly SaltToken[] = lexSalt(src)): void {
  let at = 0;
  for (const t of tokens) {
    expect(t.start, `gap or overlap before ${t.kind}@${t.start}`).toBe(at);
    expect(t.end, `empty ${t.kind}@${t.start}`).toBeGreaterThan(t.start);
    at = t.end;
  }
  expect(at).toBe(src.length);
  expect(tokens.map((t) => src.slice(t.start, t.end)).join('')).toBe(src);
}

describe('lexSalt: lossless', () => {
  const samples = [
    '',
    '@startsalt Login\n{\n  Login    | "MyName   "\n  Password | "****     "\n  [Cancel] | [  OK   ]\n}\n@endsalt',
    '@startsalt\r\n{+\r\n\t\'comment\r\n  a | b\r\n}\r\n@endsalt\r\n',
    '@startsalt\r{\ra\r}\r@endsalt',
    "@startsalt\n/' block\n   comment '/\n{^\"Group\"\n  {T\n   + a\n   ++ b\n  }\n}\n@endsalt",
    '{ a | b } trailing text\n',
    '{SI\n.\n}\n{S-\n*\n}',
    '   \n\t\n',
    "/' never closed\n{ a }\n@endsalt",
    'Écran | 登录 | Вход\n',
    '{#\n  Column 1 | Column 2\n  a | * \n  == \n}',
  ];

  it.each(samples)('covers %j exactly', (src) => {
    expectLossless(src);
  });

  it('is lossless on arbitrary text', () => {
    const alphabet = ['{', '}', '|', "'", '/', '!', '@', ' ', '\t', '\n', '\r', 'a', 'T', 'S', 'I', '+', '#', '-', '^', '*', '"', '.', 'é'];
    let seed = 7;
    const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x80000000;
    for (let n = 0; n < 500; n++) {
      let src = '';
      const len = Math.floor(rand() * 40);
      for (let i = 0; i < len; i++) src += alphabet[Math.floor(rand() * alphabet.length)];
      expectLossless(src);
    }
  });
});

describe('lexSalt: lines', () => {
  it('recognises the block start and end lines', () => {
    expect(show('@startsalt Login\n{\n}\n@endsalt')).toEqual([
      'start:@startsalt Login', 'newline:\n', 'open:{', 'newline:\n', 'close:}', 'newline:\n', 'end:@endsalt',
    ]);
  });

  it('keeps each newline form as one token', () => {
    expect(show('a\r\nb\rc\n')).toEqual(['text:a', 'newline:\r\n', 'text:b', 'newline:\r', 'text:c', 'newline:\n']);
  });

  it('reads a full-line comment, indented or not, including structural characters', () => {
    expect(show("'c | d\n\t' x { y }\n")).toEqual([
      "comment:'c | d", 'newline:\n', 'whitespace:\t', "comment:' x { y }", 'newline:\n',
    ]);
  });

  it("does not treat a ' after other text as a comment", () => {
    expect(show("Don't | C")).toEqual(["text:Don't", 'whitespace: ', 'pipe:|', 'whitespace: ', 'text:C']);
    expect(show("{ a } ' x")).toEqual(['open:{', 'whitespace: ', 'text:a', 'whitespace: ', 'close:}', 'whitespace: ', "text:' x"]);
  });

  it('reads a one-line block comment and lexes the rest of the line', () => {
    expect(show("/' c '/ a | b")).toEqual(["blockComment:/' c '/", 'whitespace: ', 'text:a', 'whitespace: ', 'pipe:|', 'whitespace: ', 'text:b']);
  });

  it('reads a multi-line block comment up to a line ending in the closer', () => {
    const src = "  /' one\ntwo '/ not yet\nthree '/  \na";
    expect(show(src)).toEqual([
      'whitespace:  ', "blockComment:/' one\ntwo '/ not yet\nthree '/", 'whitespace:  ', 'newline:\n', 'text:a',
    ]);
  });

  it('marks an unclosed block comment and lets it run to the end', () => {
    const src = "/' open\n{ a }\n@endsalt";
    const tokens = lexSalt(src);
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({ kind: 'blockComment', start: 0, end: src.length, unterminated: true });
  });

  it("does not open a block comment after other text", () => {
    expect(show("A /' x '/ B | C")).toEqual(["text:A /' x '/ B", 'whitespace: ', 'pipe:|', 'whitespace: ', 'text:C']);
  });

  it('reads preprocessor lines whole', () => {
    expect(show('!define X | y\n  !include foo.puml\n')).toEqual([
      'preprocessor:!define X | y', 'newline:\n', 'whitespace:  ', 'preprocessor:!include foo.puml', 'newline:\n',
    ]);
  });
});

describe('lexSalt: grid tokens', () => {
  it('splits cells on pipes and keeps whitespace inside cell text', () => {
    expect(show('  Login    | "MyName   " |  [Sign in] ')).toEqual([
      'whitespace:  ', 'text:Login', 'whitespace:    ', 'pipe:|', 'whitespace: ', 'text:"MyName   "', 'whitespace: ',
      'pipe:|', 'whitespace:  ', 'text:[Sign in]', 'whitespace: ',
    ]);
  });

  it('reads braces anywhere on a line', () => {
    expect(show('{ a | { b | c } }')).toEqual([
      'open:{', 'whitespace: ', 'text:a', 'whitespace: ', 'pipe:|', 'whitespace: ', 'open:{', 'whitespace: ', 'text:b',
      'whitespace: ', 'pipe:|', 'whitespace: ', 'text:c', 'whitespace: ', 'close:}', 'whitespace: ', 'close:}',
    ]);
  });

  it('reads separators, spans, empty cells and tree items as text', () => {
    expect(show('..\n==\n* | .\n++ item')).toEqual([
      'text:..', 'newline:\n', 'text:==', 'newline:\n', 'text:*', 'whitespace: ', 'pipe:|', 'whitespace: ', 'text:.',
      'newline:\n', 'text:++ item',
    ]);
  });
});

describe('lexSalt: container modifiers', () => {
  const modifierOf = (src: string): string | undefined => lexSalt(src).find((t) => t.kind === 'open')?.modifier;

  it.each([
    ['{', ''],
    ['{+', '+'],
    ['{#', '#'],
    ['{!', '!'],
    ['{-', '-'],
    ['{^"Title"', '^'],
    ['{^Plain title', '^'],
    ['{*', '*'],
    ['{/ Tab 1 | Tab 2 }', '/'],
    ['{S', 'S'],
    ['{SI', 'SI'],
    ['{S-', 'S-'],
    ['{T', 'T'],
    ['{T  ', 'T'],
    ['{T#', 'T#'],
    ['{T!', 'T!'],
    ['{T-', 'T-'],
    ['{T+', 'T+'],
    ['{+#', '+#'],
    ['{#+-', '#+-'],
  ])('reads %j with modifier %j', (src, modifier) => {
    expect(modifierOf(src)).toBe(modifier);
    expectLossless(src);
  });

  it('keeps a modifier adjacent to the brace only', () => {
    expect(show('{ + a')).toEqual(['open:{', 'whitespace: ', 'text:+ a']);
  });

  it('reads a T followed by more text on the line as cell text, as PlantUML does', () => {
    expect(show('{Total | 5}')).toEqual(['open:{', 'text:Total', 'whitespace: ', 'pipe:|', 'whitespace: ', 'text:5', 'close:}']);
    expect(show('{T a | b}')[0]).toBe('open:{');
    expect(show('{T#abc')).toEqual(['open:{', 'text:T#abc']);
  });

  it('reads a group box title as the text after the modifier', () => {
    expect(show('{^"My group"\n')).toEqual(['open:{^', 'text:"My group"', 'newline:\n']);
    expect(show('{^Title | x }')).toEqual(['open:{^', 'text:Title', 'whitespace: ', 'pipe:|', 'whitespace: ', 'text:x', 'whitespace: ', 'close:}']);
  });

  it('reads an unknown modifier as cell text', () => {
    expect(show('{Z a | b}').slice(0, 2)).toEqual(['open:{', 'text:Z a']);
  });
});
