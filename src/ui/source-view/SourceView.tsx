// The source view (R-6, spec section 4.2, FR-009/AC15): a CodeMirror 6 editor showing one block's text.
//
// - Read-only unless a `sourceEdit` controller is registered in the slots (US4 registers one). Read-only text can
//   still be focused, navigated and copied.
// - Typing calls the controller: `begin` on the first change, `change` with the whole text after every change,
//   and `end` when focus leaves or Esc is pressed. The controller decides when typing pauses (300 ms).
// - Esc ends the source edit and calls `onEscape`, which moves focus to the canvas selection. Tab is never bound,
//   so the view never traps focus.
// - `focusLine(n)` serves "Fix in source": focus, cursor at the start of line n, line scrolled into view.
// - `highlight` marks the selected element's source.
// - A new `text` from outside (a visual edit) is applied as a minimal change that keeps the cursor and the scroll
//   position, and the changed lines are highlighted for `FLASH_MS`.

import { useEffect, useImperativeHandle, useLayoutEffect, useRef, type Ref } from 'react';
import { syntaxHighlighting } from '@codemirror/language';
import { Annotation, Compartment, EditorState, StateEffect, StateField, type Extension } from '@codemirror/state';
import { Decoration, EditorView, keymap, lineNumbers, type DecorationSet } from '@codemirror/view';
import { classHighlighter } from '@lezer/highlight';
import type { TextRange } from '../../core/types.ts';
import { slots as appSlots, useSlot, type Slots } from '../app/slots.ts';
import { t } from '../messages/en.ts';
import { languageFor, type SourceLanguageKind } from './highlight.ts';
import { firstLineEnding } from '../../core/project/house-style.ts';

/** How long changed lines stay highlighted after a visual edit. */
export const FLASH_MS = 1500;

export interface SourceViewHandle {
  /** Focus the editor with the cursor at the start of `line` (1-based, clamped). */
  focusLine(line: number): void;
  focus(): void;
}

export interface SourceViewProps {
  readonly blockKey: string;
  /** The block's whole text. */
  readonly text: string;
  readonly language: SourceLanguageKind;
  /** Block-relative range of the selected element, highlighted in the source. */
  readonly highlight?: TextRange | null;
  /** Esc: move focus to the canvas selection (or the canvas status message). */
  readonly onEscape?: () => void;
  /** The cursor moved in the source (block-relative offset), for selection mapping. */
  readonly onCursor?: (offset: number) => void;
  /** The slot registry; defaults to the application's. */
  readonly slots?: Slots;
  readonly ref?: Ref<SourceViewHandle>;
}

/** Marks transactions that apply text from outside, which are not typing. */
const external = Annotation.define<boolean>();

const setHighlight = StateEffect.define<TextRange | null>();
const highlightField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    let next = value.map(tr.changes);
    for (const e of tr.effects) {
      if (!e.is(setHighlight)) continue;
      const r = e.value;
      const len = tr.state.doc.length;
      const from = r ? Math.min(Math.max(r.start, 0), len) : 0;
      const to = r ? Math.min(Math.max(r.end, from), len) : 0;
      next = r && to > from ? Decoration.set([Decoration.mark({ class: 'cm-source-selected' }).range(from, to)]) : Decoration.none;
    }
    return next;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const setFlash = StateEffect.define<{ from: number; to: number } | null>();
const flashField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    let next = value.map(tr.changes);
    for (const e of tr.effects) {
      if (!e.is(setFlash)) continue;
      if (!e.value) {
        next = Decoration.none;
        continue;
      }
      const doc = tr.state.doc;
      const first = doc.lineAt(e.value.from).number;
      const last = doc.lineAt(e.value.to).number;
      const lines = [];
      for (let n = first; n <= last; n++) lines.push(Decoration.line({ class: 'cm-source-changed' }).range(doc.line(n).from));
      next = Decoration.set(lines);
    }
    return next;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const baseTheme = EditorView.baseTheme({
  '.cm-source-selected': { backgroundColor: 'var(--source-selected, rgba(255, 213, 79, 0.45))' },
  '.cm-source-changed': { backgroundColor: 'var(--source-changed, rgba(129, 199, 132, 0.35))' },
  '.tok-comment': { color: 'var(--source-comment, #5c6370)', fontStyle: 'italic' },
  '.tok-keyword': { color: 'var(--source-keyword, #7b30a8)' },
  '.tok-string': { color: 'var(--source-string, #1f6f2b)' },
  '.tok-atom': { color: 'var(--source-atom, #a14600)' },
  '.tok-meta': { color: 'var(--source-meta, #8a5a00)' },
  '.tok-link': { color: 'var(--source-link, #0b57d0)', textDecoration: 'underline' },
  '.tok-labelName': { color: 'var(--source-label, #0b57d0)' },
  '.tok-operator, .tok-punctuation': { color: 'var(--source-operator, #444)' },
});

function readOnlyExtension(readOnly: boolean): Extension {
  return [EditorState.readOnly.of(readOnly), EditorView.contentAttributes.of({ 'aria-readonly': String(readOnly) })];
}

function languageExtension(kind: SourceLanguageKind): Extension {
  return languageFor(kind) ?? [];
}

/**
 * CodeMirror joins lines with the block's own line ending, so typing never changes it (FR-020), but counts each
 * line break as one position. Block-relative string offsets are converted for CRLF text; other endings map 1:1.
 */
function separatorOf(text: string): string {
  return firstLineEnding(text) ?? '\n';
}

function toDocPos(text: string, offset: number): number {
  if (!text.includes('\r\n')) return offset;
  let crlf = 0;
  for (let i = text.indexOf('\r\n'); i !== -1 && i + 1 < offset; i = text.indexOf('\r\n', i + 2)) crlf++;
  return offset - crlf;
}

/** The smallest single replacement turning `a` into `b`. */
function diff(a: string, b: string): { from: number; to: number; insert: string } {
  let start = 0;
  const max = Math.min(a.length, b.length);
  while (start < max && a.charCodeAt(start) === b.charCodeAt(start)) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a.charCodeAt(endA - 1) === b.charCodeAt(endB - 1)) {
    endA--;
    endB--;
  }
  return { from: start, to: endA, insert: b.slice(start, endB) };
}

export function SourceView(props: SourceViewProps) {
  const { blockKey, text, language, highlight = null, slots = appSlots, ref } = props;
  const controller = useSlot(slots.sourceEdit);

  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const compartments = useRef({ readOnly: new Compartment(), language: new Compartment() });
  const latest = useRef({ props, controller, blockKey });
  useLayoutEffect(() => {
    latest.current = { props, controller, blockKey };
  });
  const editing = useRef(false);
  const shownKey = useRef(blockKey);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const endEdit = (): void => {
    if (!editing.current) return;
    editing.current = false;
    latest.current.controller?.end(latest.current.blockKey);
  };

  /** A fresh editor state for `doc`, with the current read-only and language settings and `doc`'s line ending.
   *  Held in a ref: it reads only refs, so the first render's function serves every later one. */
  const stateFor = useRef((doc: string): EditorState => {
    const { readOnly, language: lang } = compartments.current;
    return EditorState.create({
      doc,
      extensions: [
        EditorState.lineSeparator.of(separatorOf(doc)),
        lineNumbers(),
        lang.of(languageExtension(latest.current.props.language)),
        syntaxHighlighting(classHighlighter),
        readOnly.of(readOnlyExtension(latest.current.controller === null)),
        EditorView.contentAttributes.of({ 'aria-label': t('region.source') }),
        keymap.of([
          {
            key: 'Escape',
            run: () => {
              endEdit();
              latest.current.props.onEscape?.();
              return true;
            },
          },
        ]),
        highlightField,
        flashField,
        baseTheme,
        EditorView.updateListener.of((update) => {
          const typed = update.transactions.some((tr) => tr.docChanged && !tr.annotation(external));
          const { controller: c, blockKey: key, props: p } = latest.current;
          if (typed && c) {
            if (!editing.current) {
              editing.current = true;
              c.begin(key);
            }
            c.change(key, update.state.sliceDoc());
          }
          const moved = update.transactions.some((tr) => tr.selection && !tr.annotation(external));
          if (moved) p.onCursor?.(update.state.sliceDoc(0, update.state.selection.main.head).length);
        }),
        EditorView.domEventHandlers({
          blur: () => {
            endEdit();
            return false;
          },
        }),
      ],
    });
  });

  // Create the editor once.
  useEffect(() => {
    if (!host.current) return;
    const v = new EditorView({ parent: host.current, state: stateFor.current(latest.current.props.text) });
    view.current = v;
    return () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
      v.destroy();
      view.current = null;
    };
  }, []); // Created once; later props arrive through the effects below.

  // Read-only unless a controller is registered.
  useEffect(() => {
    view.current?.dispatch({ effects: compartments.current.readOnly.reconfigure(readOnlyExtension(controller === null)) });
  }, [controller]);

  useEffect(() => {
    view.current?.dispatch({ effects: compartments.current.language.reconfigure(languageExtension(language)) });
  }, [language]);

  // Text from outside: another block replaces the document; the same block gets a minimal change and a flash.
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const current = v.state.sliceDoc();
    const sameBlock = shownKey.current === blockKey;
    shownKey.current = blockKey;
    if (!sameBlock || separatorOf(current) !== separatorOf(text)) {
      editing.current = false;
      if (flashTimer.current) clearTimeout(flashTimer.current);
      v.setState(stateFor.current(text));
      return;
    }
    if (current === text) return;
    const change = diff(current, text);
    const from = toDocPos(current, change.from);
    v.dispatch({
      changes: { from, to: toDocPos(current, change.to), insert: change.insert },
      effects: setFlash.of({ from, to: toDocPos(text, change.from + change.insert.length) }),
      annotations: external.of(true),
    });
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => {
      flashTimer.current = null;
      view.current?.dispatch({ effects: setFlash.of(null), annotations: external.of(true) });
    }, FLASH_MS);
  }, [text, blockKey]);

  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const doc = v.state.sliceDoc();
    const range = highlight ? { start: toDocPos(doc, highlight.start), end: toDocPos(doc, highlight.end) } : null;
    v.dispatch({ effects: setHighlight.of(range), annotations: external.of(true) });
  }, [highlight?.start, highlight?.end, highlight]);

  useImperativeHandle(
    ref,
    () => ({
      focusLine(line: number) {
        const v = view.current;
        if (!v) return;
        const doc = v.state.doc;
        const target = doc.line(Math.min(Math.max(1, Math.floor(line)), doc.lines));
        v.focus();
        v.dispatch({
          selection: { anchor: target.from },
          effects: EditorView.scrollIntoView(target.from, { y: 'center' }),
          annotations: external.of(true),
        });
      },
      focus() {
        view.current?.focus();
      },
    }),
    [],
  );

  return <div ref={host} className="source-view" data-block={blockKey} />;
}

