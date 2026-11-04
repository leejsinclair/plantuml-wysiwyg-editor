import { describe, expect, it } from 'vitest';
import { escapeStepLabel, unescapeStepLabel } from '../../../src/core/activity/escape.ts';

describe('escapeStepLabel', () => {
  it('writes ordinary text unchanged, plain or linked', () => {
    for (const t of ['Sign in', 'a.b', '5 * 3', 'Enter credentials', 'Wähle ein Konto', '']) {
      expect(escapeStepLabel(t, false)).toBe(t);
      expect(escapeStepLabel(t, true)).toBe(t);
    }
  });

  it('escapes [, ] and | in a linked label with <U+hhhh> (FR-013/AC5)', () => {
    expect(escapeStepLabel('Pick [x] or ]] | y', true)).toBe('Pick <U+005B>x<U+005D> or <U+005D><U+005D> <U+007C> y');
  });

  it('never uses ~, which breaks the link', () => {
    expect(escapeStepLabel('a [b] |c', true)).not.toContain('~');
  });

  it('leaves single [, ] and | alone in a plain label', () => {
    expect(escapeStepLabel('Pick [x] | y', false)).toBe('Pick [x] | y');
  });

  it('escapes [[ in a plain label so it is never read as a link', () => {
    expect(escapeStepLabel('see [[#Home x]]', false)).toBe('see <U+005B>[#Home x]]');
  });

  it('escapes creole pairs so the label stays literal', () => {
    expect(escapeStepLabel('**b** //i// __u__ ""m"" --s-- ~~w~~', false)).toBe(
      '<U+002A>*b<U+002A>* <U+002F>/i<U+002F>/ <U+005F>_u<U+005F>_ <U+0022>"m<U+0022>" <U+002D>-s<U+002D>- <U+007E>~w<U+007E>~',
    );
    expect(escapeStepLabel('**b**', true)).toBe('<U+002A>*b<U+002A>*');
  });

  it('writes the < of a typed <U+ as <U+003C>', () => {
    expect(escapeStepLabel('code <U+0041>', false)).toBe('code <U+003C>U+0041>');
    expect(escapeStepLabel('<u+1f600>', true)).toBe('<U+003C>u+1f600>');
  });

  it('round-trips every label, plain and linked', () => {
    const cases = [
      'Pick [x] or ]] | y',
      '[[#Home]]',
      '**bold** and //it//',
      '<U+005B> literal',
      '<U+003C>',
      '---- ~~~ ___',
      'a < b > c',
      'ä | ö [ü]',
      '😀 [emoji]',
      '',
    ];
    for (const t of cases) {
      for (const linked of [false, true]) {
        expect(unescapeStepLabel(escapeStepLabel(t, linked)), `${linked ? 'linked' : 'plain'}: ${t}`).toBe(t);
      }
    }
  });

  it('a linked label never contains a raw [, ] or |', () => {
    const out = escapeStepLabel('x[y]z|w ]] [[', true);
    expect(out).not.toMatch(/[[\]|]/);
  });
});

describe('unescapeStepLabel', () => {
  it('decodes <U+hhhh> sequences of 4 to 6 hex digits', () => {
    expect(unescapeStepLabel('<U+005B>x<U+005D>')).toBe('[x]');
    expect(unescapeStepLabel('<U+1F600>')).toBe('😀');
  });

  it('leaves text that is not an escape unchanged', () => {
    expect(unescapeStepLabel('a < b <U+12> <U+ZZZZ>')).toBe('a < b <U+12> <U+ZZZZ>');
  });
});
