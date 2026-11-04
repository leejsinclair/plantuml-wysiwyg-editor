// FlowProperties: element label, condition, branch labels, lane, notes and lanes for the selected element
// (T154; FR-012/AC10, AC12; contracts/ui.md §8).
import type { BlockEditorProps } from '../app/slots.ts';
import { useStore, useSession } from '../app/store.ts';
import { flowDoc, resolve } from '../../core/activity/destinations.ts';
import { setText } from '../../core/activity/ops/branches.ts';
import { setLane } from '../../core/activity/ops/lanes.ts';
import { PropertyField } from '../properties/PropertyField.tsx';
import { t } from '../messages/en.ts';
import type { ScreenFlow, FlowElement } from '../../core/activity/model.ts';
import { LaneList } from './LaneList.tsx';
import { NotesEditor } from './NotesEditor.tsx';

export function FlowProperties({ blockKey, model, selection, readOnly }: BlockEditorProps<ScreenFlow>) {
  const store = useStore();
  const session = useSession();

  const getDoc = () => {
    const state = store.getState();
    const view = session.blocks.find((b) => b.key === blockKey);
    if (!state || !view) return null;
    const text = state.source.slice(view.start, view.end);
    return flowDoc(text, view.start);
  };

  const path = session.selection?.blockKey === blockKey ? (session.selection.path ?? null) : null;
  const resolved = path && model ? resolve(model, path) : null;
  const element: FlowElement | null = resolved?.type === 'element' ? resolved.element : null;

  const lanes = model?.lanes ?? [];
  const elementLane = element && 'lane' in element ? (element.lane ?? null) : null;

  return (
    <div className="flow-properties">
      {element && element.kind === 'step' && (
        <PropertyField
          key={`label-${path?.join('.')}`}
          label={t('flow.props.label')}
          value={element.label.text}
          readOnly={readOnly}
          blockKey={blockKey}
          onCommit={(value) => {
            const doc = getDoc();
            if (!doc || !path) return { ok: false as const, messageKey: 'flow.refused.notFound' };
            return setText(doc, path, 'label', value);
          }}
        />
      )}
      {element && element.kind === 'decision' && (
        <>
          <PropertyField
            key={`condition-${path?.join('.')}`}
            label={t('flow.props.condition')}
            value={element.branches[0]?.condition?.text ?? ''}
            readOnly={readOnly}
            blockKey={blockKey}
            onCommit={(value) => {
              const doc = getDoc();
              if (!doc || !path) return { ok: false as const, messageKey: 'flow.refused.notFound' };
              return setText(doc, path, 'condition', value);
            }}
          />
          {element.branches.map((branch, b) => (
            <PropertyField
              key={`branch-${b}-${path?.join('.')}`}
              label={t('flow.props.branchLabel')}
              value={branch.label?.text ?? ''}
              readOnly={readOnly}
              blockKey={blockKey}
              onCommit={(value) => {
                const doc = getDoc();
                if (!doc || !path) return { ok: false as const, messageKey: 'flow.refused.notFound' };
                return setText(doc, [...path, b], 'branchLabel', value);
              }}
            />
          ))}
        </>
      )}
      {element && element.kind === 'loop' && (
        <>
          <PropertyField
            key={`loopIs-${path?.join('.')}`}
            label={t('flow.props.loopIs')}
            value={element.labels.is?.text ?? ''}
            readOnly={readOnly}
            blockKey={blockKey}
            onCommit={(value) => {
              const doc = getDoc();
              if (!doc || !path) return { ok: false as const, messageKey: 'flow.refused.notFound' };
              return setText(doc, path, 'loopIs', value);
            }}
          />
          <PropertyField
            key={`loopExit-${path?.join('.')}`}
            label={t('flow.props.loopExit')}
            value={element.labels.exit?.text ?? ''}
            readOnly={readOnly}
            blockKey={blockKey}
            onCommit={(value) => {
              const doc = getDoc();
              if (!doc || !path) return { ok: false as const, messageKey: 'flow.refused.notFound' };
              return setText(doc, path, 'loopExit', value);
            }}
          />
        </>
      )}
      {element && lanes.length > 0 && elementLane !== undefined && (
        <div className="flow-properties__lane">
          <label htmlFor="element-lane" className="flow-properties__lane-label">
            {t('flow.props.lane')}
          </label>
          <select
            id="element-lane"
            value={elementLane ?? ''}
            disabled={readOnly}
            onChange={(e) => {
              const doc = getDoc();
              if (!doc || !path) return;
              store.applyOp(setLane(doc, path, e.currentTarget.value), { blockKey });
            }}
          >
            {lanes.length === 0 && (
              <option value="">{t('flow.props.noLanes')}</option>
            )}
            {lanes.map((lane) => (
              <option key={lane.name} value={lane.name}>{lane.name}</option>
            ))}
          </select>
        </div>
      )}
      {model && (
        <LaneList blockKey={blockKey} model={model} selection={selection} readOnly={readOnly} />
      )}
      {model && path && (
        <NotesEditor blockKey={blockKey} model={model} selection={selection} readOnly={readOnly} />
      )}
    </div>
  );
}
