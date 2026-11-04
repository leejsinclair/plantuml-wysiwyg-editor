// The always-visible toolbar (contracts/ui.md §3 and §4, FR-016/AC1, FR-007/AC9, FR-006/AC7).
//
// - "Undo" and "Redo" name the action they will undo or redo ("Undo typing in the source"); with nothing to
//   undo or redo they are disabled and say so.
// - The autosave status reads "All changes saved" once everything is written and "Saving…" otherwise. A failed
//   write keeps retrying, so it also reads "Saving…"; the failure itself is reported by the storage notice.
// - Contributions from the `toolbar` slot (Import, Download, export…) follow, in slot order.
// - Left, Right, Home and End move focus between the toolbar's controls; every control stays in the Tab order.
//
// The undo and redo shortcuts themselves are handled by the workspace; the buttons only advertise them.
import type { KeyboardEvent } from 'react';
import type { ActionName } from '../../core/history/history.ts';
import type { SaveStatus } from '../../services/storage/autosave.ts';
import { slots as defaultSlots, useSlot, type SlotContext, type Slots } from '../app/slots.ts';
import { useSession, useStore } from '../app/store.ts';
import { chordId, chordsFor, platformFrom, type KeyCommand, type Platform } from '../keys.ts';
import { t } from '../messages/en.ts';
import { ActionIcon } from '@mantine/core';
import { IconArrowBackUp, IconArrowForwardUp } from '@tabler/icons-react';

export interface ToolbarProps {
  readonly ctx: SlotContext;
  /** The registry to read contributions from; the application's by default. */
  readonly slots?: Slots;
  /** The platform whose shortcuts are advertised; detected from the browser by default. */
  readonly platform?: Platform;
}

const detected = platformFrom(typeof navigator === 'undefined' ? '' : navigator.userAgent);

/** The status text for a save state (contracts/ui.md §4). */
export function autosaveText(status: SaveStatus): string {
  return t(status === 'saved' ? 'autosave.saved' : 'autosave.saving');
}

/** The button text: "Undo" alone, or naming the action ("Undo typing in the source"). */
export function historyLabel(direction: 'undo' | 'redo', action: ActionName | null): string {
  if (!action) return t(direction === 'undo' ? 'toolbar.undo' : 'toolbar.redo');
  return t(direction === 'undo' ? 'toolbar.undoAction' : 'toolbar.redoAction', { action: t(action.nameKey, action.params) });
}

/** `aria-keyshortcuts` for a command, e.g. "Control+Z" or "Meta+Shift+Z". */
export function ariaShortcuts(command: KeyCommand, platform: Platform): string {
  return chordsFor(command, platform)
    .map((c) => chordId(c, platform).replace(/\bCtrl\b/g, 'Control').replace(/\bCmd\b/g, 'Meta'))
    .join(' ');
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
const MOVES: Readonly<Record<string, (index: number, count: number) => number>> = {
  ArrowRight: (i, n) => (i + 1) % n,
  ArrowLeft: (i, n) => (i - 1 + n) % n,
  Home: () => 0,
  End: (_, n) => n - 1,
};

function moveFocus(event: KeyboardEvent<HTMLDivElement>): void {
  const move = MOVES[event.key];
  if (!move || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  // Text fields and selects keep their own arrow keys.
  const target = event.target as HTMLElement;
  if (target.closest('input, select, textarea, [contenteditable="true"], [role="menu"], [role="listbox"]')) return;
  const controls = [...event.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE)];
  const index = controls.findIndex((c) => c === target || c.contains(target));
  if (index < 0 || controls.length === 0) return;
  event.preventDefault();
  controls[move(index, controls.length)]?.focus();
}

export function Toolbar({ ctx, slots = defaultSlots, platform = detected }: ToolbarProps) {
  const store = useStore();
  const session = useSession();
  const contributions = useSlot(slots.toolbar);

  return (
    <div role="toolbar" aria-label={t('toolbar.label')} aria-orientation="horizontal" className="toolbar" onKeyDown={moveFocus}>
      <ActionIcon
        variant="default"
        size="lg"
        className="toolbar__undo"
        disabled={session.undoName === null}
        title={session.undoName === null ? t('toolbar.nothingToUndo') : historyLabel('undo', session.undoName)}
        aria-keyshortcuts={ariaShortcuts('undo', platform)}
        aria-label={historyLabel('undo', session.undoName)}
        onClick={() => store.undo()}
      >
        <IconArrowBackUp size={18} aria-hidden="true" />
      </ActionIcon>
      <ActionIcon
        variant="default"
        size="lg"
        className="toolbar__redo"
        disabled={session.redoName === null}
        title={session.redoName === null ? t('toolbar.nothingToRedo') : historyLabel('redo', session.redoName)}
        aria-keyshortcuts={ariaShortcuts('redo', platform)}
        aria-label={historyLabel('redo', session.redoName)}
        onClick={() => store.redo()}
      >
        <IconArrowForwardUp size={18} aria-hidden="true" />
      </ActionIcon>
      {session.projectId !== null && (
        <span className="toolbar__autosave" data-status={session.save.status}>
          {autosaveText(session.save.status)}
        </span>
      )}
      {contributions.map(({ id, Component }) => (
        <Component key={id} ctx={ctx} />
      ))}
    </div>
  );
}
