import { describe, expect, it } from 'vitest';
import {
  BINDINGS,
  PLATFORMS,
  RESERVED,
  chordId,
  chordsFor,
  formatChord,
  isReserved,
  keyCommand,
  platformFrom,
  type KeyCommand,
  type KeyEventLike,
  type Platform,
} from '../../../src/ui/keys.ts';

const ev = (key: string, mods: Partial<Omit<KeyEventLike, 'key'>> = {}): KeyEventLike => ({
  key,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...mods,
});

describe('key model', () => {
  it('maps the section 3.2 keys to their one meaning', () => {
    const cases: [KeyEventLike, KeyCommand][] = [
      [ev('Escape'), 'cancel'],
      [ev('Enter'), 'enter'],
      [ev('F2'), 'edit'],
      [ev(' '), 'toggle'],
      [ev('ArrowUp'), 'up'],
      [ev('ArrowDown'), 'down'],
      [ev('ArrowLeft'), 'left'],
      [ev('ArrowRight'), 'right'],
      [ev('ArrowUp', { altKey: true, shiftKey: true }), 'moveUp'],
      [ev('ArrowDown', { altKey: true, shiftKey: true }), 'moveDown'],
      [ev('ArrowLeft', { altKey: true, shiftKey: true }), 'moveLeft'],
      [ev('ArrowRight', { altKey: true, shiftKey: true }), 'moveRight'],
      [ev('Enter', { ctrlKey: true }), 'openScreen'],
      [ev('F6', { ctrlKey: true }), 'nextRegion'],
      [ev('F6', { ctrlKey: true, shiftKey: true }), 'previousRegion'],
      [ev('z', { ctrlKey: true }), 'undo'],
      [ev('y', { ctrlKey: true }), 'redo'],
      [ev('Z', { ctrlKey: true, shiftKey: true }), 'redo'],
    ];
    for (const [e, cmd] of cases) expect(keyCommand(e, 'windows'), JSON.stringify(e)).toBe(cmd);
  });

  it('requires exact modifiers', () => {
    expect(keyCommand(ev('ArrowUp', { altKey: true }), 'windows')).toBeNull();
    expect(keyCommand(ev('ArrowUp', { shiftKey: true }), 'windows')).toBeNull();
    expect(keyCommand(ev('z'), 'windows')).toBeNull();
    expect(keyCommand(ev('z', { ctrlKey: true, altKey: true }), 'windows')).toBeNull();
    expect(keyCommand(ev('Enter', { metaKey: true }), 'windows')).toBeNull();
    expect(keyCommand(ev('x'), 'windows')).toBeNull();
  });

  it('uses Cmd as the primary modifier on macOS, and redo is Cmd+Shift+Z only', () => {
    expect(keyCommand(ev('z', { metaKey: true }), 'mac')).toBe('undo');
    expect(keyCommand(ev('z', { metaKey: true, shiftKey: true }), 'mac')).toBe('redo');
    expect(keyCommand(ev('Enter', { metaKey: true }), 'mac')).toBe('openScreen');
    expect(keyCommand(ev('z', { ctrlKey: true }), 'mac')).toBeNull();
    // Cmd+Y opens History in Chrome on macOS.
    expect(keyCommand(ev('y', { metaKey: true }), 'mac')).toBeNull();
  });

  it('defines every binding once and tests can import them', () => {
    expect(chordsFor('redo', 'windows').map((c) => formatChord(c, 'windows'))).toEqual(['Ctrl+Y', 'Ctrl+Shift+Z']);
    expect(chordsFor('moveLeft', 'windows').map((c) => formatChord(c, 'windows'))).toEqual(['Alt+Shift+Left']);
    expect(formatChord(chordsFor('openScreen', 'mac')[0]!, 'mac')).toBe('Cmd+Enter');
    expect(formatChord(chordsFor('toggle', 'linux')[0]!, 'linux')).toBe('Space');
  });

  it('gives no two commands the same chord on any platform', () => {
    for (const p of PLATFORMS) {
      const seen = new Map<string, KeyCommand>();
      for (const cmd of Object.keys(BINDINGS) as KeyCommand[]) {
        for (const c of chordsFor(cmd, p)) {
          const id = chordId(c, p);
          expect(seen.get(id), `${p}: ${id}`).toBeUndefined();
          seen.set(id, cmd);
        }
      }
    }
  });

  describe('VO-102: no binding is reserved by Chrome, Edge or common screen readers', () => {
    for (const p of PLATFORMS) {
      it(`on ${p}`, () => {
        const reservedHere = RESERVED[p];
        expect(reservedHere.size).toBeGreaterThan(20);
        for (const cmd of Object.keys(BINDINGS) as KeyCommand[]) {
          for (const c of chordsFor(cmd, p)) {
            expect(isReserved(c, p), `${cmd} → ${formatChord(c, p)}`).toBe(false);
          }
        }
      });
    }

    it('knows the examples the spec names', () => {
      expect(isReserved({ key: 'ArrowLeft', alt: true }, 'windows')).toBe(true);
      expect(isReserved({ key: 'ArrowRight', alt: true }, 'windows')).toBe(true);
      expect(isReserved({ key: 'F6' }, 'windows')).toBe(true);
      expect(isReserved({ key: 'y', mod: true }, 'mac')).toBe(true);
      expect(isReserved({ key: 'ArrowUp', mod: true, alt: true }, 'windows')).toBe(true); // screen-reader table navigation
    });
  });

  it('detects the platform', () => {
    const cases: [string, Platform][] = [
      ['macOS', 'mac'],
      ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'mac'],
      ['Windows', 'windows'],
      ['Mozilla/5.0 (X11; Linux x86_64)', 'linux'],
      ['Linux', 'linux'],
      ['Chrome OS', 'linux'],
    ];
    for (const [s, p] of cases) expect(platformFrom(s)).toBe(p);
  });
});
