// The properties panel's content (FR-003, FR-015, contracts/ui.md §8). The workspace places it in its
// "Properties" region.
//
// - With an element selected, it shows that element's sections: the open block editor's `Properties`
//   (`blockEditors[kind]`, given the selection) followed by every `propertySections` entry that applies.
// - With nothing selected, the same components are given no selection and show the open block's own
//   properties (a screen's name, the flow's lanes) (VO-129).
// - A block with no visual editor or no model (other content, source-only, an error) has no properties
//   here; the panel says to change it in the source view.
// - While the block's source view is being typed in, or the project is read-only in this tab, everything
//   is read-only (FR-004/AC8).
import { useId } from 'react';
import { slots as defaultSlots, useSlot, type SlotContext, type Slots } from '../app/slots.ts';
import { useSession } from '../app/store.ts';
import { t } from '../messages/en.ts';

export interface PropertiesPanelProps {
  readonly slots?: Slots;
  /** The project is open read-only in this tab (another tab holds the edit lock). */
  readonly readOnly?: boolean;
}

export function PropertiesPanel({ slots = defaultSlots, readOnly = false }: PropertiesPanelProps) {
  const headingId = useId();
  const session = useSession();
  const editors = useSlot(slots.blockEditors);
  const sections = useSlot(slots.propertySections);

  const view = session.blocks.find((b) => b.key === session.openBlockKey) ?? null;
  if (!view) return <p className="properties-empty">{t('properties.noBlock')}</p>;

  const selection = session.selection?.blockKey === view.key ? session.selection.path : null;
  const sourceEditing = session.sourceEditKey === view.key;
  const blockReadOnly = readOnly || sourceEditing;
  const ctx: SlotContext = {
    projectId: session.projectId,
    block: { key: view.key, kind: view.kind, name: view.name, readOnly: blockReadOnly },
    selection,
  };
  const editor = view.kind === 'other' ? null : (editors.get(view.kind) ?? null);
  const model = view.classification.salt?.model ?? view.classification.activity?.model ?? null;
  const Properties = editor && model ? editor.Properties : null;
  const applicable = sections.filter((s) => s.appliesTo(ctx));

  const blockLabel =
    view.kind === 'other'
      ? t('properties.otherContent')
      : (view.name ?? (view.untitledNumber !== null ? t('names.untitledScreen', { n: view.untitledNumber }) : t('properties.otherContent')));
  const subject = selection !== null && editor && model ? (editor.pathLabels(model, selection).at(-1) ?? blockLabel) : blockLabel;

  return (
    <div className="properties" aria-labelledby={headingId}>
      <h2 id={headingId}>{t('properties.of', { subject })}</h2>
      {sourceEditing && <p className="properties-note">{t('properties.readOnlySourceEdit')}</p>}
      {readOnly && !sourceEditing && <p className="properties-note">{t('properties.readOnly')}</p>}
      {Properties ? (
        <Properties blockKey={view.key} model={model} selection={selection} readOnly={blockReadOnly} />
      ) : (
        <p>{t('properties.sourceOnly')}</p>
      )}
      {applicable.map(({ id, Component }) => (
        <Component key={id} ctx={ctx} />
      ))}
    </div>
  );
}
