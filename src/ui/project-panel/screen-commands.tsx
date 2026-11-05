// The project panel's screen commands (T130; FR-011/AC1, AC5, AC7–AC9, AC12, FR-015/AC4, contracts/ui.md §5).
//
// - `AddScreenCommand` ("Add screen", panel header) adds an empty screen after the last one and opens it.
// - `BlockCommands` (beside each block): screens get "Rename", "Duplicate", "Move up", "Move down" and "Delete";
//   other content gets "Move up", "Move down" and "Delete" (as a unit). The flow's commands belong to the flow
//   story. Each control's accessible name adds the block it acts on ("Rename Login").
// - `ScreenNameSection` is the open screen's own name property, shown in the properties panel with nothing
//   selected (FR-016/AC2).
//
// Renaming or deleting a screen that flow steps link to first shows the link warning; an unlinked delete runs at
// once and is announced in a notice with "Undo". After deleting the open block, its neighbour opens. Every
// operation is one history entry; block keys, the flow and last working versions follow the blocks (`order`).
import { useState } from 'react';
import type { BlockView } from '../../core/project/project.ts';
import { addScreen, deleteBlock, duplicateScreen, moveBlock, renameBlock, type BlockOpOk, type Direction } from '../../core/project/screens.ts';
import type { SlotProps } from '../app/slots.ts';
import { useSession, useStore, type Store } from '../app/store.ts';
import { t } from '../messages/en.ts';
import { notices as appNotices, type NoticesStore } from '../notices/Notices.tsx';
import { blockLabel } from './ProjectPanel.tsx';
import { LinkWarningDialog } from './LinkWarningDialog.tsx';
import { RenameField } from './RenameField.tsx';
import { ActionIcon, Menu } from '@mantine/core';
import { IconArrowDown, IconArrowUp, IconCopy, IconDotsVertical, IconPencil, IconPlus, IconTrash } from '@tabler/icons-react';

/** Applies a block operation as one history entry, then opens the block it names. */
function apply(store: Store, op: BlockOpOk, blockKey: string, announce = true): void {
  store.applyEdits(op.edits, {
    nameKey: op.historyName,
    params: op.announceParams,
    blockKey,
    order: op.order,
    ...(announce ? { announceKey: op.announceKey, announceParams: op.announceParams } : {}),
  });
  const key = op.open === null ? undefined : store.getState()?.keys[op.open];
  if (key !== undefined) store.openBlock(key);
}

const indexOf = (store: Store, key: string): number => store.getState()?.keys.indexOf(key) ?? -1;

interface Warning {
  readonly title: string;
  readonly body: string;
  readonly steps: readonly string[];
  proceed(): void;
}

/** The rename and delete commands shared by the panel entry and the name property, with their link warning. */
function useBlockActions(view: BlockView | null, notices: NoticesStore) {
  const store = useStore();
  const [warning, setWarning] = useState<Warning | null>(null);

  /** Returns a refusal message, or `null` once the rename is applied or waiting for the warning. */
  const rename = (typed: string): string | null => {
    if (!view) return null;
    const index = indexOf(store, view.key);
    if (index === -1) return null;
    const label = blockLabel(view);
    const op = renameBlock(store.getState()!, index, typed, { label });
    if (!op.ok) return t(op.messageKey, op.params);
    if (op.edits.length === 0) return null;
    if (op.affected.length === 0) {
      apply(store, op, view.key);
      return null;
    }
    setWarning({
      title: t('screens.warning.renameTitle', { name: label }),
      body: t('screens.warning.renameBody', { name: label, newName: op.name, count: op.affected.length }),
      steps: op.affected.map((s) => s.label.text),
      proceed: () => apply(store, op, view.key),
    });
    return null;
  };

  const remove = (): void => {
    if (!view) return;
    const index = indexOf(store, view.key);
    if (index === -1) return;
    const op = deleteBlock(store.getState()!, index, { label: blockLabel(view) });
    if (!op.ok) {
      store.applyOp(op);
      return;
    }
    const run = (): void => {
      const wasOpen = store.getSnapshot().openBlockKey === view.key;
      apply(store, wasOpen ? op : { ...op, open: null }, view.key, false);
      notices.show({
        kind: 'blockDeleted',
        key: 'blockDeleted',
        messageKey: op.announceKey,
        params: op.announceParams,
        actions: [
          {
            labelKey: 'notice.undo',
            run: () => {
              // Only the deletion this notice is about is undone.
              const top = store.getSnapshot().undoName;
              if (top?.nameKey === op.historyName && top.params?.['name'] === op.announceParams['name']) store.undo();
            },
          },
        ],
      });
    };
    if (op.affected.length === 0) {
      run();
      return;
    }
    const label = blockLabel(view);
    setWarning({
      title: t('screens.warning.deleteTitle', { name: label }),
      body: t('screens.warning.deleteBody', { name: label, count: op.affected.length }),
      steps: op.affected.map((s) => s.label.text),
      proceed: run,
    });
  };

  const dialog = warning && (
    <LinkWarningDialog
      title={warning.title}
      body={warning.body}
      steps={warning.steps}
      onProceed={() => {
        setWarning(null);
        warning.proceed();
      }}
      onCancel={() => setWarning(null)}
    />
  );

  return { rename, remove, dialog };
}

export function AddScreenCommand(_props: SlotProps) {
  const store = useStore();
  const session = useSession();
  const onClick = (): void => {
    const state = store.getState();
    const historyKey = session.openBlockKey ?? state?.keys[0];
    if (!state || historyKey === undefined) return;
    apply(store, addScreen(state), historyKey);
  };
  return (
    <button type="button" onClick={onClick} disabled={session.projectId === null}>
      <IconPlus size={16} aria-hidden="true" />
      {t('screens.add')}
    </button>
  );
}

export interface BlockCommandsProps extends SlotProps {
  readonly blockKey?: string;
  /** Where the delete notice goes; the application's notices by default. */
  readonly notices?: NoticesStore;
}

export function BlockCommands({ blockKey, notices = appNotices }: BlockCommandsProps) {
  const store = useStore();
  const session = useSession();
  const view = session.blocks.find((b) => b.key === blockKey) ?? null;
  const { rename, remove, dialog } = useBlockActions(view, notices);
  const [renaming, setRenaming] = useState(false);
  if (!view || view.kind === 'flow') return null;

  const label = blockLabel(view);
  const same = session.blocks.filter((b) => b.kind === view.kind);
  const at = same.findIndex((b) => b.key === view.key);

  const move = (direction: Direction): void => {
    const index = indexOf(store, view.key);
    if (index === -1) return;
    const op = moveBlock(store.getState()!, index, direction, { label });
    if (op.ok) apply(store, op, view.key);
    else store.applyOp(op);
  };

  const duplicate = (): void => {
    const index = indexOf(store, view.key);
    if (index === -1) return;
    const op = duplicateScreen(store.getState()!, index, { label });
    if (op.ok) apply(store, op, view.key);
  };

  const isScreen = view.kind === 'screen';
  return (
    <>
      <Menu position="bottom-end" withinPortal shadow="md">
        <Menu.Target>
          <ActionIcon variant="subtle" color="gray" size="sm" aria-label={t('screens.actionsFor', { name: label })}>
            <IconDotsVertical size={16} aria-hidden="true" />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown aria-label={t('screens.actionsFor', { name: label })}>
          {isScreen && (
            <Menu.Item leftSection={<IconPencil size={16} aria-hidden="true" />} onClick={() => setRenaming(true)}>
              {t('screens.rename')}
            </Menu.Item>
          )}
          {isScreen && (
            <Menu.Item leftSection={<IconCopy size={16} aria-hidden="true" />} onClick={duplicate}>
              {t('screens.duplicate')}
            </Menu.Item>
          )}
          <Menu.Item leftSection={<IconArrowUp size={16} aria-hidden="true" />} disabled={at <= 0} onClick={() => move('up')}>
            {t('screens.moveUp')}
          </Menu.Item>
          <Menu.Item leftSection={<IconArrowDown size={16} aria-hidden="true" />} disabled={at === -1 || at >= same.length - 1} onClick={() => move('down')}>
            {t('screens.moveDown')}
          </Menu.Item>
          <Menu.Divider />
          <Menu.Item color="red" leftSection={<IconTrash size={16} aria-hidden="true" />} onClick={remove}>
            {t('screens.delete')}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      {isScreen && renaming && (
        <div className="project-panel__rename">
          <RenameField
            label={t('screens.nameLabel')}
            value={view.name ?? ''}
            autoFocus
            onCommit={(typed) => {
              const refusal = rename(typed);
              if (refusal === null) setRenaming(false);
              return refusal;
            }}
            onCancel={() => setRenaming(false)}
          />
        </div>
      )}
      {dialog}
    </>
  );
}

/** The open screen's name, in the properties panel when nothing is selected. */
export function ScreenNameSection({ ctx }: SlotProps) {
  const session = useSession();
  const view = session.blocks.find((b) => b.key === ctx.block?.key) ?? null;
  const { rename, dialog } = useBlockActions(view, appNotices);
  if (!view || view.kind !== 'screen') return null;
  return (
    <>
      <RenameField key={view.key} label={t('screens.nameLabel')} value={view.name ?? ''} readOnly={ctx.block?.readOnly ?? false} onCommit={rename} />
      {dialog}
    </>
  );
}
