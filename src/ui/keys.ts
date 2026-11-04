// The key model (section 3.2 "Keys", contracts/ui.md §12, FR-009/AC16). Every binding is defined once
// here; components and tests import them. `mod` is the platform's primary modifier: Ctrl on Windows and
// Linux, Cmd on macOS.

export type Platform = 'windows' | 'mac' | 'linux';
export const PLATFORMS: readonly Platform[] = ['windows', 'mac', 'linux'];

export interface KeyChord {
  /** `KeyboardEvent.key`: `Escape`, `Enter`, `F2`, `' '`, `ArrowUp`, a letter, … */
  key: string;
  /** Primary modifier: Ctrl on Windows and Linux, Cmd on macOS. */
  mod?: boolean;
  /** The physical Control key. On Windows and Linux it is the same key as `mod`. */
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  /** Limits the chord to these platforms. */
  only?: readonly Platform[];
}

export type KeyCommand =
  | 'cancel'
  | 'enter'
  | 'edit'
  | 'toggle'
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'moveUp'
  | 'moveDown'
  | 'moveLeft'
  | 'moveRight'
  | 'openScreen'
  | 'nextRegion'
  | 'previousRegion'
  | 'undo'
  | 'redo';

export const BINDINGS: Readonly<Record<KeyCommand, readonly KeyChord[]>> = {
  // Cancel the innermost temporary state, otherwise select the parent; in the source view, go to the canvas.
  cancel: [{ key: 'Escape' }],
  // Into a container; on another element start inline editing; while editing, commit; in the palette, insert.
  enter: [{ key: 'Enter' }],
  // Always start inline editing.
  edit: [{ key: 'F2' }],
  // Toggle a selected checkbox or radio button.
  toggle: [{ key: ' ' }],
  // Between cells of the current grid; in the flow Up/Down along the path, Left/Right between branches.
  up: [{ key: 'ArrowUp' }],
  down: [{ key: 'ArrowDown' }],
  left: [{ key: 'ArrowLeft' }],
  right: [{ key: 'ArrowRight' }],
  // Move the selection. Alt+Left/Right alone are browser history, so Shift is added.
  moveUp: [{ key: 'ArrowUp', alt: true, shift: true }],
  moveDown: [{ key: 'ArrowDown', alt: true, shift: true }],
  moveLeft: [{ key: 'ArrowLeft', alt: true, shift: true }],
  moveRight: [{ key: 'ArrowRight', alt: true, shift: true }],
  openScreen: [{ key: 'Enter', mod: true }],
  // F6 alone cycles the browser's own panes, so the primary modifier is added.
  nextRegion: [{ key: 'F6', mod: true }],
  previousRegion: [{ key: 'F6', mod: true, shift: true }],
  undo: [{ key: 'z', mod: true }],
  // Cmd+Y opens History in Chrome on macOS, so there redo is Cmd+Shift+Z only.
  redo: [
    { key: 'y', mod: true, only: ['windows', 'linux'] },
    { key: 'z', mod: true, shift: true },
  ],
};

const KEY_NAMES: Record<string, string> = {
  ' ': 'Space',
  Spacebar: 'Space',
  Esc: 'Escape',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  '+': 'Plus',
  '=': 'Plus',
  '-': 'Minus',
  _: 'Minus',
};

function keyName(key: string): string {
  const named = KEY_NAMES[key];
  if (named) return named;
  return key.length === 1 ? key.toUpperCase() : key;
}

interface Physical {
  ctrl: boolean;
  cmd: boolean;
  alt: boolean;
  shift: boolean;
  key: string;
}

function physical(c: KeyChord, p: Platform): Physical {
  const mac = p === 'mac';
  return {
    ctrl: Boolean(c.ctrl) || (!mac && Boolean(c.mod)),
    cmd: mac && Boolean(c.mod),
    alt: Boolean(c.alt),
    shift: Boolean(c.shift),
    key: keyName(c.key),
  };
}

function idOf(k: Physical, altName = 'Alt'): string {
  const parts: string[] = [];
  if (k.ctrl) parts.push('Ctrl');
  if (k.cmd) parts.push('Cmd');
  if (k.alt) parts.push(altName);
  if (k.shift) parts.push('Shift');
  parts.push(k.key);
  return parts.join('+');
}

/** A canonical id for a chord on a platform, e.g. `Ctrl+Shift+Z` or `Cmd+Enter`. */
export function chordId(c: KeyChord, p: Platform): string {
  return idOf(physical(c, p));
}

/** The chord as shown to users: `Ctrl+Shift+Z`, `Alt+Shift+Left`, `Cmd+Enter`, `Option+Shift+Up`. */
export function formatChord(c: KeyChord, p: Platform): string {
  return idOf(physical(c, p), p === 'mac' ? 'Option' : 'Alt');
}

export function chordsFor(command: KeyCommand, p: Platform): KeyChord[] {
  return BINDINGS[command].filter((c) => !c.only || c.only.includes(p));
}

// Combinations reserved by Chrome, Edge, the operating system or common screen readers (NVDA, JAWS,
// Narrator, Orca, VoiceOver). Conservative: a chord is listed if any of them uses it.
const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
const PC_BROWSER = [
  'Ctrl+N', 'Ctrl+Shift+N', 'Ctrl+T', 'Ctrl+Shift+T', 'Ctrl+W', 'Ctrl+Shift+W', 'Ctrl+F4', 'Alt+F4',
  'Ctrl+Tab', 'Ctrl+Shift+Tab', 'Ctrl+PageUp', 'Ctrl+PageDown', 'Ctrl+Shift+PageUp', 'Ctrl+Shift+PageDown',
  ...digits.map((d) => `Ctrl+${d}`),
  'Alt+Left', 'Alt+Right', 'Alt+Home', 'Alt+F', 'Alt+E', 'Alt+D', 'Alt+Space', 'Alt+Shift+T', 'Alt+Shift+I',
  'Alt+Shift+A', 'Alt+Shift+B', 'Alt+Shift+F', 'Backspace',
  'F1', 'F3', 'Shift+F3', 'F5', 'Shift+F5', 'Ctrl+F5', 'F6', 'Shift+F6', 'F7', 'F9', 'F10', 'Shift+F10', 'F11',
  'F12', 'Shift+Escape',
  'Ctrl+R', 'Ctrl+Shift+R', 'Ctrl+L', 'Ctrl+K', 'Ctrl+E', 'Ctrl+D', 'Ctrl+Shift+D', 'Ctrl+H', 'Ctrl+J',
  'Ctrl+Shift+J', 'Ctrl+Shift+I', 'Ctrl+Shift+C', 'Ctrl+U', 'Ctrl+P', 'Ctrl+Shift+P', 'Ctrl+S', 'Ctrl+O',
  'Ctrl+F', 'Ctrl+G', 'Ctrl+Shift+G', 'Ctrl+Shift+B', 'Ctrl+Shift+O', 'Ctrl+Shift+Delete', 'Ctrl+Shift+Q',
  'Ctrl+Shift+M', 'Ctrl+Shift+A', 'Ctrl+Shift+E', 'Ctrl+Shift+K', 'Ctrl+Shift+L', 'Ctrl+Shift+S',
  'Ctrl+Shift+U', 'Ctrl+Shift+Y', 'Ctrl+Shift+X', 'Ctrl+Shift+,', 'Ctrl+Plus', 'Ctrl+Shift+Plus', 'Ctrl+Minus',
  'Ctrl+0',
];
// NVDA and JAWS table navigation and NVDA's start shortcut; the Insert and Caps Lock modifiers are not
// modelled because no binding uses them.
const PC_SCREEN_READER = [
  'Ctrl+Alt+Up', 'Ctrl+Alt+Down', 'Ctrl+Alt+Left', 'Ctrl+Alt+Right', 'Ctrl+Alt+Home', 'Ctrl+Alt+End',
  'Ctrl+Alt+N', 'Ctrl+Alt+Shift+Up', 'Ctrl+Alt+Shift+Down', 'Ctrl+Alt+Shift+Left', 'Ctrl+Alt+Shift+Right',
];
const MAC = [
  'Cmd+N', 'Cmd+Shift+N', 'Cmd+T', 'Cmd+Shift+T', 'Cmd+W', 'Cmd+Shift+W', 'Cmd+Q', 'Cmd+H', 'Cmd+Alt+H',
  'Cmd+M', 'Cmd+Alt+Left', 'Cmd+Alt+Right', 'Cmd+Shift+[', 'Cmd+Shift+]', 'Cmd+[', 'Cmd+]', 'Cmd+Left',
  'Cmd+Right', ...digits.map((d) => `Cmd+${d}`), 'Cmd+Y', 'Cmd+Shift+B', 'Cmd+Alt+B', 'Cmd+D', 'Cmd+Shift+D',
  'Cmd+L', 'Cmd+R', 'Cmd+Shift+R', 'Cmd+F', 'Cmd+G', 'Cmd+Shift+G', 'Cmd+E', 'Cmd+J', 'Cmd+Shift+J',
  'Cmd+Alt+I', 'Cmd+Alt+J', 'Cmd+Alt+U', 'Cmd+Alt+C', 'Cmd+P', 'Cmd+Alt+P', 'Cmd+S', 'Cmd+O', 'Cmd+,',
  'Cmd+Shift+Delete', 'Cmd+Shift+A', 'Cmd+Shift+M', 'Cmd+Plus', 'Cmd+Minus', 'Cmd+0', 'Ctrl+Cmd+F',
  'Cmd+Tab', 'Cmd+Shift+Tab', 'Cmd+Space', 'Cmd+`', 'Cmd+Shift+3', 'Cmd+Shift+4', 'Cmd+Shift+5',
  'Cmd+Alt+Escape', 'Cmd+F5', 'Ctrl+Tab', 'Ctrl+Shift+Tab', 'Ctrl+Up', 'Ctrl+Down', 'Ctrl+Left', 'Ctrl+Right',
  'Ctrl+F2', 'Ctrl+F3', 'Ctrl+F4', 'Ctrl+F5', 'Ctrl+F6', 'Ctrl+F7', 'Ctrl+F8', 'F6', 'Shift+F6', 'F11', 'F12',
  'Alt+Left', 'Alt+Right',
];

export const RESERVED: Readonly<Record<Platform, ReadonlySet<string>>> = {
  windows: new Set([...PC_BROWSER, ...PC_SCREEN_READER]),
  linux: new Set([...PC_BROWSER, ...PC_SCREEN_READER]),
  mac: new Set(MAC),
};

export function isReserved(c: KeyChord, p: Platform): boolean {
  const k = physical(c, p);
  // VoiceOver owns every Control+Option combination on macOS.
  if (p === 'mac' && k.ctrl && k.alt) return true;
  return RESERVED[p].has(idOf(k));
}

export interface KeyEventLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

const lookup = new Map<Platform, Map<string, KeyCommand>>();

function tableFor(p: Platform): Map<string, KeyCommand> {
  let table = lookup.get(p);
  if (!table) {
    table = new Map();
    for (const command of Object.keys(BINDINGS) as KeyCommand[]) {
      for (const c of chordsFor(command, p)) table.set(chordId(c, p), command);
    }
    lookup.set(p, table);
  }
  return table;
}

/** The command a key event means, or `null`. Modifiers must match exactly. */
export function keyCommand(e: KeyEventLike, p: Platform): KeyCommand | null {
  // The Windows or Super key is not part of any binding.
  if (e.metaKey && p !== 'mac') return null;
  const id = idOf({ ctrl: e.ctrlKey, cmd: p === 'mac' && e.metaKey, alt: e.altKey, shift: e.shiftKey, key: keyName(e.key) });
  return tableFor(p).get(id) ?? null;
}

/** Platform from `navigator.userAgentData.platform` or the user agent string. */
export function platformFrom(platformOrUserAgent: string): Platform {
  if (/mac/i.test(platformOrUserAgent)) return 'mac';
  if (/win/i.test(platformOrUserAgent)) return 'windows';
  return 'linux';
}
