// The source edit controller (T121; data-model §6.4 and §7.2, spec section 4.2, FR-004/AC8–AC10, FR-011/AC14,
// OD-4, FR-020/AC6). `SourceView` calls `begin` on the first keystroke, `change` with the whole block text after
// every change, and `end` when focus leaves or Esc is pressed.
//
// - The first keystroke locks this block's canvas (`store.beginSourceEdit`); other blocks stay editable.
// - A 300 ms pause applies the typed text (`store.replaceBlockText`: one `sourceTyping` entry per run between
//   pauses), so the block is re-parsed, autosaved, the canvas updates read-only and the selection keeps its path
//   or its nearest surviving container. The cursor is mapped to a selection when the block editor can say which
//   element is at an offset (an optional `pathAt(model, offset)` on its `BlockEditor`).
// - Block boundaries are fixed during the edit: text that no longer forms exactly this one block is held, not
//   applied, until leaving. So is a renamed name line of a screen that steps link to, so the rename and the link
//   updates land in one undo step on leaving.
// - Leaving applies held text once, as one undoable step: re-division (with a report; a warning with cancel first
//   when a linked screen would be removed; refused when the project's last block would go) and the source-rename
//   rules (an allowed, unique name updates the links with "Updated n steps"; any other name keeps the links,
//   which break, with a notice offering "Undo"). Leaving never changes the typed text.

import { EditorView } from '@codemirror/view';
import type { BlockKind, Path, TextEdit } from '../../core/types.ts';
import { split } from '../../core/blocks/split.ts';
import { redivide, type Redivision } from '../../core/blocks/redivide.ts';
import { linksTo, retargetEdits } from '../../core/project/links.ts';
import { nameStatus } from '../../core/names/names.ts';
import type { BlockView } from '../../core/project/project.ts';
import type { ScreenFlow } from '../../core/activity/model.ts';
import type { Store } from '../app/store.ts';
import { slots as appSlots, type Slots, type SourceEditController } from '../app/slots.ts';
import { notices as appNotices, type NoticeInput, type NoticesStore } from '../notices/Notices.tsx';
import { blockLabel } from '../project-panel/ProjectPanel.tsx';

/** What the re-division warning shows (FR-004/AC10). */
export interface RedivideWarning {
  readonly block: string;
  /** The linked screens that would be removed. */
  readonly screens: readonly string[];
  /** How many steps link to them. */
  readonly count: number;
}

export interface SourceEditOptions {
  readonly store: Store;
  /** Asks whether to re-divide although linked screens would be removed; `false` cancels. */
  readonly confirm: (warning: RedivideWarning) => Promise<boolean>;
  readonly slots?: Slots;
  readonly notices?: NoticesStore;
  /** A pause: this long without a keystroke (FR-004/AC9). */
  readonly pauseMs?: number;
  /** The cursor's block-relative offset in the block's source view, or `null`. */
  readonly cursorOf?: (blockKey: string) => number | null;
  /** Moves focus back into the block's source view (after cancelling or a refusal). */
  readonly focusSource?: (blockKey: string) => void;
}

export interface SourceEdit extends SourceEditController {
  /** Resolves when leaving has finished, including any warning. */
  end(blockKey: string): Promise<void>;
  /** The block being edited, or `null`. */
  readonly active: () => string | null;
  dispose(): void;
}

export const PAUSE_MS = 300;

interface Session {
  readonly key: string;
  readonly label: string;
  readonly kind: BlockKind;
  readonly nameAtStart: string | null;
  /** Typed text not yet looked at (waiting for the pause). */
  latest: string | null;
  /** Typed text that cannot be applied while typing, and the stored text it replaces. */
  held: { readonly text: string; readonly base: string } | null;
}

interface RenameOutcome {
  readonly edits: TextEdit[];
  readonly notice: NoticeInput | null;
}

/** An optional extension a block editor may offer for cursor-to-selection mapping. */
type PathAt = (model: unknown, offset: number) => Path | null;

/** The CodeMirror editor of the block's source view on the page, if it is shown. */
function editorView(blockKey: string): EditorView | null {
  if (typeof document === 'undefined') return null;
  const host = [...document.querySelectorAll<HTMLElement>('.source-view')].find((el) => el.dataset['block'] === blockKey);
  const dom = host?.querySelector<HTMLElement>('.cm-editor');
  return dom ? EditorView.findFromDOM(dom) : null;
}

const defaultCursorOf = (blockKey: string): number | null => editorView(blockKey)?.state.selection.main.head ?? null;
const defaultFocusSource = (blockKey: string): void => editorView(blockKey)?.focus();

/** The name on the typed text's first start line, or `null`. */
function nameOf(text: string): string | null {
  const first = split(text).find((s) => s.type === 'block');
  return first && first.type === 'block' ? first.name : null;
}

export function createSourceEdit(options: SourceEditOptions): SourceEdit {
  const { store, confirm } = options;
  const registry = options.slots ?? appSlots;
  const notices = options.notices ?? appNotices;
  const pauseMs = options.pauseMs ?? PAUSE_MS;
  const cursorOf = options.cursorOf ?? defaultCursorOf;
  const focusSource = options.focusSource ?? defaultFocusSource;

  let edit: Session | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  /** True while leaving applies or asks, so the store changes it makes are not mistaken for navigation. */
  let busy = false;

  const viewOf = (key: string): BlockView | null => store.getSnapshot().blocks.find((b) => b.key === key) ?? null;
  const flowView = (): BlockView | null => store.getSnapshot().blocks.find((b) => b.kind === 'flow') ?? null;
  const flowModel = (): ScreenFlow | null => flowView()?.classification.activity?.model ?? null;
  const linkCount = (name: string | null): number => {
    const model = flowModel();
    return name === null || !model ? 0 : linksTo(model, name).length;
  };

  const clearTimer = (): void => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  /** Held text: it changes the block boundaries, or renames a screen that steps link to. */
  function mustHold(s: Session, view: BlockView, text: string): boolean {
    const state = store.getState();
    if (!state) return false;
    if (redivide(state.source, view.start, view.end, text, state.flowIndex) !== null) return true;
    return s.kind === 'screen' && s.nameAtStart !== null && nameOf(text) !== s.nameAtStart && linkCount(s.nameAtStart) > 0;
  }

  /** Looks at the latest typed text: applies it, or holds it. */
  function settle(s: Session): void {
    const text = s.latest;
    if (text === null) return;
    s.latest = null;
    const view = viewOf(s.key);
    const state = store.getState();
    if (!view || !state) return;
    const stored = state.source.slice(view.start, view.end);
    if (mustHold(s, view, text)) {
      s.held = { text, base: stored };
      return;
    }
    s.held = null;
    if (text !== stored) store.replaceBlockText(s.key, text);
  }

  /** Maps the source cursor to the element at it, when the block's editor can tell. */
  function selectAtCursor(key: string): void {
    if (store.getSnapshot().openBlockKey !== key) return;
    const view = viewOf(key);
    if (!view || view.kind === 'other') return;
    const editor = registry.blockEditors.get(view.kind) as { pathAt?: PathAt } | null;
    const model = view.classification.salt?.model ?? view.classification.activity?.model ?? null;
    if (!editor || typeof editor.pathAt !== 'function' || !model) return;
    const offset = cursorOf(key);
    if (offset === null) return;
    const path = editor.pathAt(model, offset);
    if (path) store.select(path);
  }

  function pause(): void {
    timer = null;
    if (!edit) return;
    settle(edit);
    if (!edit.held) selectAtCursor(edit.key);
  }

  function finish(): void {
    edit = null;
    store.endSourceEdit();
  }

  /** Rename edits and the notice for a screen whose name changed from `previous` to `name` (FR-011/AC14, OD-4). */
  function renameOutcome(previous: string | null, name: string | null, others: readonly (string | null)[]): RenameOutcome {
    const model = flowModel();
    const flow = flowView();
    const count = linkCount(previous);
    if (previous === null || name === previous || count === 0 || !model || !flow) return { edits: [], notice: null };
    const status = nameStatus(name, others);
    if (status === 'valid' && name !== null) {
      return {
        edits: retargetEdits(model, flow.start, previous, name),
        notice: { kind: 'sourceRename', messageKey: 'source.rename.updated', params: { count } },
      };
    }
    return {
      edits: [],
      notice: {
        kind: 'sourceRename',
        messageKey: `source.rename.broken.${status}`,
        params: { count, name: name ?? '', previous },
        actions: [{ labelKey: 'notice.undo', run: () => store.undo() }],
      },
    };
  }

  /** Applies held text that keeps the boundaries: a renamed linked screen, in one entry with its link updates. */
  function applyRename(s: Session, view: BlockView, text: string): void {
    const others = store.getSnapshot().blocks.filter((b) => b.key !== s.key && b.kind !== 'other').map((b) => b.name);
    const name = nameOf(text);
    const outcome = renameOutcome(s.nameAtStart, name, others);
    store.seal();
    store.applyEdits([{ start: view.start, end: view.end, text }, ...outcome.edits], {
      nameKey: 'history.sourceRename',
      params: { block: name ?? s.label },
      blockKey: s.key,
    });
    if (outcome.notice) notices.show(outcome.notice);
  }

  /** Applies a re-division as one entry, with the report and any rename of the block that keeps the identity. */
  function applyRedivision(s: Session, r: Redivision): void {
    const state = store.getState()!;
    const next = state.source.slice(0, r.edits[0]!.start) + r.edits[0]!.text + state.source.slice(r.edits[0]!.end);
    const after = split(next).filter((x) => x.type === 'block');
    let rename: RenameOutcome = { edits: [], notice: null };
    const keeper = r.keeperIndex === null ? null : after[r.keeperIndex];
    if (s.kind === 'screen' && keeper && keeper.type === 'block' && keeper.opener.toLowerCase() === 'startsalt') {
      const others = after
        .filter((b, i) => i !== r.keeperIndex && b.type === 'block' && (b.opener.toLowerCase() === 'startsalt' || i === r.flowIndex))
        .map((b) => (b.type === 'block' ? b.name : null));
      rename = renameOutcome(s.nameAtStart, keeper.name, others);
    }
    store.seal();
    store.applyEdits([...r.edits, ...rename.edits], {
      nameKey: 'history.redivide',
      params: { block: s.label },
      blockKey: s.key,
      order: r.order,
    });
    notices.show({
      kind: 'redivision',
      messageKey: r.blockCount === 0 ? 'source.redividedNone' : 'source.redivided',
      params: { block: s.label, count: r.blockCount },
    });
    if (rename.notice) notices.show(rename.notice);
  }

  /** Leaves held text in the source view, the canvas still locked, with focus back in the source. */
  function keepHeld(s: Session, messageKey: string): void {
    notices.show({ kind: 'redivision', messageKey, params: { block: s.label }, key: `held-${s.key}` });
    focusSource(s.key);
  }

  /**
   * Applies held text on leaving. With `ask`, a linked screen's removal is confirmed first and cancelling keeps
   * the text held; without it (the user chose "Re-divide anyway"), it is applied.
   */
  async function leaveHeld(s: Session, ask: boolean): Promise<'applied' | 'kept'> {
    const held = s.held!;
    let view = viewOf(s.key);
    let state = store.getState();
    if (!view || !state) return 'kept';
    let r = redivide(state.source, view.start, view.end, held.text, state.flowIndex);
    if (r === null) {
      applyRename(s, view, held.text);
      return 'applied';
    }
    if (r.removesLastBlock) {
      keepHeld(s, 'source.lastBlockRefused');
      return 'kept';
    }
    if (ask && r.removedLinkedScreens.length > 0) {
      const count = r.removedLinkedScreens.reduce((n, name) => n + linkCount(name), 0);
      const ok = await confirm({ block: s.label, screens: r.removedLinkedScreens, count });
      if (!ok) {
        keepHeld(s, 'source.redivideCancelled');
        return 'kept';
      }
      // Nothing else can change while the warning is open, but read the state again to be sure.
      view = viewOf(s.key);
      state = store.getState();
      if (!view || !state) return 'kept';
      r = redivide(state.source, view.start, view.end, held.text, state.flowIndex);
      if (r === null) {
        applyRename(s, view, held.text);
        return 'applied';
      }
    }
    applyRedivision(s, r);
    return 'applied';
  }

  /** The block left the workspace while its text was held: say so, and offer to apply it after all. */
  function abandon(s: Session): void {
    const held = s.held;
    clearTimer();
    edit = null;
    store.endSourceEdit();
    if (!held) return;
    notices.show({
      kind: 'sourceNotApplied',
      messageKey: 'source.notApplied',
      params: { block: s.label },
      actions: [
        {
          labelKey: 'source.applyAnyway',
          run: () => {
            const view = viewOf(s.key);
            const state = store.getState();
            if (!view || !state || state.source.slice(view.start, view.end) !== held.base) return;
            const again: Session = { ...s, held, latest: null };
            busy = true;
            void leaveHeld(again, false).finally(() => {
              busy = false;
            });
          },
        },
      ],
    });
  }

  const unsubscribe = store.subscribe(() => {
    if (busy || !edit) return;
    const session = store.getSnapshot();
    if (!session.blocks.some((b) => b.key === edit!.key)) {
      // The block is gone (undo, another tab): nothing left to edit.
      const s = edit;
      clearTimer();
      edit = null;
      if (s.held) abandon(s);
      return;
    }
    if (edit.held && session.openBlockKey !== edit.key) abandon(edit);
  });

  function begin(key: string): void {
    if (edit && edit.key === key) {
      store.beginSourceEdit(key);
      return;
    }
    if (edit) {
      const other = edit;
      settle(other);
      if (other.held) abandon(other);
      else finish();
    }
    const view = viewOf(key);
    if (!view) return;
    edit = { key, label: blockLabel(view), kind: view.kind, nameAtStart: view.name, latest: null, held: null };
    store.beginSourceEdit(key);
  }

  return {
    begin,
    change(key, text) {
      if (!edit || edit.key !== key) begin(key);
      if (!edit) return;
      // A keystroke after a pause starts a new typing run: a new undo step even if leaving follows at once.
      if (timer === null && edit.latest === null) store.seal();
      edit.latest = text;
      clearTimer();
      timer = setTimeout(pause, pauseMs);
    },
    async end(key) {
      if (!edit || edit.key !== key) return;
      const s = edit;
      clearTimer();
      settle(s);
      if (!s.held) {
        selectAtCursor(s.key);
        finish();
        return;
      }
      busy = true;
      try {
        const outcome = await leaveHeld(s, true);
        if (outcome === 'applied' && edit === s) finish();
      } finally {
        busy = false;
      }
    },
    active: () => edit?.key ?? null,
    dispose() {
      clearTimer();
      unsubscribe();
      edit = null;
    },
  };
}
