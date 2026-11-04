// Screen outline (T079; FR-009/AC3, VO-097, contracts/ui.md §7).
// Uses Tree.tsx; nodes use grid labels; the outline follows and expands to the selection.
import type { BlockEditorProps } from '../app/slots.ts';
import { useStore } from '../app/store.ts';
import { t } from '../messages/en.ts';
import { Tree, type TreeItemData } from './Tree.tsx';
import { gridLabel } from '../../core/salt/labels.ts';
import type { SaltScreen, Grid, ScrollArea, CellsRow, CellContent } from '../../core/salt/model.ts';
import type { Path } from '../../core/types.ts';

// Build a unique id for a path.
const pathId = (path: Path): string => path.length === 0 ? 'root' : `p-${path.join('-')}`;

/** Build tree items from a container recursively. */
function buildItems(container: Grid | ScrollArea, containerPath: Path): TreeItemData[] {
  const items: TreeItemData[] = [];
  for (let ri = 0; ri < container.rows.length; ri++) {
    const row = container.rows[ri]!;
    const rowPath = [...containerPath, ri];
    if (row.type === 'separator') {
      items.push({ id: pathId(rowPath), label: t('screen.type.separator') });
    } else {
      const cellsRow = row as CellsRow;
      for (let ci = 0; ci < cellsRow.cells.length; ci++) {
        const cell = cellsRow.cells[ci]!;
        const cellPath = [...containerPath, ri, ci];
        const content = cell.content;
        if (content.type === 'grid' || content.type === 'scrollArea') {
          const nestedLabel = content.type === 'grid'
            ? t(`screen.label.${gridLabel(content)}`)
            : t('screen.type.scrollArea');
          const children = buildItems(content, cellPath);
          items.push({ id: pathId(cellPath), label: nestedLabel, children: children.length > 0 ? children : undefined });
        } else if (content.type === 'empty') {
          items.push({ id: pathId(cellPath), label: t('screen.type.empty') });
        } else if (content.type === 'locked') {
          items.push({ id: pathId(cellPath), label: t('screen.type.locked') });
        } else {
          const elementLabel = elementNodeLabel(content);
          items.push({ id: pathId(cellPath), label: elementLabel });
        }
      }
    }
  }
  return items;
}

function elementNodeLabel(content: CellContent): string {
  switch (content.type) {
    case 'text': return content.text.text ? `${t('screen.type.text')}: ${content.text.text}` : t('screen.type.text');
    case 'button': return content.label.text ? `${t('screen.type.button')}: ${content.label.text}` : t('screen.type.button');
    case 'textField': return content.value.text ? `${t('screen.type.textField')}: ${content.value.text}` : t('screen.type.textField');
    case 'checkbox': return content.label.text ? `${t('screen.type.checkbox')}: ${content.label.text}` : t('screen.type.checkbox');
    case 'radioButton': return content.label.text ? `${t('screen.type.radioButton')}: ${content.label.text}` : t('screen.type.radioButton');
    case 'dropDown': return content.value.text ? `${t('screen.type.dropDown')}: ${content.value.text}` : t('screen.type.dropDown');
    case 'tree': return t('screen.type.tree');
    case 'tabBar': return t('screen.type.tabBar');
    case 'menuBar': return t('screen.type.menuBar');
    default: return t('screen.type.text');
  }
}

/** Find the tree-item id for a given canvas path. */
function pathToId(path: Path): string {
  return pathId(path);
}

export function ScreenOutline({ model, selection }: BlockEditorProps<SaltScreen>) {
  const store = useStore();

  const rootLabel = t(`screen.label.${gridLabel(model.root)}`);
  const children = buildItems(model.root, []);
  const items: TreeItemData[] = [
    {
      id: 'root',
      label: t('screen.label.Screen') + ' — ' + rootLabel,
      children: children.length > 0 ? children : undefined,
    },
  ];

  const selectedId = selection !== null ? pathToId(selection) : 'root';

  const handleSelect = (id: string): void => {
    if (id === 'root') { store.select([]); return; }
    // Parse the id back to a path.
    if (id.startsWith('p-')) {
      const path = id.slice(2).split('-').map(Number);
      store.select(path);
    }
  };

  const handleActivate = (id: string): void => {
    handleSelect(id);
  };

  return (
    <Tree
      label={t('region.outline')}
      items={items}
      selectedId={selectedId}
      onSelect={handleSelect}
      onActivate={handleActivate}
      defaultExpanded={new Set(['root'])}
    />
  );
}
