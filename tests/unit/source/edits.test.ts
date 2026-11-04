import { describe, expect, it } from 'vitest';
import { applyEdits, invertEdits } from '../../../src/core/source/edits.ts';
import type { TextEdit } from '../../../src/core/types.ts';

const edit = (start: number, end: number, text: string): TextEdit => ({ start, end, text });

describe('applyEdits', () => {
  it('returns the source unchanged for no edits', () => {
    expect(applyEdits('abc', [])).toBe('abc');
  });

  it('replaces, inserts and deletes', () => {
    expect(applyEdits('hello world', [edit(0, 5, 'goodbye')])).toBe('goodbye world');
    expect(applyEdits('ac', [edit(1, 1, 'b')])).toBe('abc');
    expect(applyEdits('abc', [edit(1, 2, '')])).toBe('ac');
    expect(applyEdits('abc', [edit(3, 3, 'd')])).toBe('abcd');
    expect(applyEdits('', [edit(0, 0, 'x')])).toBe('x');
  });

  it('treats every offset as an offset into the original source, whatever the order given', () => {
    const source = '{\n  Name | "    "\n  [OK]\n}';
    const edits = [edit(4, 8, 'Email'), edit(21, 23, 'Save'), edit(1, 1, '+')];
    const expected = '{+\n  Email | "    "\n  [Save]\n}';
    expect(applyEdits(source, edits)).toBe(expected);
    expect(applyEdits(source, [...edits].reverse())).toBe(expected);
  });

  it('applies adjacent edits that touch but do not overlap', () => {
    expect(applyEdits('abcdef', [edit(0, 2, 'X'), edit(2, 4, 'Y'), edit(4, 6, 'Z')])).toBe('XYZ');
  });

  it('keeps the given order for insertions at the same offset', () => {
    expect(applyEdits('ad', [edit(1, 1, 'b'), edit(1, 1, 'c')])).toBe('abcd');
  });

  it('puts an insertion before a replacement that starts at the same offset', () => {
    expect(applyEdits('a__d', [edit(1, 3, 'c'), edit(1, 1, 'b')])).toBe('abcd');
  });

  it('works on UTF-16 offsets, including non-English text and CRLF', () => {
    const source = '@startsalt Überblick\r\n{\r\n  [Привет]\r\n}\r\n@endsalt';
    const start = source.indexOf('Привет');
    expect(applyEdits(source, [edit(start, start + 6, '你好')])).toBe('@startsalt Überblick\r\n{\r\n  [你好]\r\n}\r\n@endsalt');
  });

  it('does not change the edits it is given', () => {
    const edits = [edit(2, 3, 'x'), edit(0, 1, 'y')];
    const copy = JSON.parse(JSON.stringify(edits)) as TextEdit[];
    applyEdits('abcd', edits);
    expect(edits).toEqual(copy);
  });

  it('refuses overlapping edits and changes nothing', () => {
    expect(() => applyEdits('abcdef', [edit(0, 3, 'x'), edit(2, 4, 'y')])).toThrow(RangeError);
    expect(() => applyEdits('abcdef', [edit(1, 4, 'x'), edit(2, 2, 'y')])).toThrow(RangeError);
    expect(() => applyEdits('abcdef', [edit(1, 3, 'x'), edit(1, 3, 'y')])).toThrow(RangeError);
  });

  it('refuses edits outside the source or with start after end', () => {
    expect(() => applyEdits('abc', [edit(2, 4, 'x')])).toThrow(RangeError);
    expect(() => applyEdits('abc', [edit(-1, 1, 'x')])).toThrow(RangeError);
    expect(() => applyEdits('abc', [edit(2, 1, 'x')])).toThrow(RangeError);
    expect(() => applyEdits('abc', [edit(0.5, 1, 'x')])).toThrow(RangeError);
  });
});

describe('invertEdits', () => {
  const cases: Array<[string, string, TextEdit[]]> = [
    ['replacement', 'hello world', [edit(0, 5, 'goodbye')]],
    ['insertion', 'ac', [edit(1, 1, 'b')]],
    ['deletion', 'abc', [edit(1, 2, '')]],
    ['several, unordered', '{\n  Name | "    "\n  [OK]\n}', [edit(21, 23, 'Save'), edit(4, 8, 'Email'), edit(1, 1, '+')]],
    ['adjacent', 'abcdef', [edit(0, 2, 'X'), edit(2, 4, 'Y'), edit(4, 6, 'Z')]],
    ['same-offset insertions', 'ad', [edit(1, 1, 'b'), edit(1, 1, 'c')]],
    ['insertion then replacement at one offset', 'a__d', [edit(1, 3, 'c'), edit(1, 1, 'b')]],
    ['whole text', 'abc', [edit(0, 3, '')]],
    ['into empty', '', [edit(0, 0, 'x\r\ny')]],
    ['surrogate pairs', 'a😀b😀c', [edit(1, 3, ''), edit(4, 6, '🎉🎉')]],
  ];

  it.each(cases)('restores the text exactly: %s', (_name, source, edits) => {
    const after = applyEdits(source, edits);
    const inverse = invertEdits(source, edits);
    expect(applyEdits(after, inverse)).toBe(source);
  });

  it.each(cases)('the inverse of the inverse redoes the edit: %s', (_name, source, edits) => {
    const after = applyEdits(source, edits);
    const inverse = invertEdits(source, edits);
    expect(applyEdits(source, invertEdits(after, inverse))).toBe(after);
  });

  it('gives offsets into the edited text, holding the replaced text', () => {
    expect(invertEdits('abcdef', [edit(4, 5, 'XYZ'), edit(0, 2, '')])).toEqual([edit(0, 0, 'ab'), edit(2, 5, 'e')]);
  });

  it('returns no edits for no edits', () => {
    expect(invertEdits('abc', [])).toEqual([]);
  });

  it('refuses edits that applyEdits refuses', () => {
    expect(() => invertEdits('abcdef', [edit(0, 3, 'x'), edit(2, 4, 'y')])).toThrow(RangeError);
    expect(() => invertEdits('abc', [edit(2, 4, 'x')])).toThrow(RangeError);
  });

  it('round-trips random non-overlapping edits', () => {
    let seed = 12345;
    const random = (n: number): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    const alphabet = ['a', 'b', '\n', '\r\n', '{', '|', 'é', '😀', ''];
    for (let run = 0; run < 300; run++) {
      const source = Array.from({ length: random(30) }, () => alphabet[random(alphabet.length)]).join('');
      const cuts = Array.from({ length: random(8) }, () => random(source.length + 1)).sort((a, b) => a - b);
      const edits: TextEdit[] = [];
      for (let i = 0; i + 1 < cuts.length; i += 2) {
        edits.push(edit(cuts[i]!, cuts[i + 1]!, alphabet[random(alphabet.length)]!.repeat(random(3))));
      }
      edits.sort(() => random(3) - 1);
      const after = applyEdits(source, edits);
      expect(applyEdits(after, invertEdits(source, edits))).toBe(source);
    }
  });
});
