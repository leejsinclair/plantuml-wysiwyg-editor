import { describe, expect, it } from 'vitest';
import {
  MAX_NAME_LENGTH,
  commitName,
  fold,
  generate,
  isAllowed,
  nameStatus,
  normalise,
} from '../../../src/core/names/names.ts';

const codePoints = (s: string): number => [...s].length;

describe('normalise (typed name conversion on commit, section 3.6)', () => {
  it('turns spaces into hyphens', () => {
    expect(normalise('Sign in')).toBe('Sign-in');
    expect(normalise('Enter credentials')).toBe('Enter-credentials');
  });

  it('removes disallowed characters', () => {
    expect(normalise('Log!in?')).toBe('Login');
    expect(normalise('a.b/c:d')).toBe('abcd');
    expect(normalise('Under_score-ok')).toBe('Under_score-ok');
  });

  it('removes leading non-letters', () => {
    expect(normalise('123 Start')).toBe('Start');
    expect(normalise('-_9abc')).toBe('abc');
    expect(normalise('́x')).toBe('x');
  });

  it('reduces runs of hyphens and trims leading and trailing hyphens', () => {
    expect(normalise('a   b')).toBe('a-b');
    expect(normalise('a - b')).toBe('a-b');
    expect(normalise('a--b')).toBe('a-b');
    expect(normalise('abc -')).toBe('abc');
  });

  it('returns an empty string when nothing remains', () => {
    expect(normalise('')).toBe('');
    expect(normalise('   ')).toBe('');
    expect(normalise('123 456')).toBe('');
    expect(normalise('!!!')).toBe('');
  });

  it('keeps non-English letters, marks and digits', () => {
    expect(normalise('Écran de connexion')).toBe('Écran-de-connexion');
    expect(normalise('Anmeldung für Kunden 2')).toBe('Anmeldung-für-Kunden-2');
    expect(normalise('登录 页面')).toBe('登录-页面');
    expect(normalise('Вход')).toBe('Вход');
    expect(normalise('शुरू करें')).toBe('शुरू-करें');
  });

  it('writes NFC', () => {
    const decomposed = 'Café';
    expect(normalise(decomposed)).toBe('Café');
    expect(normalise(decomposed)).toBe(normalise(decomposed).normalize('NFC'));
  });

  it('cuts to 64 characters without splitting a letter from its marks', () => {
    expect(normalise('a'.repeat(100))).toBe('a'.repeat(64));
    // 63 plain letters, then a letter with two combining marks that has no precomposed NFC form.
    const cluster = 'q̣̇';
    const cut = normalise('a'.repeat(63) + cluster + 'zzz');
    expect(cut).toBe('a'.repeat(63));
    expect(codePoints(cut)).toBeLessThanOrEqual(MAX_NAME_LENGTH);
  });

  it('does not end a cut name on a hyphen', () => {
    const cut = normalise('a'.repeat(63) + ' bcd');
    expect(cut).toBe('a'.repeat(63));
  });
});

describe('fold', () => {
  it('folds case independent of locale', () => {
    expect(fold('Login')).toBe(fold('LOGIN'));
    expect(fold('straße')).toBe(fold('STRASSE'));
    expect(fold('ẞ')).toBe(fold('ß'));
    expect(fold('İstanbul')).toBe(fold('İSTANBUL'));
  });

  it('applies NFC before comparing', () => {
    expect(fold('Café')).toBe(fold('Café'));
    expect(fold('CAFÉ')).toBe(fold('café'));
  });

  it('keeps different names different', () => {
    expect(fold('Login')).not.toBe(fold('Logout'));
  });
});

describe('isAllowed', () => {
  it('accepts letters, marks, digits, hyphen and underscore starting with a letter', () => {
    for (const ok of ['Login', 'Sign-in', 'a_b-2', 'Écran', '登录', 'Вход-2', 'शुरू', 'x']) {
      expect(isAllowed(ok), ok).toBe(true);
    }
  });

  it('refuses names that are empty, too long, start with a non-letter or contain other characters', () => {
    for (const bad of ['', '1abc', '-abc', '_abc', 'Sign in', 'a.b', 'a/b', 'a!', '́a', 'a'.repeat(65)]) {
      expect(isAllowed(bad), bad).toBe(false);
    }
    expect(isAllowed('a'.repeat(64))).toBe(true);
  });
});

describe('nameStatus', () => {
  it('reports unnamed', () => {
    expect(nameStatus(null, [])).toBe('unnamed');
    expect(nameStatus('', ['A'])).toBe('unnamed');
  });

  it('reports valid', () => {
    expect(nameStatus('Login', ['Home', null])).toBe('valid');
  });

  it('reports not allowed', () => {
    expect(nameStatus('1-login', [])).toBe('notAllowed');
    expect(nameStatus('log.in', [])).toBe('notAllowed');
  });

  it('reports not normalised', () => {
    expect(nameStatus('Café', [])).toBe('notNormalised');
  });

  it('reports duplicates after NFC and case folding', () => {
    expect(nameStatus('Login', ['LOGIN'])).toBe('duplicate');
    expect(nameStatus('Café', ['CAFÉ'])).toBe('duplicate');
    expect(nameStatus('Login', ['Logout'])).toBe('valid');
  });
});

describe('commitName (VO-113: typed names)', () => {
  it('converts the typed text on commit', () => {
    expect(commitName('Sign in', ['Home'])).toEqual({ ok: true, name: 'Sign-in' });
  });

  it('refuses an empty result', () => {
    expect(commitName('  123 ', ['Home'])).toEqual({ ok: false, reason: 'empty' });
  });

  it('refuses a duplicate and names the other block', () => {
    expect(commitName('home', ['Login', 'Home'])).toEqual({ ok: false, reason: 'duplicate', conflictsWith: 'Home' });
    expect(commitName('sign IN', ['Sign-in'])).toEqual({ ok: false, reason: 'duplicate', conflictsWith: 'Sign-in' });
  });

  it('ignores unnamed blocks', () => {
    expect(commitName('Home', [null, ''])).toEqual({ ok: true, name: 'Home' });
  });
});

describe('generate (VO-113: generated names are never refused)', () => {
  it('names a new screen Screen-n with the lowest unused n', () => {
    expect(generate('screen', new Set())).toBe('Screen-1');
    expect(generate('screen', new Set(['Screen-1', 'Screen-3']))).toBe('Screen-2');
    expect(generate('screen', new Set(['screen-1', 'SCREEN-2']))).toBe('Screen-3');
  });

  it('names the flow Screen-flow, with a suffix on collision', () => {
    expect(generate('flow', new Set())).toBe('Screen-flow');
    expect(generate('flow', new Set(['screen-flow']))).toBe('Screen-flow-2');
    expect(generate('flow', new Set(['Screen-flow', 'Screen-flow-2']))).toBe('Screen-flow-3');
  });

  it('names a screen from a step label', () => {
    expect(generate({ fromLabel: 'Enter credentials' }, new Set())).toBe('Enter-credentials');
    expect(generate({ fromLabel: 'Enter credentials' }, new Set(['Enter-credentials']))).toBe('Enter-credentials-2');
    expect(generate({ fromLabel: '42' }, new Set(['Screen-1']))).toBe('Screen-2');
    expect(generate({ fromLabel: '' }, new Set())).toBe('Screen-1');
  });

  it('names a duplicate Copy-of-<name>', () => {
    expect(generate({ copyOf: 'Login' }, new Set(['Login']))).toBe('Copy-of-Login');
    expect(generate({ copyOf: 'Login' }, new Set(['Login', 'Copy-of-Login']))).toBe('Copy-of-Login-2');
    expect(generate({ copyOf: 'Login' }, new Set(['Login', 'Copy-of-Login', 'copy-of-login-2']))).toBe('Copy-of-Login-3');
    expect(generate({ copyOf: null }, new Set(['Screen-1']))).toBe('Screen-2');
  });

  it('keeps generated names allowed even when the original is not', () => {
    const name = generate({ copyOf: 'log.in' }, new Set());
    expect(name).toBe('Copy-of-login');
    expect(isAllowed(name)).toBe(true);
  });

  it('keeps every result, suffix included, at most 64 characters', () => {
    const long = 'L'.repeat(64);
    const copy = generate({ copyOf: long }, new Set([long]));
    expect(codePoints(copy)).toBe(64);
    expect(copy.startsWith('Copy-of-L')).toBe(true);

    const taken = new Set([copy]);
    const second = generate({ copyOf: long }, taken);
    expect(codePoints(second)).toBeLessThanOrEqual(64);
    expect(second.endsWith('-2')).toBe(true);
    expect(fold(second)).not.toBe(fold(copy));

    const fromLabel = generate({ fromLabel: 'x'.repeat(80) }, new Set(['x'.repeat(64)]));
    expect(fromLabel).toBe('x'.repeat(62) + '-2');
  });

  it('cuts before a suffix on grapheme clusters', () => {
    const cluster = 'q̣̇';
    const base = 'a'.repeat(61) + cluster; // 64 code points
    const name = generate({ fromLabel: base }, new Set([base]));
    expect(name).toBe('a'.repeat(61) + '-2');
  });

  it('keeps non-English letters and writes NFC', () => {
    expect(generate({ fromLabel: 'Écran d’accueil' }, new Set())).toBe('Écran-daccueil');
    const nfc = generate({ fromLabel: 'Café menu' }, new Set());
    expect(nfc).toBe('Café-menu');
    expect(nfc).toBe(nfc.normalize('NFC'));
  });

  it('never returns a name that is taken or not allowed', () => {
    const taken = new Set<string>();
    for (let i = 0; i < 20; i++) {
      for (const base of ['screen', 'flow', { fromLabel: 'Pay now' }, { copyOf: 'Pay-now' }] as const) {
        const name = generate(base, taken);
        expect(isAllowed(name), name).toBe(true);
        expect([...taken].some((t) => fold(t) === fold(name)), name).toBe(false);
        taken.add(name);
      }
    }
  });
});
