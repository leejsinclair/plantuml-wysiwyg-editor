import { describe, expect, it } from 'vitest';
import { escapeSaltText, isFormattedSaltText, unescapeSaltText } from '../../../src/core/salt/escape.ts';

const first = { firstCellOfRow: true };
const later = { firstCellOfRow: false };
const ZWS = '​';

describe('escapeSaltText', () => {
  it('writes ordinary text unchanged (FR-003/AC6)', () => {
    for (const t of ['a.b', '5 * 3', 'Sign in', 'Größe', 'e-mail', 'x_y', 'a / b', 'say "hi"', 'Total: 5', '', 'Titles', 'scaled'])
      for (const ctx of [first, later]) expect(escapeSaltText(t, ctx), t).toBe(t);
  });

  it('escapes braces and bars wherever they appear', () => {
    expect(escapeSaltText('{', later)).toBe('<U+007B>');
    expect(escapeSaltText('}', later)).toBe('<U+007D>');
    expect(escapeSaltText('|', later)).toBe('<U+007C>');
    expect(escapeSaltText('a {b} | c', later)).toBe('a <U+007B>b<U+007D> <U+007C> c');
  });

  it('escapes a leading *, [, (, ^, " and ==', () => {
    expect(escapeSaltText('*a', later)).toBe('<U+002A>a');
    expect(escapeSaltText('[x', later)).toBe('<U+005B>x');
    expect(escapeSaltText('(a', later)).toBe('<U+0028>a');
    expect(escapeSaltText('^a', later)).toBe('<U+005E>a');
    expect(escapeSaltText('"q', later)).toBe('<U+0022>q');
    expect(escapeSaltText('==a', later)).toBe('<U+003D><U+003D>a');
    expect(escapeSaltText('*', later)).toBe('<U+002A>');
  });

  it('leaves the same characters alone when they are not leading', () => {
    expect(escapeSaltText('a [x]', later)).toBe('a [x]');
    expect(escapeSaltText('f(a)', later)).toBe('f(a)');
    expect(escapeSaltText('2^8', later)).toBe('2^8');
    expect(escapeSaltText('a == b', later)).toBe('a == b');
  });

  it('escapes a whole cell that is ., ... or a separator', () => {
    expect(escapeSaltText('.', later)).toBe('<U+002E>');
    expect(escapeSaltText('...', later)).toBe('<U+002E><U+002E><U+002E>');
    expect(escapeSaltText('..', first)).toBe('<U+002E><U+002E>');
    expect(escapeSaltText('==', later)).toBe('<U+003D><U+003D>');
    expect(escapeSaltText('~~', later)).toBe('<U+007E><U+007E>');
    expect(escapeSaltText('--', later)).toBe('<U+002D><U+002D>');
    expect(escapeSaltText('wait...', later)).toBe('wait...');
  });

  it('escapes the creole pairs', () => {
    expect(escapeSaltText('**b**', later)).toBe('<U+002A><U+002A>b<U+002A><U+002A>');
    expect(escapeSaltText('//i//', later)).toBe('<U+002F><U+002F>i<U+002F><U+002F>');
    expect(escapeSaltText('__u__', later)).toBe('<U+005F><U+005F>u<U+005F><U+005F>');
    expect(escapeSaltText('""m""', later)).toBe('<U+0022><U+0022>m<U+0022><U+0022>');
    expect(escapeSaltText('--s--', later)).toBe('<U+002D><U+002D>s<U+002D><U+002D>');
    expect(escapeSaltText('~~w~~', later)).toBe('<U+007E><U+007E>w<U+007E><U+007E>');
    expect(escapeSaltText('see http://x', later)).toBe('see http:<U+002F><U+002F>x');
  });

  it('keeps a command word in a row\'s first cell with a leading zero-width space', () => {
    for (const t of ['Title', 'Header 1', 'Legend', 'caption x', 'skinparam x', 'scale 2', 'footer', 'MAINFRAME y', 'title: x', 'center header x'])
      expect(escapeSaltText(t, first), t).toBe(ZWS + t);
    for (const t of ['Title', 'Header 1', 'Legend']) expect(escapeSaltText(t, later), t).toBe(t);
    expect(escapeSaltText('Titles', first)).toBe('Titles');
    expect(escapeSaltText('Title {x}', first)).toBe(`${ZWS}Title <U+007B>x<U+007D>`);
  });

  it('writes the < of a typed <U+ as <U+003C>', () => {
    expect(escapeSaltText('<U+0041>', later)).toBe('<U+003C>U+0041>');
    expect(escapeSaltText('<u+0041>', later)).toBe('<U+003C>u+0041>');
    expect(escapeSaltText('a < b', later)).toBe('a < b');
    expect(escapeSaltText('<&home>', later)).toBe('<&home>');
  });

  it("escapes line-level forms: ', ! and @ leading a row's first cell, and /' anywhere", () => {
    expect(escapeSaltText("'quoted", first)).toBe('<U+0027>quoted');
    expect(escapeSaltText('!define x', first)).toBe('<U+0021>define x');
    expect(escapeSaltText('@startsalt', first)).toBe('<U+0040>startsalt');
    for (const t of ["'quoted", '!define x', '@enduml']) expect(escapeSaltText(t, later), t).toBe(t);
    expect(escapeSaltText("/' c '/", later)).toBe("<U+002F>' c '/");
    expect(escapeSaltText('a/b', later)).toBe('a/b');
  });

  it('protects text that itself starts with a zero-width space', () => {
    expect(escapeSaltText(`${ZWS}x`, later)).toBe(`${ZWS}${ZWS}x`);
    expect(escapeSaltText(`${ZWS}x`, first)).toBe(`${ZWS}${ZWS}x`);
  });

  it('only ever writes the escape forms the spike confirmed', () => {
    const texts = ['{', '}', '|', '[x', '(a', '^a', '"q', '*a', '==a', '.', '...', '**b**', '//i//', '__u__', '""m""', '--s--', '~~w~~', 'Title', 'Header 1', 'Legend'];
    for (const t of texts)
      for (const ctx of [first, later]) {
        const out = escapeSaltText(t, ctx).replace(/<U\+[0-9A-F]{4}>/g, '');
        // What is left is either nothing escaped at all, or the text's ordinary characters plus a leading U+200B.
        expect(out.replace(ZWS, '').split('').every((c) => /[A-Za-z0-9 ]/.test(c)), `${t} → ${escapeSaltText(t, ctx)}`).toBe(true);
      }
  });
});

describe('unescapeSaltText', () => {
  it('decodes <U+hhhh> and drops one leading zero-width space', () => {
    expect(unescapeSaltText('<U+007B>a<U+007D>')).toBe('{a}');
    expect(unescapeSaltText('<U+1F600>')).toBe('😀');
    expect(unescapeSaltText(`${ZWS}Title`)).toBe('Title');
    expect(unescapeSaltText(`${ZWS}${ZWS}x`)).toBe(`${ZWS}x`);
    expect(unescapeSaltText('plain')).toBe('plain');
    expect(unescapeSaltText('<U+D800>')).toBe('<U+D800>');
    expect(unescapeSaltText('<U+zz>')).toBe('<U+zz>');
  });

  it('round-trips every FR-003/AC6 text in both positions (VO-055 unit)', () => {
    const corpus = ['{', '}', '|', '[x', '(a', '^a', '"q', '*a', '*', '==a', '.', '...', '..', '==', '~~', '--', '**b**', '//i//', '__u__', '""m""', '--s--', '~~w~~', 'a.b', '5 * 3', 'Title', 'Header 1', 'Legend', 'caption x', 'skinparam x', 'scale 2', '<U+0041>', '<<U+003C>>', `${ZWS}Title`, '***', '-- x --', 'a||b', '{T', '[X] Label', '(X) Label', '^Value^', '"value   "', '  *indented'];
    for (const t of corpus)
      for (const ctx of [first, later]) expect(unescapeSaltText(escapeSaltText(t, ctx)), JSON.stringify(t)).toBe(t);
  });

  it('round-trips random text built from syntax characters', () => {
    const alphabet = ['{', '}', '|', '[', ']', '(', ')', '^', '"', '*', '=', '.', '/', '_', '-', '~', '<', '>', 'U', 'u', '+', '0', '7', 'B', ' ', 'a', ZWS, 'é', '😀'];
    let seed = 12345;
    const rand = (n: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed % n; };
    for (let i = 0; i < 5000; i++) {
      let t = '';
      const len = rand(12);
      for (let j = 0; j < len; j++) t += alphabet[rand(alphabet.length)];
      for (const ctx of [first, later]) expect(unescapeSaltText(escapeSaltText(t, ctx)), JSON.stringify(t)).toBe(t);
    }
  });
});

describe('isFormattedSaltText', () => {
  it('is false for the editor\'s own escaped form', () => {
    for (const t of ['plain', '{a}', '**b**', 'Title', '.'])
      for (const ctx of [first, later]) expect(isFormattedSaltText(escapeSaltText(t, ctx), ctx), t).toBe(false);
  });

  it('detects imported formatted text (section 3.4, EC-06)', () => {
    expect(isFormattedSaltText('**bold**', later)).toBe(true);
    expect(isFormattedSaltText('//italic// text', later)).toBe(true);
    expect(isFormattedSaltText('~~wave~~', later)).toBe(true);
    expect(isFormattedSaltText('<U+002A>a', later)).toBe(false);
    // An escape the editor would not have written, such as an escaped ordinary letter.
    expect(isFormattedSaltText('<U+0041>bc', later)).toBe(true);
  });
});
