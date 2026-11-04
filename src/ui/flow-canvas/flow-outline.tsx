// Flow outline (T155; FR-009/AC13; contracts/ui.md §7). Shows the flow's tree structure using Tree.tsx.
// Each element is a tree item; decisions show their branches as children, loops show their body.
import { useMemo } from 'react';
import type { BlockEditorProps } from '../app/slots.ts';
import { useStore } from '../app/store.ts';
import { Tree, type TreeItemData } from '../outline/Tree.tsx';
import { walk } from '../../core/activity/destinations.ts';
import { t } from '../messages/en.ts';
import type { ScreenFlow, FlowElement, Branch } from '../../core/activity/model.ts';
import type { Path as AppPath } from '../../core/types.ts';

function elementLabel(element: FlowElement): string {
  switch (element.kind) {
    case 'start': return t('flow.item.start');
    case 'stop': return t(element.keyword === 'end' ? 'flow.item.end' : 'flow.item.stop');
    case 'step': return t('flow.item.step', { text: element.label.text });
    case 'decision': return t('flow.item.decision', { text: element.branches[0]?.condition?.text ?? '' });
    case 'loop': return t('flow.item.loop', { text: element.labels.is?.text ?? '' });
    case 'locked': return t('flow.item.locked');
  }
}

function branchLabel(branch: Branch, i: number): string {
  const text = branch.label?.text ?? null;
  const isEmpty = branch.path.elements.length === 0;
  if (isEmpty) {
    return text
      ? t('flow.item.emptyBranch', { text })
      : t('flow.item.emptyBranchUnlabelled', { n: i + 1 });
  }
  return text
    ? t('flow.item.branch', { text })
    : t('flow.item.branchUnlabelled', { n: i + 1 });
}

function pathToId(path: AppPath): string {
  return path.join('.');
}

function buildItems(model: ScreenFlow): TreeItemData[] {
  const refs = walk(model);
  const itemMap = new Map<string, TreeItemData>();
  const root: TreeItemData[] = [];

  for (const ref of refs) {
    const id = pathToId(ref.path);
    const element = ref.element;
    const label = elementLabel(element);

    if (element.kind === 'decision') {
      const children: TreeItemData[] = element.branches.map((branch, b) => {
        const branchId = pathToId([...ref.path, b]);
        const branchItems: TreeItemData[] = branch.path.elements.map((el, j) => {
          const childId = pathToId([...ref.path, b, j]);
          return { id: childId, label: elementLabel(el) };
        });
        const bl = branchLabel(branch, b);
        return { id: branchId, label: bl, children: branchItems.length > 0 ? branchItems : undefined };
      });
      const item: TreeItemData = { id, label, children };
      itemMap.set(id, item);
      root.push(item);
    } else if (element.kind === 'loop') {
      const bodyId = pathToId([...ref.path, 0]);
      const bodyItems: TreeItemData[] = element.body.elements.map((el, j) => {
        const childId = pathToId([...ref.path, 0, j]);
        return { id: childId, label: elementLabel(el) };
      });
      const bodyLabel = bodyItems.length === 0 ? t('flow.item.emptyBody') : t('flow.item.body');
      const bodyItem: TreeItemData = { id: bodyId, label: bodyLabel, children: bodyItems.length > 0 ? bodyItems : undefined };
      const item: TreeItemData = { id, label, children: [bodyItem] };
      itemMap.set(id, item);
      root.push(item);
    } else {
      const item: TreeItemData = { id, label };
      itemMap.set(id, item);
      root.push(item);
    }
  }

  return root;
}

function idToPath(id: string): AppPath {
  if (id === '') return [];
  return id.split('.').map(Number);
}

export function FlowOutline({ blockKey: _blockKey, model, selection, readOnly: _readOnly }: BlockEditorProps<ScreenFlow>) {
  const store = useStore();

  const items = useMemo(() => (model ? buildItems(model) : []), [model]);

  const selectedId = selection ? pathToId(selection) : null;

  const onSelect = (id: string): void => {
    store.select(idToPath(id));
  };

  const onActivate = (id: string): void => {
    store.select(idToPath(id));
  };

  if (!model) return null;

  return (
    <Tree
      label={t('flow.outline.label')}
      items={items}
      selectedId={selectedId}
      onSelect={onSelect}
      onActivate={onActivate}
      className="flow-outline"
    />
  );
}
